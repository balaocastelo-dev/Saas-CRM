import http from 'node:http'
import { loadEnvConfig } from '@next/env'
import { getWhatsAppExtractionManager } from '../src/lib/whatsapp-web/extraction-manager'

loadEnvConfig(process.cwd())

const host = process.env.WHATSAPP_EXTRACTION_SERVICE_HOST || '127.0.0.1'
const port = Number.parseInt(process.env.WHATSAPP_EXTRACTION_SERVICE_PORT || '3011', 10)
const serviceToken = process.env.WHATSAPP_EXTRACTION_SERVICE_TOKEN?.trim() || ''

function sendJson(
  response: http.ServerResponse<http.IncomingMessage>,
  status: number,
  payload: unknown
) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  response.end(JSON.stringify(payload))
}

function isAuthorized(request: http.IncomingMessage) {
  if (!serviceToken) {
    return true
  }

  const header = request.headers.authorization || ''
  return header === `Bearer ${serviceToken}`
}

async function handleRequest(request: http.IncomingMessage, response: http.ServerResponse) {
  if (!isAuthorized(request)) {
    sendJson(response, 401, { error: 'Token do serviço local inválido.' })
    return
  }

  const method = request.method || 'GET'
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`)
  const pathname = url.pathname.replace(/\/+$/, '') || '/'
  const manager = getWhatsAppExtractionManager()

  try {
    if (method === 'GET' && pathname === '/health') {
      sendJson(response, 200, {
        ok: true,
        service: 'whatsapp-extraction',
        serviceLabel: 'Serviço local Windows via API',
      })
      return
    }

    if (method === 'GET' && pathname === '/session') {
      sendJson(response, 200, {
        ...manager.getSnapshot(),
        serviceMode: 'remote',
        serviceLabel: 'Serviço local Windows via API',
      })
      return
    }

    if (method === 'POST' && pathname === '/session/start') {
      sendJson(response, 202, {
        ...manager.startSession(),
        serviceMode: 'remote',
        serviceLabel: 'Serviço local Windows via API',
      })
      return
    }

    if (method === 'DELETE' && pathname === '/session') {
      sendJson(response, 200, {
        ...(await manager.logout()),
        serviceMode: 'remote',
        serviceLabel: 'Serviço local Windows via API',
      })
      return
    }

    if (method === 'POST' && pathname === '/sync') {
      sendJson(response, 202, {
        ...manager.startSync(),
        serviceMode: 'remote',
        serviceLabel: 'Serviço local Windows via API',
      })
      return
    }

    sendJson(response, 404, { error: 'Rota não encontrada.' })
  } catch (error) {
    sendJson(response, 400, {
      error: error instanceof Error ? error.message : 'Erro interno no serviço local.',
    })
  }
}

const server = http.createServer((request, response) => {
  void handleRequest(request, response)
})

server.listen(port, host, () => {
  console.log(`[WhatsApp Extraction Service] listening on http://${host}:${port}`)
})
