import { NextRequest, NextResponse } from 'next/server'
import { getWhatsAppPhoneCandidates, normalizeWhatsAppPhone } from '@/lib/utils'
import type { WebhookMessage, WebhookStatusUpdate } from '@/lib/whatsapp/client'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type SupabaseAdminClient = ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>
type SupportedMessageType = 'text' | 'template' | 'image' | 'document' | 'audio' | 'video' | 'interactive'

// OPT-OUT keywords
const OPT_OUT_KEYWORDS = ['SAIR', 'PARAR', 'CANCELAR', 'STOP', 'DESINSCREVER']
// OPT-IN keywords (interested)
const OPT_IN_KEYWORDS = ['QUERO', 'SIM', 'OK', 'ACEITO']

/**
 * GET — Verificação do webhook pela Meta
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || 'balao_webhook_verify_2024'

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('[Webhook] Verificação bem-sucedida')
    return new NextResponse(challenge, { status: 200 })
  }

  return NextResponse.json({ error: 'Token de verificação inválido' }, { status: 403 })
}

/**
 * POST — Receber eventos do WhatsApp
 */
export async function POST(request: NextRequest) {
  try {
    const [{ createAdminClient }, { verifyWebhookSignature, parseWebhookPayload }] = await Promise.all([
      import('@/lib/supabase/admin'),
      import('@/lib/whatsapp/client'),
    ])

    const supabaseAdmin = createAdminClient()
    const body = await request.text()
    
    // Verificar assinatura da Meta
    const signature = request.headers.get('x-hub-signature-256') || ''
    const appSecret = process.env.WHATSAPP_APP_SECRET || ''

    if (appSecret && signature) {
      const isValid = verifyWebhookSignature(body, signature, appSecret)
      if (!isValid) {
        console.error('[Webhook] Assinatura inválida')
        return NextResponse.json({ error: 'Assinatura inválida' }, { status: 401 })
      }
    }

    const payload = JSON.parse(body)
    const { messages, statuses } = parseWebhookPayload(payload)

    console.log('[Webhook] Payload recebido', {
      messages: messages.length,
      statuses: statuses.length,
    })

    // Process incoming messages
    for (const msg of messages) {
      try {
        await processIncomingMessage(supabaseAdmin, msg)
      } catch (messageError) {
        console.error('[Webhook] Falha ao processar inbound', {
          wamid: msg.id,
          from: msg.from,
          type: msg.type,
          error: messageError instanceof Error ? messageError.message : messageError,
        })
      }
    }

    // Process status updates
    for (const status of statuses) {
      try {
        await processStatusUpdate(supabaseAdmin, status)
      } catch (statusError) {
        console.error('[Webhook] Falha ao processar status', {
          wamid: status.id,
          status: status.status,
          error: statusError instanceof Error ? statusError.message : statusError,
        })
      }
    }

    return NextResponse.json({ status: 'ok' })
  } catch (error) {
    console.error('[Webhook] Erro:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

async function processIncomingMessage(supabaseAdmin: SupabaseAdminClient, msg: WebhookMessage) {
  const phone = normalizeWhatsAppPhone(msg.from)
  const phoneCandidates = getWhatsAppPhoneCandidates(phone)
  const content = extractInboundContent(msg)
  const text = content.trim().toUpperCase()
  const messageType = normalizeInboundMessageType(msg.type)

  console.log('[Webhook] Inbound recebido', {
    wamid: msg.id,
    from: phone,
    originalType: msg.type,
    storedType: messageType,
    phoneCandidates,
  })

  // Find or create customer
  const { data: customerMatches } = await supabaseAdmin
    .from('customers')
    .select('id, name, status, accepted_marketing')
    .in('phone_normalized', phoneCandidates)
    .limit(1)

  const customer = customerMatches?.[0] || null

  // Find or create conversation
  const { data: conversationMatches } = await supabaseAdmin
    .from('whatsapp_conversations')
    .select('id, phone, unread_count')
    .in('phone', phoneCandidates)
    .order('updated_at', { ascending: false })
    .limit(1)

  let conversation = conversationMatches?.[0] || null

  if (!conversation) {
    const { data: newConv } = await supabaseAdmin
      .from('whatsapp_conversations')
      .insert({
        phone,
        customer_id: customer?.id || null,
        status: 'aberto',
        last_message_at: new Date().toISOString(),
        unread_count: 1,
      })
      .select('id, phone, unread_count')
      .single()
    conversation = newConv
  } else {
    // Canonicaliza o número da conversa a partir do payload da Meta.
    await supabaseAdmin
      .from('whatsapp_conversations')
      .update({
        phone,
        last_message_at: new Date().toISOString(),
        unread_count: (conversation.unread_count || 0) + 1,
        customer_id: customer?.id || null,
      })
      .eq('id', conversation.id)
  }

  // Save message
  const { error: messageInsertError } = await supabaseAdmin
    .from('whatsapp_messages')
    .upsert({
      conversation_id: conversation?.id,
      wamid: msg.id,
      direction: 'inbound',
      message_type: messageType,
      content,
      status: 'delivered',
    }, {
      onConflict: 'wamid',
      ignoreDuplicates: true,
    })

  if (messageInsertError) {
    throw messageInsertError
  }

  // Handle OPT-OUT
  if (OPT_OUT_KEYWORDS.some(kw => text === kw)) {
    await supabaseAdmin
      .from('customers')
      .update({ accepted_marketing: false, status: 'opt-out' })
      .in('phone_normalized', phoneCandidates)

    // Log audit
    await supabaseAdmin.from('audit_logs').insert({
      action: 'OPT_OUT',
      entity_type: 'customer',
      entity_id: customer?.id,
      new_values: { keyword: text, phone },
    })

    console.log(`[Webhook] Opt-out processado para ${phone}`)
    return
  }

  // Handle OPT-IN / QUERO — create opportunity
  if (OPT_IN_KEYWORDS.some(kw => text === kw) && customer) {
    const { data: existingOpp } = await supabaseAdmin
      .from('opportunities')
      .select('id')
      .eq('customer_id', customer.id)
      .eq('stage', 'novo_lead')
      .maybeSingle()

    if (!existingOpp) {
      await supabaseAdmin.from('opportunities').insert({
        customer_id: customer.id,
        title: `Lead via WhatsApp - ${customer.name}`,
        stage: 'novo_lead',
        source: 'WhatsApp',
        description: `Cliente respondeu "${text}" via campanha WhatsApp`,
      })
      console.log(`[Webhook] Oportunidade criada para ${customer.name}`)
    }
  }

  // AI auto-response (if enabled)
  const { data: aiSetting } = await supabaseAdmin
    .from('settings')
    .select('value')
    .eq('key', 'ai_enabled')
    .maybeSingle()

  if (aiSetting?.value === 'true' || aiSetting?.value === true) {
    const aiResponse = getAIResponse(content)
    if (aiResponse) {
      const { sendTextMessage } = await import('@/lib/whatsapp/client')
      await sendTextMessage({ to: phone, text: aiResponse })
      
      await supabaseAdmin.from('whatsapp_messages').insert({
        conversation_id: conversation?.id,
        direction: 'outbound',
        message_type: 'text',
        content: aiResponse,
        status: 'sent',
        is_ai_response: true,
      })
    }
  }
}

function normalizeInboundMessageType(messageType: string | undefined): SupportedMessageType {
  switch (messageType) {
    case 'text':
    case 'template':
    case 'image':
    case 'document':
    case 'audio':
    case 'video':
    case 'interactive':
      return messageType
    case 'button':
    case 'reaction':
      return 'interactive'
    default:
      return 'text'
  }
}

function extractInboundContent(msg: WebhookMessage): string {
  if (msg.text?.body) {
    return msg.text.body
  }

  const dynamicMessage = msg as WebhookMessage & {
    button?: { text?: string; payload?: string }
    interactive?: {
      button_reply?: { title?: string; id?: string }
      list_reply?: { title?: string; description?: string; id?: string }
    }
    reaction?: { emoji?: string }
  }

  if (dynamicMessage.button?.text || dynamicMessage.button?.payload) {
    return dynamicMessage.button.text || dynamicMessage.button.payload || ''
  }

  if (dynamicMessage.interactive?.button_reply) {
    return dynamicMessage.interactive.button_reply.title || dynamicMessage.interactive.button_reply.id || ''
  }

  if (dynamicMessage.interactive?.list_reply) {
    return (
      dynamicMessage.interactive.list_reply.title ||
      dynamicMessage.interactive.list_reply.description ||
      dynamicMessage.interactive.list_reply.id ||
      ''
    )
  }

  if (dynamicMessage.reaction?.emoji) {
    return dynamicMessage.reaction.emoji
  }

  return ''
}

async function incrementCampaignCounter(
  supabaseAdmin: SupabaseAdminClient,
  campaignId: string,
  field: 'sent_count' | 'delivered_count' | 'read_count' | 'failed_count'
) {
  const { data: campaign } = await supabaseAdmin
    .from('campaigns')
    .select('id, sent_count, delivered_count, read_count, failed_count')
    .eq('id', campaignId)
    .maybeSingle()

  if (!campaign) return

  await supabaseAdmin
    .from('campaigns')
    .update({
      [field]: (campaign[field] || 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', campaignId)
}

async function processStatusUpdate(supabaseAdmin: SupabaseAdminClient, statusUpdate: WebhookStatusUpdate) {
  const { id: wamid, status } = statusUpdate
  
  // Map Meta status to our status
  const statusMap: Record<string, string> = {
    sent: 'sent',
    delivered: 'delivered',
    read: 'read',
    failed: 'failed',
  }

  const dbStatus = statusMap[status]
  if (!dbStatus) return

  await supabaseAdmin
    .from('whatsapp_messages')
    .update({ status: dbStatus, updated_at: new Date().toISOString() })
    .eq('wamid', wamid)

  // Update campaign recipient if applicable
  const { data: message } = await supabaseAdmin
    .from('whatsapp_messages')
    .select('id, campaign_id')
    .eq('wamid', wamid)
    .maybeSingle()

  if (message?.campaign_id) {
    await supabaseAdmin
      .from('campaign_recipients')
      .update({ status: dbStatus })
      .eq('message_id', message.id)

    // Update campaign counters
    if (status === 'delivered') {
      await incrementCampaignCounter(supabaseAdmin, message.campaign_id, 'delivered_count')
    } else if (status === 'read') {
      await incrementCampaignCounter(supabaseAdmin, message.campaign_id, 'read_count')
    } else if (status === 'failed') {
      await incrementCampaignCounter(supabaseAdmin, message.campaign_id, 'failed_count')
    }
  }
}

/**
 * Simple AI knowledge base for common questions
 */
function getAIResponse(text: string): string | null {
  const lower = text.toLowerCase()

  if (lower.includes('endereço') || lower.includes('onde fica') || lower.includes('localização')) {
    return '📍 Estamos na Av. Anchieta, 789 – Campinas/SP. Fácil acesso e estacionamento no local!'
  }

  if (lower.includes('horário') || lower.includes('funciona') || lower.includes('aberto')) {
    return '🕐 Nosso horário de funcionamento é de segunda a sábado, das 08h às 18h. Domingos fechado.'
  }

  if (lower.includes('pagamento') || lower.includes('pagar') || lower.includes('forma de pag')) {
    return '💳 Aceitamos: cartão de crédito (até 12x), débito, PIX, boleto e dinheiro. Consulte condições com nosso vendedor!'
  }

  if (lower.includes('garantia')) {
    return '🛡️ Todos os produtos têm garantia do fabricante. Serviços têm garantia de 90 dias. Para mais detalhes, fale com nossa equipe!'
  }

  if (lower.includes('assistência') || lower.includes('conserto') || lower.includes('reparo') || lower.includes('técnico')) {
    return '🔧 Fazemos assistência técnica em notebooks, PCs, impressoras e celulares. Traga seu equipamento ou agende uma visita. Digite ATENDENTE para falar com nossa equipe!'
  }

  if (lower.includes('notebook') || lower.includes('computador') || lower.includes('pc')) {
    return '💻 Temos uma linha completa de notebooks e PCs para todos os perfis e orçamentos. Para ver nossas opções, responda ATENDENTE e fale com um de nossos vendedores!'
  }

  if (lower.includes('gamer') || lower.includes('placa de vídeo') || lower.includes('gpu')) {
    return '🎮 Somos especialistas em equipamentos gamer! Placas de vídeo, processadores, memórias e muito mais. Responda ATENDENTE para falar com nosso especialista gamer!'
  }

  if (lower.includes('orçamento') || lower.includes('preço') || lower.includes('valor') || lower.includes('quanto')) {
    return '💰 Para orçamentos personalizados, responda ATENDENTE e um de nossos vendedores vai te atender! Não inventamos preços — cada configuração é consultada para te dar o melhor valor.'
  }

  if (lower.includes('atendente') || lower.includes('vendedor') || lower.includes('humano') || lower.includes('pessoa')) {
    return '👋 Perfeito! Vou transferir você para um de nossos atendentes. Em instantes alguém vai te responder. Obrigado pela paciência!'
  }

  if (lower.includes('oi') || lower.includes('olá') || lower.includes('ola') || lower.includes('bom dia') || lower.includes('boa tarde') || lower.includes('boa noite')) {
    return '👋 Olá! Bem-vindo à Balão da Informática Castelo! Como posso te ajudar hoje?\n\n• 📍 Endereço e horário\n• 💻 Produtos\n• 🔧 Assistência técnica\n• 💳 Formas de pagamento\n• 👤 Falar com atendente'
  }

  return null
}
