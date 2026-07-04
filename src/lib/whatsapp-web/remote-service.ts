import type { WhatsAppExtractionSnapshot } from './types'

const DEFAULT_TIMEOUT_MS = 30_000

function getConfiguredServiceUrl() {
  const value = process.env.WHATSAPP_EXTRACTION_SERVICE_URL?.trim() || ''
  return value.replace(/\/+$/, '')
}

function getServiceToken() {
  return process.env.WHATSAPP_EXTRACTION_SERVICE_TOKEN?.trim() || ''
}

export function isRemoteWhatsAppExtractionEnabled() {
  return Boolean(getConfiguredServiceUrl())
}

function buildHeaders() {
  const headers = new Headers({
    'content-type': 'application/json',
  })

  const token = getServiceToken()
  if (token) {
    headers.set('authorization', `Bearer ${token}`)
  }

  return headers
}

async function requestRemoteService(
  path: string,
  init?: RequestInit,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<WhatsAppExtractionSnapshot> {
  const baseUrl = getConfiguredServiceUrl()
  if (!baseUrl) {
    throw new Error('URL do serviço local de extração não configurada.')
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: buildHeaders(),
      cache: 'no-store',
      signal: controller.signal,
    })

    const payload = await response.json()

    if (!response.ok) {
      throw new Error(
        payload?.error || 'Falha ao consultar o serviço local de extração do WhatsApp.'
      )
    }

    return {
      ...payload,
      serviceMode: 'remote',
      serviceLabel: payload.serviceLabel || 'Serviço local Windows via API',
    } as WhatsAppExtractionSnapshot
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Timeout ao consultar o serviço local de extração do WhatsApp.')
    }

    throw error
  } finally {
    clearTimeout(timeout)
  }
}

export function getRemoteExtractionSnapshot() {
  return requestRemoteService('/session', { method: 'GET' })
}

export function startRemoteExtractionSession() {
  return requestRemoteService('/session/start', { method: 'POST' })
}

export function logoutRemoteExtractionSession() {
  return requestRemoteService('/session', { method: 'DELETE' })
}

export function startRemoteExtractionSync() {
  return requestRemoteService('/sync', { method: 'POST' }, 120_000)
}
