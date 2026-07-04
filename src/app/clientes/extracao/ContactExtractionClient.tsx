'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import {
  Download,
  FileJson,
  FileSpreadsheet,
  FileText,
  Power,
  QrCode,
  RefreshCw,
  Search,
  Smartphone,
} from 'lucide-react'
import {
  buildContactsWorkbook,
  contactsToCsv,
  contactsToJson,
  contactsToVcf,
  type ExportableContact,
} from '@/lib/contact-exports'
import { formatDateTime, formatPhone } from '@/lib/utils'
import type {
  ExtractedWhatsAppContact,
  WhatsAppExtractionSnapshot,
} from '@/lib/whatsapp-web/types'

type ContactExtractionClientProps = {
  initialContacts: ExportableContact[]
}

type DataSource = 'crm' | 'whatsapp_web'

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function downloadBlob(content: BlobPart, type: string, filename: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function exportWorkbook(contacts: ExportableContact[], filename: string, bookType: XLSX.BookType) {
  const workbook = buildContactsWorkbook(contacts)
  const buffer = XLSX.write(workbook, { type: 'array', bookType })
  downloadBlob(buffer, 'application/octet-stream', filename)
}

function exportPdf(contacts: ExportableContact[], title: string) {
  const rows = contacts.map(contact => `
    <tr>
      <td>${escapeHtml(contact.name)}</td>
      <td>${escapeHtml(formatPhone(contact.phone) || contact.phone)}</td>
      <td>${escapeHtml(contact.city || '')}</td>
      <td>${escapeHtml(contact.email || '')}</td>
      <td>${escapeHtml(contact.tags.join(', '))}</td>
    </tr>
  `).join('')

  const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=1200,height=900')

  if (!printWindow) {
    throw new Error('Nao foi possivel abrir a janela de impressao. Libere pop-ups e tente novamente.')
  }

  printWindow.document.write(`
    <!doctype html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(title)}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 24px; color: #111827; }
          h1 { margin: 0 0 8px; font-size: 22px; }
          p { margin: 0 0 20px; color: #4b5563; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th, td { border: 1px solid #d1d5db; padding: 8px; text-align: left; vertical-align: top; }
          th { background: #f3f4f6; }
          @media print { body { margin: 12px; } }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(title)}</h1>
        <p>Total: ${contacts.length} contato(s)</p>
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Telefone</th>
              <th>Cidade</th>
              <th>E-mail</th>
              <th>Etiquetas</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <script>
          window.onload = () => {
            window.print();
          };
        </script>
      </body>
    </html>
  `)
  printWindow.document.close()
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function getStatusMeta(status?: WhatsAppExtractionSnapshot['status']) {
  switch (status) {
    case 'qr':
      return {
        label: 'QR pronto',
        borderColor: 'rgba(251,191,36,0.35)',
        background: 'rgba(120,53,15,0.18)',
        color: '#fde68a',
      }
    case 'authenticated':
    case 'starting':
      return {
        label: 'Conectando',
        borderColor: 'rgba(96,165,250,0.35)',
        background: 'rgba(30,64,175,0.18)',
        color: '#bfdbfe',
      }
    case 'ready':
      return {
        label: 'Conectado',
        borderColor: 'rgba(74,222,128,0.35)',
        background: 'rgba(20,83,45,0.18)',
        color: '#bbf7d0',
      }
    case 'syncing':
      return {
        label: 'Sincronizando',
        borderColor: 'rgba(168,85,247,0.35)',
        background: 'rgba(88,28,135,0.18)',
        color: '#e9d5ff',
      }
    case 'unsupported':
      return {
        label: 'Somente local',
        borderColor: 'rgba(251,191,36,0.35)',
        background: 'rgba(120,53,15,0.18)',
        color: '#fde68a',
      }
    case 'error':
      return {
        label: 'Erro',
        borderColor: 'rgba(248,113,113,0.35)',
        background: 'rgba(127,29,29,0.18)',
        color: '#fecaca',
      }
    default:
      return {
        label: 'Desconectado',
        borderColor: 'rgba(148,163,184,0.35)',
        background: 'rgba(30,41,59,0.35)',
        color: '#cbd5e1',
      }
  }
}

export default function ContactExtractionClient({ initialContacts }: ContactExtractionClientProps) {
  const [source, setSource] = useState<DataSource>('crm')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('todos')
  const [formatMessage, setFormatMessage] = useState('')
  const [formatError, setFormatError] = useState('')
  const [remoteError, setRemoteError] = useState('')
  const [session, setSession] = useState<WhatsAppExtractionSnapshot | null>(null)
  const [sessionLoading, setSessionLoading] = useState(true)
  const [sessionAction, setSessionAction] = useState<'start' | 'sync' | 'logout' | null>(null)

  const refreshSession = useCallback(async () => {
    try {
      const response = await fetch('/api/clientes/extracao/whatsapp/session', {
        cache: 'no-store',
      })
      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload.error || 'Falha ao consultar a sessão do WhatsApp Web.')
      }

      setSession(payload)
      setRemoteError('')
    } catch (error) {
      setRemoteError(error instanceof Error ? error.message : 'Falha ao consultar a sessão do WhatsApp Web.')
    } finally {
      setSessionLoading(false)
    }
  }, [])

  useEffect(() => {
    void refreshSession()

    const interval = window.setInterval(() => {
      void refreshSession()
    }, 4000)

    return () => window.clearInterval(interval)
  }, [refreshSession])

  const whatsappContacts = session?.contacts || []
  const activeContacts = source === 'crm'
    ? initialContacts
    : whatsappContacts

  const filteredContacts = useMemo(() => {
    const normalizedQuery = normalizeText(query.trim())

    return activeContacts.filter(contact => {
      if (statusFilter !== 'todos' && (contact.status || 'ativo') !== statusFilter) {
        return false
      }

      if (!normalizedQuery) {
        return true
      }

      const searchable = normalizeText([
        contact.name,
        contact.phone,
        contact.email || '',
        contact.city || '',
        contact.tags.join(' '),
      ].join(' '))

      return searchable.includes(normalizedQuery)
    })
  }, [activeContacts, query, source, statusFilter])

  const totalWithTags = filteredContacts.filter(contact => contact.tags.length > 0).length
  const totalWithCity = filteredContacts.filter(contact => Boolean(contact.city)).length
  const whatsappMatchedInCrm = whatsappContacts.filter(contact => contact.hasCrmMatch).length
  const sessionStatus = getStatusMeta(session?.status)
  const filenameBase = source === 'crm' ? 'contatos-crm' : 'contatos-whatsapp-web'

  async function handleSessionAction(
    action: 'start' | 'sync' | 'logout',
    path: string,
    method: 'POST' | 'DELETE'
  ) {
    try {
      setSessionAction(action)
      setRemoteError('')
      const response = await fetch(path, { method })
      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload.error || 'Falha ao executar a ação.')
      }

      setSession(payload)
    } catch (error) {
      setRemoteError(error instanceof Error ? error.message : 'Falha ao executar a ação.')
    } finally {
      setSessionAction(null)
    }
  }

  function runExport(action: () => void, successLabel: string) {
    try {
      setFormatError('')
      action()
      setFormatMessage(successLabel)
    } catch (error) {
      setFormatMessage('')
      setFormatError(error instanceof Error ? error.message : 'Falha ao exportar contatos.')
    }
  }

  const latestSyncLabel = session?.lastSyncAt ? formatDateTime(session.lastSyncAt) : 'Ainda não sincronizado'
  const progressPercent = session?.progress?.totalChats
    ? Math.round((session.progress.processedChats / session.progress.totalChats) * 100)
    : 0

  return (
    <div className="page-content space-y-5">
      <div className="card p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Fonte dos contatos</h2>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
              Use a base consolidada do CRM ou abra uma sessão local do WhatsApp Web com QR Code.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={source === 'crm' ? 'btn-primary' : 'btn-secondary'}
              onClick={() => setSource('crm')}>
              CRM atual
            </button>
            <button
              type="button"
              className={source === 'whatsapp_web' ? 'btn-primary' : 'btn-secondary'}
              onClick={() => setSource('whatsapp_web')}>
              WhatsApp Web
            </button>
          </div>
        </div>
      </div>

      {source === 'whatsapp_web' && (
        <div className="card p-5 space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">Sessão WhatsApp Web</h2>
              <p className="text-sm mt-1 leading-6" style={{ color: 'var(--text-muted)' }}>
                O QR Code e a automação rodam no servidor Node local desta instalação. A sincronização tenta carregar
                todo o histórico disponível do chat e enriquece cidade e etiquetas com os dados já existentes no CRM.
              </p>
            </div>

            <div
              className="inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium"
              style={{
                borderColor: sessionStatus.borderColor,
                background: sessionStatus.background,
                color: sessionStatus.color,
              }}>
              {sessionLoading ? 'Consultando sessão...' : sessionStatus.label}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-primary"
              disabled={sessionAction !== null || session?.status === 'ready' || session?.status === 'syncing'}
              onClick={() => void handleSessionAction(
                'start',
                '/api/clientes/extracao/whatsapp/session',
                'POST'
              )}>
              <QrCode size={15} />
              {sessionAction === 'start' ? 'Abrindo sessão...' : 'Gerar QR Code'}
            </button>

            <button
              type="button"
              className="btn-secondary"
              disabled={
                sessionAction !== null ||
                session?.status === 'unsupported' ||
                !session?.isConnected
              }
              onClick={() => void handleSessionAction(
                'sync',
                '/api/clientes/extracao/whatsapp/sync',
                'POST'
              )}>
              <RefreshCw size={15} />
              {sessionAction === 'sync' || session?.status === 'syncing'
                ? 'Sincronizando...'
                : 'Sincronizar contatos'}
            </button>

            <button
              type="button"
              className="btn-danger"
              disabled={sessionAction !== null || (!session?.isConnected && session?.status !== 'qr')}
              onClick={() => void handleSessionAction(
                'logout',
                '/api/clientes/extracao/whatsapp/session',
                'DELETE'
              )}>
              <Power size={15} />
              {sessionAction === 'logout' ? 'Encerrando...' : 'Encerrar sessão'}
            </button>
          </div>

          {(session?.message || session?.error || remoteError) && (
            <div
              className="rounded-lg border px-3 py-3 text-sm"
              style={{
                borderColor: remoteError || session?.error
                  ? 'rgba(248,113,113,0.35)'
                  : 'rgba(96,165,250,0.35)',
                background: remoteError || session?.error
                  ? 'rgba(127,29,29,0.18)'
                  : 'rgba(30,64,175,0.18)',
                color: remoteError || session?.error ? '#fecaca' : '#bfdbfe',
              }}>
              {remoteError || session?.error || session?.message}
            </div>
          )}

          {session?.qrCodeDataUrl && (
            <div className="grid gap-4 xl:grid-cols-[320px,1fr]">
              <div className="rounded-2xl border p-4" style={{ borderColor: 'rgba(148,163,184,0.2)' }}>
                <img
                  src={session.qrCodeDataUrl}
                  alt="QR Code do WhatsApp Web"
                  className="mx-auto h-auto w-full rounded-xl bg-white p-3"
                />
              </div>

              <div className="rounded-2xl border p-4" style={{ borderColor: 'rgba(148,163,184,0.2)' }}>
                <h3 className="font-semibold text-white">Como conectar</h3>
                <ol className="mt-3 space-y-2 text-sm leading-6" style={{ color: 'var(--text-muted)' }}>
                  <li>1. Abra o WhatsApp no celular.</li>
                  <li>2. Vá em aparelhos conectados.</li>
                  <li>3. Escaneie este QR Code.</li>
                  <li>4. Aguarde o status mudar para conectado e então clique em sincronizar.</li>
                </ol>
                <p className="text-xs mt-4" style={{ color: 'var(--text-muted)' }}>
                  Última atualização do QR: {session.qrUpdatedAt ? formatDateTime(session.qrUpdatedAt) : 'agora'}
                </p>
              </div>
            </div>
          )}

          {session?.progress && session.progress.totalChats > 0 && (
            <div className="rounded-2xl border p-4" style={{ borderColor: 'rgba(168,85,247,0.25)' }}>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-white font-medium">
                  {session.progress.processedChats} de {session.progress.totalChats} conversa(s)
                </span>
                <span style={{ color: 'var(--text-muted)' }}>{progressPercent}%</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full" style={{ background: 'rgba(51,65,85,0.7)' }}>
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${progressPercent}%`,
                    background: 'linear-gradient(90deg, #a855f7, #ec4899)',
                  }}
                />
              </div>
              {session.progress.currentChat && (
                <p className="text-sm mt-3" style={{ color: 'var(--text-muted)' }}>
                  Conversa atual: {session.progress.currentChat}
                </p>
              )}
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border p-4" style={{ borderColor: 'rgba(148,163,184,0.2)' }}>
              <p className="text-xs uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>
                Contatos extraídos
              </p>
              <p className="text-3xl font-bold text-white">{whatsappContacts.length}</p>
            </div>

            <div className="rounded-2xl border p-4" style={{ borderColor: 'rgba(148,163,184,0.2)' }}>
              <p className="text-xs uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>
                Casados com CRM
              </p>
              <p className="text-3xl font-bold text-white">{whatsappMatchedInCrm}</p>
            </div>

            <div className="rounded-2xl border p-4" style={{ borderColor: 'rgba(148,163,184,0.2)' }}>
              <p className="text-xs uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>
                Última sincronização
              </p>
              <p className="text-sm font-medium text-white">{latestSyncLabel}</p>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="card p-5">
          <p className="text-xs uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>
            Contatos prontos
          </p>
          <p className="text-3xl font-bold text-white">{filteredContacts.length}</p>
          <p className="text-sm mt-2" style={{ color: 'var(--text-muted)' }}>
            Base filtrada para exportação imediata.
          </p>
        </div>

        <div className="card p-5">
          <p className="text-xs uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>
            Com etiquetas
          </p>
          <p className="text-3xl font-bold text-white">{totalWithTags}</p>
          <p className="text-sm mt-2" style={{ color: 'var(--text-muted)' }}>
            Segmentação pronta para campanha ou follow-up.
          </p>
        </div>

        <div className="card p-5">
          <p className="text-xs uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>
            Com cidade
          </p>
          <p className="text-3xl font-bold text-white">{totalWithCity}</p>
          <p className="text-sm mt-2" style={{ color: 'var(--text-muted)' }}>
            Enriquecidos com informação geográfica disponível.
          </p>
        </div>
      </div>

      <div className="card p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">
              Exportar contatos {source === 'crm' ? 'do CRM' : 'do WhatsApp Web'}
            </h2>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
              Os arquivos são gerados a partir da lista filtrada abaixo.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => runExport(
                () => downloadBlob(contactsToCsv(filteredContacts), 'text/csv;charset=utf-8;', `${filenameBase}.csv`),
                'CSV gerado com sucesso.'
              )}>
              <FileSpreadsheet size={15} />
              CSV
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => runExport(
                () => downloadBlob(contactsToJson(filteredContacts), 'application/json;charset=utf-8;', `${filenameBase}.json`),
                'JSON gerado com sucesso.'
              )}>
              <FileJson size={15} />
              JSON
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => runExport(
                () => downloadBlob(contactsToVcf(filteredContacts), 'text/vcard;charset=utf-8;', `${filenameBase}.vcf`),
                'VCF gerado com sucesso.'
              )}>
              <Smartphone size={15} />
              vCard
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => runExport(
                () => exportWorkbook(filteredContacts, `${filenameBase}.xlsx`, 'xlsx'),
                'XLSX gerado com sucesso.'
              )}>
              <Download size={15} />
              XLSX
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => runExport(
                () => exportWorkbook(filteredContacts, `${filenameBase}.xls`, 'xls'),
                'XLS gerado com sucesso.'
              )}>
              <Download size={15} />
              XLS
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => runExport(
                () => exportPdf(
                  filteredContacts,
                  source === 'crm' ? 'Contatos exportados do CRM' : 'Contatos exportados do WhatsApp Web'
                ),
                'Visualização de PDF aberta para impressão.'
              )}>
              <FileText size={15} />
              PDF
            </button>
          </div>
        </div>

        {(formatMessage || formatError) && (
          <div
            className="mt-4 rounded-lg border px-3 py-2 text-sm"
            style={{
              borderColor: formatError ? 'rgba(248,113,113,0.35)' : 'rgba(74,222,128,0.35)',
              background: formatError ? 'rgba(127,29,29,0.18)' : 'rgba(20,83,45,0.18)',
              color: formatError ? '#fecaca' : '#bbf7d0',
            }}>
            {formatError || formatMessage}
          </div>
        )}
      </div>

      <div className="card p-5">
        <h2 className="text-lg font-semibold text-white">Origem e limites do dado</h2>
        <p className="text-sm mt-2 leading-6" style={{ color: 'var(--text-muted)' }}>
          No modo CRM, a exportação sai diretamente do Supabase. No modo WhatsApp Web, os nomes, telefones, etiquetas
          de negócio e histórico vêm da sessão autenticada por QR Code; cidade, bairro, e-mail e demais campos são
          enriquecidos com os registros já existentes no CRM quando houver correspondência por telefone.
        </p>
      </div>

      <div className="card p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Lista filtrável</h2>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
              Filtre por nome, telefone, e-mail, cidade ou etiqueta antes de exportar.
            </p>
          </div>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {filteredContacts.length} de {activeContacts.length} contato(s)
          </p>
        </div>

        <div className="flex flex-col gap-3 lg:flex-row">
          <label className="relative flex-1">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2"
              style={{ color: 'var(--text-muted)' }}
            />
            <input
              type="search"
              value={query}
              onChange={event => setQuery(event.target.value)}
              className="search-input w-full pl-10"
              placeholder="Buscar por nome, telefone, cidade, email ou etiqueta..."
            />
          </label>

          <select
            value={statusFilter}
            onChange={event => setStatusFilter(event.target.value)}
            className="select"
            style={{ width: 'auto' }}>
            <option value="todos">Todos os status</option>
            <option value="ativo">Ativo</option>
            <option value="inativo">Inativo</option>
            <option value="bloqueado">Bloqueado</option>
            <option value="opt-out">Opt-out</option>
          </select>
        </div>

        {source === 'whatsapp_web' && activeContacts.length === 0 && (
          <div className="mt-4 rounded-lg border px-3 py-3 text-sm" style={{
            borderColor: 'rgba(148,163,184,0.25)',
            background: 'rgba(15,23,42,0.35)',
            color: '#cbd5e1',
          }}>
            Gere o QR Code, conecte a sessão e clique em <strong>Sincronizar contatos</strong> para preencher esta lista.
          </div>
        )}

        <div className="table-container mt-4">
          <table className="table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Telefone</th>
                <th>Cidade</th>
                <th>E-mail</th>
                <th>Etiquetas</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredContacts.length > 0 ? filteredContacts.map(contact => {
                const whatsappContact = contact as ExtractedWhatsAppContact

                return (
                  <tr key={contact.id}>
                    <td className="font-medium text-white">
                      <div className="space-y-1">
                        <div>{contact.name}</div>
                        {source === 'whatsapp_web' && (
                          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                            {whatsappContact.messageCount} mensagem(ns)
                            {whatsappContact.lastMessageAt ? ` • ${formatDateTime(whatsappContact.lastMessageAt)}` : ''}
                          </div>
                        )}
                      </div>
                    </td>
                    <td>{formatPhone(contact.phone) || contact.phone || '—'}</td>
                    <td>{contact.city || '—'}</td>
                    <td>{contact.email || '—'}</td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {contact.tags.length > 0 ? contact.tags.map(tag => (
                          <span key={`${contact.id}-${tag}`} className="badge badge-gray">
                            {tag}
                          </span>
                        )) : '—'}
                      </div>
                    </td>
                    <td>{contact.status || 'ativo'}</td>
                  </tr>
                )
              }) : (
                <tr>
                  <td colSpan={6}>
                    <div className="py-10 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                      Nenhum contato encontrado com os filtros atuais.
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
