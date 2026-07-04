import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { normalizeWhatsAppPhone } from '@/lib/utils'
import { sendMediaMessage, sendTextMessage, uploadMedia } from '@/lib/whatsapp/client'
import { serializeWhatsAppMediaContent } from '@/lib/whatsapp/message-content'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const sendMessageSchema = z.object({
  conversationId: z.string().uuid(),
  text: z.string().trim().min(1).max(4096),
})

const sendMediaSchema = z.object({
  conversationId: z.string().uuid(),
  text: z.string().trim().max(1024).optional().default(''),
})

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
    }

    const contentType = request.headers.get('content-type') || ''
    const isMultipart = contentType.includes('multipart/form-data')

    let conversationId = ''
    let text = ''
    let mediaFile: File | null = null

    if (isMultipart) {
      const formData = await request.formData()
      const parsed = sendMediaSchema.parse({
        conversationId: formData.get('conversationId'),
        text: formData.get('text'),
      })

      conversationId = parsed.conversationId
      text = parsed.text
      const uploadedFile = formData.get('media')
      mediaFile = uploadedFile instanceof File ? uploadedFile : null

      if (!mediaFile) {
        return NextResponse.json({ error: 'Selecione uma foto ou um áudio para enviar.' }, { status: 400 })
      }
    } else {
      const body = await request.json()
      const parsed = sendMessageSchema.parse(body)
      conversationId = parsed.conversationId
      text = parsed.text
    }

    const { data: conversation, error: conversationError } = await supabase
      .from('whatsapp_conversations')
      .select('id, phone, last_message_at, customer:customers(phone_normalized)')
      .eq('id', conversationId)
      .maybeSingle()

    if (conversationError) {
      return NextResponse.json({ error: conversationError.message }, { status: 400 })
    }

    if (!conversation) {
      return NextResponse.json({ error: 'Conversa não encontrada.' }, { status: 404 })
    }

    const lastInteractionAt = conversation.last_message_at
      ? new Date(conversation.last_message_at).getTime()
      : 0
    const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000

    if (!lastInteractionAt || lastInteractionAt < twentyFourHoursAgo) {
      return NextResponse.json(
        { error: 'A janela de 24h para mensagens livres expirou.' },
        { status: 400 }
      )
    }

    const recipient = normalizeWhatsAppPhone(
      conversation.phone || conversation.customer?.[0]?.phone_normalized || ''
    )

    if (!recipient) {
      return NextResponse.json({ error: 'Telefone do destinatário inválido.' }, { status: 400 })
    }

    let result: { success: boolean; data?: { messages?: Array<{ id: string; message_status: string }> }; error?: string }
    let messageType: 'text' | 'image' | 'audio' = 'text'
    let storedContent = text

    if (mediaFile) {
      const mimeType = mediaFile.type || 'application/octet-stream'
      const isImage = mimeType.startsWith('image/')
      const isAudio = mimeType.startsWith('audio/')

      if (!isImage && !isAudio) {
        return NextResponse.json(
          { error: 'Envie apenas arquivos de imagem ou áudio no atendimento.' },
          { status: 400 }
        )
      }

      if (isAudio && text.trim()) {
        return NextResponse.json(
          { error: 'Áudio não suporta legenda. Envie o texto separado após o áudio.' },
          { status: 400 }
        )
      }

      const uploadResult = await uploadMedia({
        file: mediaFile,
        fileName: mediaFile.name || `arquivo-${Date.now()}`,
        mimeType,
      })

      if (!uploadResult.success || !uploadResult.data?.id) {
        return NextResponse.json(
          { error: uploadResult.error || 'Falha ao enviar a mídia para a Meta.' },
          { status: 400 }
        )
      }

      messageType = isImage ? 'image' : 'audio'
      storedContent = serializeWhatsAppMediaContent({
        mediaId: uploadResult.data.id,
        mimeType,
        caption: isImage ? text : null,
        fileName: mediaFile.name || null,
      })

      result = await sendMediaMessage({
        to: recipient,
        mediaType: messageType,
        mediaId: uploadResult.data.id,
        caption: isImage ? text : undefined,
      })
    } else {
      result = await sendTextMessage({
        to: recipient,
        text,
      })
    }

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Falha ao enviar mensagem pelo WhatsApp.' },
        { status: 400 }
      )
    }

    const wamid = result.data?.messages?.[0]?.id ?? null
    const sentStatus = result.data?.messages?.[0]?.message_status ? 'sent' : 'sent'
    const now = new Date().toISOString()

    const { data: insertedMessage, error: insertError } = await supabase
      .from('whatsapp_messages')
      .insert({
        conversation_id: conversation.id,
        wamid,
        direction: 'outbound',
        message_type: messageType,
        content: storedContent,
        status: sentStatus,
        sent_by: user.id,
      })
      .select('id, content, direction, created_at, status, wamid, message_type')
      .single()

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 400 })
    }

    await supabase
      .from('whatsapp_conversations')
      .update({
        last_message_at: now,
        status: 'em_atendimento',
      })
      .eq('id', conversation.id)

    return NextResponse.json({
      message: insertedMessage,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dados inválidos.', details: error.flatten() },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro interno.' },
      { status: 500 }
    )
  }
}
