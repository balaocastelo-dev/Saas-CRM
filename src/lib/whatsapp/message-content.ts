export type StoredWhatsAppMediaContent = {
  mediaId: string
  mimeType?: string | null
  caption?: string | null
  fileName?: string | null
}

export function serializeWhatsAppMediaContent(content: StoredWhatsAppMediaContent) {
  return JSON.stringify({
    mediaId: content.mediaId,
    mimeType: content.mimeType || null,
    caption: content.caption || null,
    fileName: content.fileName || null,
  })
}

export function parseWhatsAppMediaContent(raw: string | null | undefined) {
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as StoredWhatsAppMediaContent
    if (!parsed || typeof parsed !== 'object' || typeof parsed.mediaId !== 'string') {
      return null
    }

    return parsed
  } catch {
    return null
  }
}

export function getWhatsAppMessagePreview(messageType: string, content: string | null | undefined) {
  if (messageType === 'image') {
    const media = parseWhatsAppMediaContent(content)
    return media?.caption?.trim() ? `📷 ${media.caption.trim()}` : '📷 Foto'
  }

  if (messageType === 'audio') {
    return '🎵 Áudio'
  }

  if (messageType === 'document') {
    const media = parseWhatsAppMediaContent(content)
    return media?.fileName?.trim() ? `📎 ${media.fileName.trim()}` : '📎 Documento'
  }

  if (messageType === 'video') {
    const media = parseWhatsAppMediaContent(content)
    return media?.caption?.trim() ? `🎬 ${media.caption.trim()}` : '🎬 Vídeo'
  }

  if (messageType === 'template') {
    return content || '(mensagem de template)'
  }

  return content || ''
}
