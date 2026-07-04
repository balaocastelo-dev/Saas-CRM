import type { ExportableContact } from '@/lib/contact-exports'

export type WhatsAppExtractionStatus =
  | 'idle'
  | 'starting'
  | 'qr'
  | 'authenticated'
  | 'ready'
  | 'syncing'
  | 'error'
  | 'unsupported'

export type WhatsAppSyncProgress = {
  processedChats: number
  totalChats: number
  currentChat: string | null
}

export type ExtractedWhatsAppContact = ExportableContact & {
  source: 'whatsapp_web'
  sourceName: string | null
  whatsappLabels: string[]
  messageCount: number
  lastMessagePreview: string | null
  lastMessageAt: string | null
  hasCrmMatch: boolean
}

export type WhatsAppExtractionSnapshot = {
  status: WhatsAppExtractionStatus
  isSupported: boolean
  isConnected: boolean
  serviceMode?: 'embedded' | 'remote'
  serviceLabel?: string | null
  qrCodeDataUrl: string | null
  qrUpdatedAt: string | null
  lastSyncAt: string | null
  contactCount: number
  progress: WhatsAppSyncProgress | null
  message: string | null
  error: string | null
  contacts: ExtractedWhatsAppContact[]
}
