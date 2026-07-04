import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { sendTextMessage } from '@/lib/whatsapp/client'

const sendMessageSchema = z.object({
  conversationId: z.string().uuid(),
  text: z.string().trim().min(1).max(4096),
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

    const body = await request.json()
    const { conversationId, text } = sendMessageSchema.parse(body)

    const { data: conversation, error: conversationError } = await supabase
      .from('whatsapp_conversations')
      .select('id, phone, last_message_at')
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

    const result = await sendTextMessage({
      to: conversation.phone,
      text,
    })

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
        message_type: 'text',
        content: text,
        status: sentStatus,
        sent_by: user.id,
      })
      .select('id, content, direction, created_at, status, wamid')
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
