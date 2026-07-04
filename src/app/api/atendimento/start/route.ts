import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  buildTemplateComponents,
  sendTemplateMessage,
} from '@/lib/whatsapp/client'
import {
  formatPhone,
  getWhatsAppPhoneCandidates,
  normalizeWhatsAppPhone,
} from '@/lib/utils'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const startConversationSchema = z.object({
  phone: z.string().trim().min(8).max(32),
  customerName: z.string().trim().max(120).optional(),
  templateId: z.string().uuid(),
  templateVariables: z.record(z.string(), z.string()).default({}),
})

type TemplateRecord = {
  id: string
  name: string
  status: string
  variables: string[] | null
}

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
    const { phone, customerName, templateId, templateVariables } =
      startConversationSchema.parse(body)

    const normalizedPhone = normalizeWhatsAppPhone(phone)

    if (!normalizedPhone) {
      return NextResponse.json({ error: 'Telefone inválido.' }, { status: 400 })
    }

    const supabaseAdmin = createAdminClient()
    const phoneCandidates = getWhatsAppPhoneCandidates(normalizedPhone)

    const { data: template, error: templateError } = await supabaseAdmin
      .from('templates')
      .select('id, name, status, variables')
      .eq('id', templateId)
      .maybeSingle()

    if (templateError) {
      return NextResponse.json({ error: templateError.message }, { status: 400 })
    }

    if (!template || template.status !== 'approved') {
      return NextResponse.json(
        { error: 'Selecione um template aprovado pela Meta para iniciar a conversa.' },
        { status: 400 }
      )
    }

    const missingVariables = (template.variables || []).filter(
      (variableName: string) => !templateVariables[variableName]?.trim()
    )

    if (missingVariables.length > 0) {
      return NextResponse.json(
        {
          error: `Preencha todas as variáveis do template: ${missingVariables.join(', ')}.`,
        },
        { status: 400 }
      )
    }

    const orderedVariables = getOrderedTemplateVariables(template, templateVariables)
    const sendResult = await sendTemplateMessage({
      to: normalizedPhone,
      templateName: template.name,
      components: buildTemplateComponents(orderedVariables),
    })

    if (!sendResult.success) {
      return NextResponse.json(
        { error: sendResult.error || 'Falha ao enviar template pelo WhatsApp.' },
        { status: 400 }
      )
    }

    const customer = await resolveCustomer(supabaseAdmin, {
      phone: normalizedPhone,
      phoneCandidates,
      customerName,
    })

    const conversation = await resolveConversation(supabaseAdmin, {
      phone: normalizedPhone,
      phoneCandidates,
      customerId: customer?.id || null,
      assignedTo: user.id,
    })

    const wamid = sendResult.data?.messages?.[0]?.id ?? null

    const { error: messageInsertError } = await supabaseAdmin
      .from('whatsapp_messages')
      .insert({
        conversation_id: conversation.id,
        wamid,
        direction: 'outbound',
        message_type: 'template',
        content: null,
        template_name: template.name,
        template_variables: templateVariables,
        status: 'sent',
        sent_by: user.id,
      })

    if (messageInsertError) {
      return NextResponse.json({ error: messageInsertError.message }, { status: 400 })
    }

    return NextResponse.json({
      conversationId: conversation.id,
      message: 'Conversa iniciada com template aprovado via API oficial da Meta.',
      customer: {
        id: customer?.id || null,
        name: customer?.name || customerName || formatPhone(normalizedPhone),
      },
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

function getOrderedTemplateVariables(
  template: TemplateRecord,
  providedVariables: Record<string, string>
) {
  return (template.variables || []).map((name) => providedVariables[name] || '')
}

async function resolveCustomer(
  supabaseAdmin: ReturnType<typeof createAdminClient>,
  {
    phone,
    phoneCandidates,
    customerName,
  }: {
    phone: string
    phoneCandidates: string[]
    customerName?: string
  }
) {
  const { data: customerMatches, error: customerLookupError } = await supabaseAdmin
    .from('customers')
    .select('id, name')
    .in('phone_normalized', phoneCandidates)
    .limit(1)

  if (customerLookupError) {
    throw customerLookupError
  }

  const existingCustomer = customerMatches?.[0]
  if (existingCustomer) {
    return existingCustomer
  }

  const fallbackName = customerName?.trim() || formatPhone(phone) || phone

  const { data: insertedCustomer, error: insertCustomerError } = await supabaseAdmin
    .from('customers')
    .insert({
      name: fallbackName,
      phone,
      phone_normalized: phone,
      contact_origin: 'whatsapp_manual',
      accepted_marketing: false,
      status: 'ativo',
    })
    .select('id, name')
    .single()

  if (insertCustomerError) {
    throw insertCustomerError
  }

  return insertedCustomer
}

async function resolveConversation(
  supabaseAdmin: ReturnType<typeof createAdminClient>,
  {
    phone,
    phoneCandidates,
    customerId,
    assignedTo,
  }: {
    phone: string
    phoneCandidates: string[]
    customerId: string | null
    assignedTo: string
  }
) {
  const now = new Date().toISOString()

  const { data: conversationMatches, error: conversationLookupError } = await supabaseAdmin
    .from('whatsapp_conversations')
    .select('id')
    .in('phone', phoneCandidates)
    .order('updated_at', { ascending: false })
    .limit(1)

  if (conversationLookupError) {
    throw conversationLookupError
  }

  const existingConversation = conversationMatches?.[0]

  if (existingConversation) {
    const { data: updatedConversation, error: updateConversationError } = await supabaseAdmin
      .from('whatsapp_conversations')
      .update({
        phone,
        customer_id: customerId,
        assigned_to: assignedTo,
        status: 'aguardando',
        last_message_at: now,
        updated_at: now,
      })
      .eq('id', existingConversation.id)
      .select('id')
      .single()

    if (updateConversationError) {
      throw updateConversationError
    }

    return updatedConversation
  }

  const { data: insertedConversation, error: insertConversationError } = await supabaseAdmin
    .from('whatsapp_conversations')
    .insert({
      phone,
      customer_id: customerId,
      assigned_to: assignedTo,
      status: 'aguardando',
      last_message_at: now,
      unread_count: 0,
    })
    .select('id')
    .single()

  if (insertConversationError) {
    throw insertConversationError
  }

  return insertedConversation
}
