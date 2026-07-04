// WhatsApp Cloud API client — Meta Official API
import crypto from 'node:crypto'
import { normalizeWhatsAppPhone } from '@/lib/utils'

const WHATSAPP_API_URL = 'https://graph.facebook.com/v19.0'

function getAccessToken(): string {
  return process.env.WHATSAPP_ACCESS_TOKEN || ''
}

function getPhoneNumberId(): string {
  return process.env.WHATSAPP_PHONE_NUMBER_ID || ''
}

interface SendTemplateParams {
  to: string
  templateName: string
  languageCode?: string
  components?: TemplateComponent[]
}

interface TemplateComponent {
  type: 'header' | 'body' | 'button'
  parameters: TemplateParameter[]
  sub_type?: string
  index?: string
}

interface TemplateParameter {
  type: 'text' | 'image' | 'document' | 'video'
  text?: string
  image?: { link: string }
  document?: { link: string }
}

interface SendTextMessageParams {
  to: string
  text: string
  previewUrl?: boolean
}

interface UploadMediaParams {
  file: File | Blob
  fileName: string
  mimeType: string
}

interface SendMediaMessageParams {
  to: string
  mediaType: 'image' | 'audio'
  mediaId: string
  caption?: string
}

type WhatsAppMediaInfo = {
  url: string
  mime_type?: string
  sha256?: string
  file_size?: number
  id: string
}

export interface WhatsAppApiResponse {
  messaging_product: string
  contacts: Array<{ input: string; wa_id: string }>
  messages: Array<{ id: string; message_status: string }>
}

export interface WhatsAppErrorResponse {
  error: {
    message: string
    type: string
    code: number
    error_subcode?: number
    fbtrace_id: string
  }
}

export interface DownloadedWhatsAppMedia {
  body: ReadableStream<Uint8Array> | null
  mimeType: string
  fileName: string | null
}

/**
 * Envia uma mensagem de template WhatsApp
 */
export async function sendTemplateMessage({
  to,
  templateName,
  languageCode = 'pt_BR',
  components = [],
}: SendTemplateParams): Promise<{ success: boolean; data?: WhatsAppApiResponse; error?: string }> {
  const accessToken = getAccessToken()
  const phoneNumberId = getPhoneNumberId()
  const recipient = normalizeWhatsAppPhone(to)

  if (!accessToken || !phoneNumberId) {
    return { success: false, error: 'WhatsApp não configurado. Configure o token e o ID do número nas configurações.' }
  }

  if (!recipient) {
    return { success: false, error: 'Telefone do destinatário inválido.' }
  }

  try {
    const payload = {
      messaging_product: 'whatsapp',
      to: recipient,
      type: 'template',
      template: {
        name: templateName,
        language: {
          code: languageCode,
        },
        ...(components.length > 0 && { components }),
      },
    }

    const response = await fetch(`${WHATSAPP_API_URL}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    const data = await response.json()

    if (!response.ok) {
      const errorData = data as WhatsAppErrorResponse
      return {
        success: false,
        error: errorData.error?.message || 'Erro desconhecido da API WhatsApp',
      }
    }

    return { success: true, data: data as WhatsAppApiResponse }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro ao enviar mensagem',
    }
  }
}

/**
 * Envia uma mensagem de texto livre (dentro da janela de 24h)
 */
export async function sendTextMessage({
  to,
  text,
  previewUrl = false,
}: SendTextMessageParams): Promise<{ success: boolean; data?: WhatsAppApiResponse; error?: string }> {
  const accessToken = getAccessToken()
  const phoneNumberId = getPhoneNumberId()
  const recipient = normalizeWhatsAppPhone(to)

  if (!accessToken || !phoneNumberId) {
    return { success: false, error: 'WhatsApp não configurado. Configure o token e o ID do número nas configurações.' }
  }

  if (!recipient) {
    return { success: false, error: 'Telefone do destinatário inválido.' }
  }

  try {
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: recipient,
      type: 'text',
      text: {
        preview_url: previewUrl,
        body: text,
      },
    }

    const response = await fetch(`${WHATSAPP_API_URL}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    const data = await response.json()

    if (!response.ok) {
      const errorData = data as WhatsAppErrorResponse
      return {
        success: false,
        error: errorData.error?.message || 'Erro desconhecido da API WhatsApp',
      }
    }

    return { success: true, data: data as WhatsAppApiResponse }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro ao enviar mensagem',
    }
  }
}

export async function uploadMedia({
  file,
  fileName,
  mimeType,
}: UploadMediaParams): Promise<{ success: boolean; data?: { id: string }; error?: string }> {
  const accessToken = getAccessToken()
  const phoneNumberId = getPhoneNumberId()

  if (!accessToken || !phoneNumberId) {
    return { success: false, error: 'WhatsApp não configurado. Configure o token e o ID do número nas configurações.' }
  }

  try {
    const formData = new FormData()
    const uploadFile =
      file instanceof File
        ? file
        : new File([file], fileName, {
            type: mimeType || 'application/octet-stream',
          })

    formData.set('messaging_product', 'whatsapp')
    formData.set('file', uploadFile, fileName)

    const response = await fetch(`${WHATSAPP_API_URL}/${phoneNumberId}/media`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: formData,
    })

    const data = await response.json()

    if (!response.ok) {
      const errorData = data as WhatsAppErrorResponse
      return {
        success: false,
        error: errorData.error?.message || 'Erro ao enviar mídia para a Meta.',
      }
    }

    return { success: true, data: data as { id: string } }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro ao enviar mídia',
    }
  }
}

export async function sendMediaMessage({
  to,
  mediaType,
  mediaId,
  caption,
}: SendMediaMessageParams): Promise<{ success: boolean; data?: WhatsAppApiResponse; error?: string }> {
  const accessToken = getAccessToken()
  const phoneNumberId = getPhoneNumberId()
  const recipient = normalizeWhatsAppPhone(to)

  if (!accessToken || !phoneNumberId) {
    return { success: false, error: 'WhatsApp não configurado. Configure o token e o ID do número nas configurações.' }
  }

  if (!recipient) {
    return { success: false, error: 'Telefone do destinatário inválido.' }
  }

  try {
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: recipient,
      type: mediaType,
      [mediaType]: {
        id: mediaId,
        ...(mediaType === 'image' && caption?.trim() ? { caption: caption.trim() } : {}),
      },
    }

    const response = await fetch(`${WHATSAPP_API_URL}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    const data = await response.json()

    if (!response.ok) {
      const errorData = data as WhatsAppErrorResponse
      return {
        success: false,
        error: errorData.error?.message || 'Erro desconhecido da API WhatsApp',
      }
    }

    return { success: true, data: data as WhatsAppApiResponse }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro ao enviar mídia',
    }
  }
}

export async function getMediaInfo(mediaId: string): Promise<{ success: boolean; data?: WhatsAppMediaInfo; error?: string }> {
  const accessToken = getAccessToken()

  if (!accessToken) {
    return { success: false, error: 'WhatsApp não configurado.' }
  }

  try {
    const response = await fetch(`${WHATSAPP_API_URL}/${mediaId}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: 'no-store',
    })
    const data = await response.json()

    if (!response.ok) {
      const errorData = data as WhatsAppErrorResponse
      return {
        success: false,
        error: errorData.error?.message || 'Erro ao consultar mídia na Meta.',
      }
    }

    return { success: true, data: data as WhatsAppMediaInfo }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro ao consultar mídia',
    }
  }
}

export async function downloadMedia(mediaId: string): Promise<{ success: boolean; data?: DownloadedWhatsAppMedia; error?: string }> {
  const accessToken = getAccessToken()
  if (!accessToken) {
    return { success: false, error: 'WhatsApp não configurado.' }
  }

  const mediaInfo = await getMediaInfo(mediaId)
  if (!mediaInfo.success || !mediaInfo.data) {
    return { success: false, error: mediaInfo.error || 'Não foi possível localizar a mídia.' }
  }

  try {
    const response = await fetch(mediaInfo.data.url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: 'no-store',
    })

    if (!response.ok) {
      return {
        success: false,
        error: 'Não foi possível baixar a mídia na Meta.',
      }
    }

    return {
      success: true,
      data: {
        body: response.body,
        mimeType: mediaInfo.data.mime_type || response.headers.get('content-type') || 'application/octet-stream',
        fileName: response.headers
          .get('content-disposition')
          ?.match(/filename="?([^"]+)"?/)?.[1] || null,
      },
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro ao baixar mídia',
    }
  }
}

/**
 * Marca uma mensagem como lida
 */
export async function markMessageAsRead(messageId: string): Promise<void> {
  const accessToken = getAccessToken()
  const phoneNumberId = getPhoneNumberId()

  if (!accessToken || !phoneNumberId) return

  try {
    await fetch(`${WHATSAPP_API_URL}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
      }),
    })
  } catch (error) {
    console.error('Erro ao marcar mensagem como lida:', error)
  }
}

/**
 * Verifica a assinatura do webhook da Meta
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  appSecret: string
): boolean {
  try {
    const normalizedSignature = signature.trim()
    const normalizedAppSecret = appSecret.trim()

    const expectedSignature = `sha256=${crypto
      .createHmac('sha256', normalizedAppSecret)
      .update(payload)
      .digest('hex')}`

    if (Buffer.byteLength(normalizedSignature) !== Buffer.byteLength(expectedSignature)) {
      return false
    }

    return crypto.timingSafeEqual(
      Buffer.from(normalizedSignature),
      Buffer.from(expectedSignature)
    )
  } catch {
    return false
  }
}

/**
 * Constrói os componentes de template com variáveis
 */
export function buildTemplateComponents(variables: string[]): TemplateComponent[] {
  if (!variables.length) return []

  return [
    {
      type: 'body',
      parameters: variables.map((v) => ({
        type: 'text' as const,
        text: v,
      })),
    },
  ]
}

/**
 * Extrai o tipo de webhook recebido
 */
export interface WebhookMessage {
  id: string
  from: string
  timestamp: string
  type: string
  text?: { body: string }
  template?: Record<string, unknown>
  image?: { id: string; mime_type?: string; caption?: string }
  audio?: { id: string; mime_type?: string; voice?: boolean }
  document?: { id: string; mime_type?: string; filename?: string; caption?: string }
  video?: { id: string; mime_type?: string; caption?: string }
}

export interface WebhookStatusUpdate {
  id: string
  status: 'sent' | 'delivered' | 'read' | 'failed'
  timestamp: string
  recipient_id: string
  errors?: Array<{ code: number; title: string }>
}

export interface WebhookPayload {
  object: string
  entry: Array<{
    id: string
    changes: Array<{
      value: {
        messaging_product: string
        metadata: { display_phone_number: string; phone_number_id: string }
        contacts?: Array<{ profile: { name: string }; wa_id: string }>
        messages?: WebhookMessage[]
        statuses?: WebhookStatusUpdate[]
      }
      field: string
    }>
  }>
}

export function parseWebhookPayload(payload: WebhookPayload): {
  messages: WebhookMessage[]
  statuses: WebhookStatusUpdate[]
  phoneNumberId: string
} {
  const messages: WebhookMessage[] = []
  const statuses: WebhookStatusUpdate[] = []
  let phoneNumberId = ''

  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      if (change.field === 'messages') {
        const value = change.value
        phoneNumberId = value.metadata?.phone_number_id || ''

        if (value.messages) {
          messages.push(...value.messages)
        }

        if (value.statuses) {
          statuses.push(...value.statuses)
        }
      }
    }
  }

  return { messages, statuses, phoneNumberId }
}
