import fs from 'node:fs'
import path from 'node:path'
import QRCode from 'qrcode'
import { Client, LocalAuth, type Chat, type Contact } from 'whatsapp-web.js'
import type { ExportableContact } from '@/lib/contact-exports'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  getWhatsAppPhoneCandidates,
  normalizeWhatsAppPhone,
} from '@/lib/utils'
import type {
  ExtractedWhatsAppContact,
  WhatsAppExtractionSnapshot,
  WhatsAppSyncProgress,
} from './types'

type CustomerTagRelation = {
  tag?: {
    name?: string | null
  } | null
}

type CustomerExtractionRow = {
  id: string
  name: string | null
  phone_normalized: string | null
  email: string | null
  city: string | null
  neighborhood: string | null
  status: string | null
  accepted_marketing: boolean | null
  contact_origin: string | null
  main_interest: string | null
  notes: string | null
  created_at: string | null
  last_contact: string | null
  customer_tags?: CustomerTagRelation[]
}

type CrmContactMap = Map<string, ExportableContact>

const EXTRACTION_ROOT = path.join(process.cwd(), 'saas-crm-temp', 'whatsapp-extraction')
const SNAPSHOT_FILE = path.join(EXTRACTION_ROOT, 'snapshot.json')
const CONTACTS_FILE = path.join(EXTRACTION_ROOT, 'contacts.json')
const AUTH_DIR = path.join(EXTRACTION_ROOT, 'auth')
const CACHE_DIR = path.join(EXTRACTION_ROOT, '.wwebjs_cache')
const CLIENT_ID = 'crm-contact-extraction'
const CAN_USE_LOCAL_FILESYSTEM = !process.env.VERCEL

function ensureExtractionDirs() {
  if (!CAN_USE_LOCAL_FILESYSTEM) {
    return
  }

  fs.mkdirSync(EXTRACTION_ROOT, { recursive: true })
  fs.mkdirSync(AUTH_DIR, { recursive: true })
  fs.mkdirSync(CACHE_DIR, { recursive: true })
}

function createInitialSnapshot(): WhatsAppExtractionSnapshot {
  return {
    status: process.env.VERCEL ? 'unsupported' : 'idle',
    isSupported: !process.env.VERCEL,
    isConnected: false,
    qrCodeDataUrl: null,
    qrUpdatedAt: null,
    lastSyncAt: null,
    contactCount: 0,
    progress: null,
    message: process.env.VERCEL
      ? 'A extração via WhatsApp Web precisa rodar no servidor Node local. Em Vercel esse fluxo não se mantém.'
      : 'Sessão ainda não iniciada.',
    error: null,
    contacts: [],
  }
}

function readJsonFile<T>(filePath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filePath)) {
      return fallback
    }

    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T
  } catch {
    return fallback
  }
}

function writeJsonFile(filePath: string, payload: unknown) {
  if (!CAN_USE_LOCAL_FILESYSTEM) {
    return
  }

  ensureExtractionDirs()
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8')
}

function sanitizeError(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  return 'Falha inesperada na integração do WhatsApp Web.'
}

function toIsoFromUnix(timestamp?: number | null) {
  if (!timestamp) return null
  return new Date(timestamp * 1000).toISOString()
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))))
}

function isDirectUserChat(chat: Chat) {
  const serializedId = chat.id?._serialized || ''

  return (
    !chat.isGroup &&
    !serializedId.endsWith('@g.us') &&
    !serializedId.endsWith('@broadcast') &&
    !serializedId.endsWith('@newsletter') &&
    serializedId !== 'status@broadcast'
  )
}

function buildContactNotes(
  existingNotes: string | null,
  messageCount: number,
  historySynced: boolean
) {
  const notes = [existingNotes || '']

  notes.push(`Extracao WhatsApp Web: ${messageCount} mensagem(ns) carregadas.`)

  if (!historySynced) {
    notes.push('Historico completo nao confirmou sincronizacao integral; revise chats grandes manualmente.')
  }

  return notes.filter(Boolean).join(' | ')
}

function getChromeExecutablePath() {
  const candidates = [
    process.env.WHATSAPP_WEB_CHROME_PATH,
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_PATH,
    process.env['PROGRAMFILES']
      ? path.join(process.env['PROGRAMFILES'], 'Google', 'Chrome', 'Application', 'chrome.exe')
      : '',
    process.env['PROGRAMFILES(X86)']
      ? path.join(process.env['PROGRAMFILES(X86)'], 'Google', 'Chrome', 'Application', 'chrome.exe')
      : '',
    process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe')
      : '',
    process.env['PROGRAMFILES']
      ? path.join(process.env['PROGRAMFILES'], 'Microsoft', 'Edge', 'Application', 'msedge.exe')
      : '',
    process.env['PROGRAMFILES(X86)']
      ? path.join(process.env['PROGRAMFILES(X86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe')
      : '',
    process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, 'Microsoft', 'Edge', 'Application', 'msedge.exe')
      : '',
  ].filter((candidate): candidate is string => Boolean(candidate))

  return candidates.find(candidate => fs.existsSync(candidate)) || undefined
}

async function buildCrmContactMap() {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('customers')
    .select(`
      id,
      name,
      phone_normalized,
      email,
      city,
      neighborhood,
      status,
      accepted_marketing,
      contact_origin,
      main_interest,
      notes,
      created_at,
      last_contact,
      customer_tags(tag:tags(name))
    `)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  const map: CrmContactMap = new Map()

  for (const customer of (data || []) as CustomerExtractionRow[]) {
    const contact: ExportableContact = {
      id: customer.id,
      name: customer.name || 'Sem nome',
      phone: customer.phone_normalized || '',
      email: customer.email,
      city: customer.city,
      neighborhood: customer.neighborhood,
      status: customer.status,
      acceptedMarketing: Boolean(customer.accepted_marketing),
      contactOrigin: customer.contact_origin,
      mainInterest: customer.main_interest,
      notes: customer.notes,
      createdAt: customer.created_at,
      lastContact: customer.last_contact,
      tags: (customer.customer_tags || [])
        .map(item => item.tag?.name)
        .filter((value: string | null | undefined): value is string => Boolean(value)),
    }

    for (const candidate of getWhatsAppPhoneCandidates(customer.phone_normalized || '')) {
      if (!map.has(candidate)) {
        map.set(candidate, contact)
      }
    }
  }

  return map
}

async function safeGetContact(chat: Chat) {
  try {
    return await chat.getContact()
  } catch {
    return null
  }
}

async function safeGetChatLabels(chat: Chat) {
  try {
    return await chat.getLabels()
  } catch {
    return []
  }
}

async function safeSyncHistory(chat: Chat) {
  try {
    return await chat.syncHistory()
  } catch {
    return false
  }
}

async function safeFetchMessages(chat: Chat) {
  try {
    return await chat.fetchMessages({ limit: Number.POSITIVE_INFINITY })
  } catch {
    return []
  }
}

class WhatsAppExtractionManager {
  private client: Client | null = null
  private starting = false
  private syncing = false
  private snapshot: WhatsAppExtractionSnapshot

  constructor() {
    const persistedSnapshot = CAN_USE_LOCAL_FILESYSTEM
      ? readJsonFile<WhatsAppExtractionSnapshot>(SNAPSHOT_FILE, createInitialSnapshot())
      : createInitialSnapshot()
    const persistedContacts = CAN_USE_LOCAL_FILESYSTEM
      ? readJsonFile<ExtractedWhatsAppContact[]>(CONTACTS_FILE, [])
      : []

    this.snapshot = {
      ...createInitialSnapshot(),
      ...persistedSnapshot,
      contacts: persistedContacts,
      isSupported: !process.env.VERCEL,
      status: process.env.VERCEL ? 'unsupported' : 'idle',
      isConnected: false,
      qrCodeDataUrl: null,
      qrUpdatedAt: null,
      progress: null,
      message: process.env.VERCEL
        ? 'A extração via WhatsApp Web precisa rodar no servidor Node local. Em Vercel esse fluxo não se mantém.'
        : persistedContacts.length > 0
          ? 'Última extração carregada do disco. Gere a sessão novamente para uma nova sincronização.'
          : 'Sessão ainda não iniciada.',
    }
  }

  private persistSnapshot() {
    if (!CAN_USE_LOCAL_FILESYSTEM) {
      return
    }

    writeJsonFile(SNAPSHOT_FILE, { ...this.snapshot, contacts: undefined })
    writeJsonFile(CONTACTS_FILE, this.snapshot.contacts)
  }

  private setSnapshot(partial: Partial<WhatsAppExtractionSnapshot>) {
    this.snapshot = {
      ...this.snapshot,
      ...partial,
    }

    this.persistSnapshot()
  }

  getSnapshot() {
    return this.snapshot
  }

  startSession() {
    if (process.env.VERCEL) {
      this.setSnapshot({
        status: 'unsupported',
        isSupported: false,
        isConnected: false,
        message: 'A extração via WhatsApp Web precisa rodar no servidor Node local. Em Vercel esse fluxo não se mantém.',
      })
      return this.snapshot
    }

    if (this.client || this.starting) {
      return this.snapshot
    }

    this.starting = true
    this.setSnapshot({
      status: 'starting',
      isSupported: true,
      isConnected: false,
      qrCodeDataUrl: null,
      qrUpdatedAt: null,
      error: null,
      message: 'Inicializando sessão do WhatsApp Web...',
    })

    const executablePath = getChromeExecutablePath()

    this.client = new Client({
      authStrategy: new LocalAuth({
        clientId: CLIENT_ID,
        dataPath: AUTH_DIR,
      }),
      puppeteer: {
        headless: true,
        executablePath,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
        ],
      },
      webVersionCache: {
        type: 'local',
        path: CACHE_DIR,
      },
    })

    this.client.on('loading_screen', (percent, message) => {
      this.setSnapshot({
        message: `Carregando WhatsApp Web (${percent}%)${message ? ` - ${message}` : ''}`,
      })
    })

    this.client.on('qr', async qr => {
      const qrCodeDataUrl = await QRCode.toDataURL(qr, {
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 320,
      })

      this.setSnapshot({
        status: 'qr',
        qrCodeDataUrl,
        qrUpdatedAt: new Date().toISOString(),
        error: null,
        message: 'Escaneie o QR Code com o WhatsApp do celular.',
      })
    })

    this.client.on('authenticated', () => {
      this.setSnapshot({
        status: 'authenticated',
        isConnected: true,
        error: null,
        message: 'Sessão autenticada. Finalizando conexão...',
      })
    })

    this.client.on('ready', () => {
      this.setSnapshot({
        status: 'ready',
        isConnected: true,
        qrCodeDataUrl: null,
        error: null,
        message: 'WhatsApp Web conectado. Você já pode sincronizar os contatos.',
      })
    })

    this.client.on('auth_failure', message => {
      this.setSnapshot({
        status: 'error',
        isConnected: false,
        error: `Falha na autenticação: ${message}`,
        message: 'A autenticação da sessão falhou.',
      })
    })

    this.client.on('disconnected', reason => {
      this.client = null
      this.starting = false
      this.syncing = false

      this.setSnapshot({
        status: 'idle',
        isConnected: false,
        qrCodeDataUrl: null,
        qrUpdatedAt: null,
        progress: null,
        message: `Sessão desconectada${reason ? `: ${reason}` : '.'}`,
      })
    })

    void this.client
      .initialize()
      .catch(error => {
        this.client = null
        this.setSnapshot({
          status: 'error',
          isConnected: false,
          error: sanitizeError(error),
          message:
            'Falha ao inicializar o WhatsApp Web. Confirme se Chrome ou Edge estão instalados nesta máquina.',
        })
      })
      .finally(() => {
        this.starting = false
      })

    return this.snapshot
  }

  async logout() {
    const activeClient = this.client

    this.client = null
    this.starting = false
    this.syncing = false

    if (activeClient) {
      try {
        await activeClient.logout()
      } catch {}

      try {
        await activeClient.destroy()
      } catch {}
    }

    if (CAN_USE_LOCAL_FILESYSTEM) {
      try {
        fs.rmSync(path.join(AUTH_DIR, `session-${CLIENT_ID}`), { recursive: true, force: true })
      } catch {}
    }

    this.setSnapshot({
      ...createInitialSnapshot(),
      contacts: this.snapshot.contacts,
      lastSyncAt: this.snapshot.lastSyncAt,
      contactCount: this.snapshot.contactCount,
      message: 'Sessão encerrada. Gere um novo QR Code para reconectar.',
    })

    return this.snapshot
  }

  startSync() {
    if (!this.client) {
      throw new Error('Inicie a sessão e escaneie o QR Code antes de sincronizar.')
    }

    if (this.syncing) {
      return this.snapshot
    }

    this.syncing = true
    this.setSnapshot({
      status: 'syncing',
      error: null,
      progress: {
        processedChats: 0,
        totalChats: 0,
        currentChat: null,
      },
      message: 'Sincronizando contatos e histórico do WhatsApp Web...',
    })

    void this.runSync()
      .catch(error => {
        this.setSnapshot({
          status: 'error',
          isConnected: Boolean(this.client),
          error: sanitizeError(error),
          progress: null,
          message: 'A sincronização falhou.',
        })
      })
      .finally(() => {
        this.syncing = false
      })

    return this.snapshot
  }

  private async buildLabelMap() {
    const map = new Map<string, string[]>()

    if (!this.client) {
      return map
    }

    const labels = await this.client.getLabels()

    for (const label of labels) {
      const chats = await label.getChats()

      for (const chat of chats) {
        const current = map.get(chat.id._serialized) || []
        current.push(label.name)
        map.set(chat.id._serialized, uniqueStrings(current))
      }
    }

    return map
  }

  private async runSync() {
    if (!this.client) {
      throw new Error('Cliente do WhatsApp Web indisponível.')
    }

    const crmMap = await buildCrmContactMap()
    const labelMap = await this.buildLabelMap()
    const chats = (await this.client.getChats()).filter(isDirectUserChat)
    const contacts: ExtractedWhatsAppContact[] = []

    this.setSnapshot({
      status: 'syncing',
      progress: {
        processedChats: 0,
        totalChats: chats.length,
        currentChat: null,
      },
    })

    for (let index = 0; index < chats.length; index += 1) {
      const chat = chats[index]
      const contact = await safeGetContact(chat)
      const phone = this.extractPhone(chat, contact)

      const progress: WhatsAppSyncProgress = {
        processedChats: index,
        totalChats: chats.length,
        currentChat: contact?.pushname || contact?.name || chat.name || phone || 'Contato sem nome',
      }

      this.setSnapshot({
        status: 'syncing',
        progress,
        message: `Lendo ${index + 1} de ${chats.length} conversa(s)...`,
      })

      if (!phone) {
        continue
      }

      const historySynced = await safeSyncHistory(chat)
      const messages = await safeFetchMessages(chat)
      const chatLabels = uniqueStrings([
        ...(labelMap.get(chat.id._serialized) || []),
        ...(await safeGetChatLabels(chat)).map(label => label.name),
        ...(contact?.labels || []),
      ])

      const crmContact = this.findCrmMatch(phone, crmMap)
      const latestMessage = messages.at(-1)
      const lastMessageAt =
        toIsoFromUnix(latestMessage?.timestamp || chat.timestamp) || crmContact?.lastContact || null

      contacts.push({
        id: `wa-${chat.id._serialized}`,
        name:
          contact?.name ||
          contact?.pushname ||
          contact?.shortName ||
          chat.name ||
          crmContact?.name ||
          phone,
        phone,
        email: crmContact?.email || null,
        city: crmContact?.city || null,
        neighborhood: crmContact?.neighborhood || null,
        status: crmContact?.status || 'ativo',
        acceptedMarketing: crmContact?.acceptedMarketing || false,
        contactOrigin: crmContact?.contactOrigin || 'whatsapp_web',
        mainInterest: crmContact?.mainInterest || null,
        notes: buildContactNotes(crmContact?.notes || null, messages.length, historySynced),
        createdAt: crmContact?.createdAt || null,
        lastContact: lastMessageAt,
        tags: uniqueStrings([...(crmContact?.tags || []), ...chatLabels]),
        source: 'whatsapp_web',
        sourceName: contact?.pushname || contact?.name || null,
        whatsappLabels: chatLabels,
        messageCount: messages.length,
        lastMessagePreview: latestMessage?.body || chat.lastMessage?.body || null,
        lastMessageAt,
        hasCrmMatch: Boolean(crmContact),
      })
    }

    contacts.sort((left, right) => {
      const leftValue = left.lastMessageAt ? new Date(left.lastMessageAt).getTime() : 0
      const rightValue = right.lastMessageAt ? new Date(right.lastMessageAt).getTime() : 0
      return rightValue - leftValue
    })

    this.setSnapshot({
      status: 'ready',
      isConnected: true,
      contacts,
      contactCount: contacts.length,
      lastSyncAt: new Date().toISOString(),
      progress: {
        processedChats: chats.length,
        totalChats: chats.length,
        currentChat: null,
      },
      message: `${contacts.length} contato(s) sincronizados do WhatsApp Web.`,
      error: null,
    })
  }

  private extractPhone(chat: Chat, contact: Contact | null) {
    return normalizeWhatsAppPhone(
      contact?.number || chat.id?.user || chat.id?._serialized.replace(/@.*/, '') || ''
    )
  }

  private findCrmMatch(phone: string, crmMap: CrmContactMap) {
    for (const candidate of getWhatsAppPhoneCandidates(phone)) {
      const match = crmMap.get(candidate)
      if (match) {
        return match
      }
    }

    return null
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __whatsappExtractionManager__: WhatsAppExtractionManager | undefined
}

export function getWhatsAppExtractionManager() {
  if (!globalThis.__whatsappExtractionManager__) {
    globalThis.__whatsappExtractionManager__ = new WhatsAppExtractionManager()
  }

  return globalThis.__whatsappExtractionManager__
}
