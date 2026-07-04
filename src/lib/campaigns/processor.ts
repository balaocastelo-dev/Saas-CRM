import { createAdminClient } from '@/lib/supabase/admin'
import { buildTemplateComponents, sendTemplateMessage } from '@/lib/whatsapp/client'
import { normalizeWhatsAppPhone } from '@/lib/utils'

const MAX_RECIPIENTS_PER_RUN = 25

type SupabaseAdminClient = ReturnType<typeof createAdminClient>

type ProcessorCampaignTemplate = {
  id: string
  name: string
  status: string
  category: string
  variables: string[] | null
}

type ProcessorCampaign = {
  id: string
  name: string
  status: string
  scheduled_at: string | null
  started_at: string | null
  completed_at: string | null
  daily_limit: number
  batch_interval_seconds: number
  total_recipients: number
  sent_count: number
  template_variables: Record<string, string> | null
  template: ProcessorCampaignTemplate | ProcessorCampaignTemplate[] | null
}

type ProcessorCustomer = {
  id: string
  name: string
  phone_normalized: string
  accepted_marketing: boolean
  status: string
  city: string | null
}

type ProcessorRecipient = {
  id: string
  customer: ProcessorCustomer | ProcessorCustomer[] | null
}

export type CampaignProcessResult = {
  campaignId: string
  campaignName: string
  status: string
  processed: number
  sent: number
  failed: number
  skipped: number
  pendingRemaining: number
  message: string
}

type ProcessCampaignOptions = {
  forceStart?: boolean
}

function takeFirst<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null
  }

  return value ?? null
}

function interpolateVariable(
  templateValue: string,
  customer: ProcessorCustomer
) {
  return templateValue
    .replace(/\{\{\s*customer\.name\s*\}\}/gi, customer.name || '')
    .replace(/\{\{\s*customer\.city\s*\}\}/gi, customer.city || '')
    .replace(/\{\{\s*customer\.phone\s*\}\}/gi, customer.phone_normalized || '')
}

function resolveVariableValue(
  variableName: string,
  configuredValue: string | undefined,
  customer: ProcessorCustomer
) {
  const explicitValue = configuredValue?.trim() || ''

  if (explicitValue) {
    return interpolateVariable(explicitValue, customer)
  }

  const normalizedName = variableName.toLowerCase()

  if (normalizedName.includes('nome')) {
    return customer.name || ''
  }

  if (normalizedName.includes('cidade')) {
    return customer.city || ''
  }

  if (normalizedName.includes('telefone') || normalizedName.includes('phone')) {
    return customer.phone_normalized || ''
  }

  return ''
}

async function findOrCreateConversation(
  supabaseAdmin: SupabaseAdminClient,
  customer: ProcessorCustomer
) {
  const phone = normalizeWhatsAppPhone(customer.phone_normalized)
  const now = new Date().toISOString()

  const { data: existingConversation, error: lookupError } = await supabaseAdmin
    .from('whatsapp_conversations')
    .select('id')
    .eq('phone', phone)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (lookupError) {
    throw lookupError
  }

  if (existingConversation) {
    const { data: updatedConversation, error: updateError } = await supabaseAdmin
      .from('whatsapp_conversations')
      .update({
        customer_id: customer.id,
        last_message_at: now,
        status: 'aguardando',
        updated_at: now,
      })
      .eq('id', existingConversation.id)
      .select('id')
      .single()

    if (updateError) {
      throw updateError
    }

    return updatedConversation
  }

  const { data: insertedConversation, error: insertError } = await supabaseAdmin
    .from('whatsapp_conversations')
    .insert({
      phone,
      customer_id: customer.id,
      status: 'aguardando',
      last_message_at: now,
      unread_count: 0,
    })
    .select('id')
    .single()

  if (insertError) {
    throw insertError
  }

  return insertedConversation
}

async function loadCampaigns(
  supabaseAdmin: SupabaseAdminClient,
  campaignId?: string
) {
  let query = supabaseAdmin
    .from('campaigns')
    .select(`
      id,
      name,
      status,
      scheduled_at,
      started_at,
      completed_at,
      daily_limit,
      batch_interval_seconds,
      total_recipients,
      sent_count,
      template_variables,
      template:templates(id, name, status, category, variables)
    `)
    .order('created_at', { ascending: true })

  if (campaignId) {
    query = query.eq('id', campaignId)
  } else {
    query = query.in('status', ['scheduled', 'running'])
  }

  const { data, error } = await query

  if (error) {
    throw error
  }

  return (data || []) as ProcessorCampaign[]
}

async function countRecipientsByStatus(
  supabaseAdmin: SupabaseAdminClient,
  campaignId: string,
  status: 'pending'
) {
  const { count, error } = await supabaseAdmin
    .from('campaign_recipients')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', campaignId)
    .eq('status', status)

  if (error) {
    throw error
  }

  return count || 0
}

async function countSentToday(
  supabaseAdmin: SupabaseAdminClient,
  campaignId: string,
  dayStartIso: string
) {
  const { count, error } = await supabaseAdmin
    .from('campaign_recipients')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', campaignId)
    .not('sent_at', 'is', null)
    .gte('sent_at', dayStartIso)

  if (error) {
    throw error
  }

  return count || 0
}

async function getLastSentAt(
  supabaseAdmin: SupabaseAdminClient,
  campaignId: string
) {
  const { data, error } = await supabaseAdmin
    .from('campaign_recipients')
    .select('sent_at')
    .eq('campaign_id', campaignId)
    .not('sent_at', 'is', null)
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw error
  }

  return data?.sent_at || null
}

async function updateCampaignStatus(
  supabaseAdmin: SupabaseAdminClient,
  campaignId: string,
  updates: Record<string, unknown>
) {
  const { error } = await supabaseAdmin
    .from('campaigns')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', campaignId)

  if (error) {
    throw error
  }
}

export async function setCampaignStatus(
  supabaseAdmin: SupabaseAdminClient,
  campaignId: string,
  status: 'paused' | 'running'
) {
  const now = new Date().toISOString()

  await updateCampaignStatus(supabaseAdmin, campaignId, {
    status,
    started_at: status === 'running' ? now : undefined,
    completed_at: status === 'running' ? null : undefined,
  })
}

export async function processCampaign(
  supabaseAdmin: SupabaseAdminClient,
  campaign: ProcessorCampaign,
  options: ProcessCampaignOptions = {}
): Promise<CampaignProcessResult> {
  const now = new Date()
  const nowIso = now.toISOString()
  const template = takeFirst(campaign.template)

  if (!template) {
    return {
      campaignId: campaign.id,
      campaignName: campaign.name,
      status: campaign.status,
      processed: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      pendingRemaining: await countRecipientsByStatus(supabaseAdmin, campaign.id, 'pending'),
      message: 'Campanha sem template vinculado.',
    }
  }

  if (template.status !== 'approved') {
    return {
      campaignId: campaign.id,
      campaignName: campaign.name,
      status: campaign.status,
      processed: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      pendingRemaining: await countRecipientsByStatus(supabaseAdmin, campaign.id, 'pending'),
      message: 'O template da campanha ainda não foi aprovado pela Meta.',
    }
  }

  if (!options.forceStart && campaign.status === 'scheduled' && campaign.scheduled_at) {
    const scheduledAt = new Date(campaign.scheduled_at)
    if (scheduledAt.getTime() > now.getTime()) {
      return {
        campaignId: campaign.id,
        campaignName: campaign.name,
        status: campaign.status,
        processed: 0,
        sent: 0,
        failed: 0,
        skipped: 0,
        pendingRemaining: await countRecipientsByStatus(supabaseAdmin, campaign.id, 'pending'),
        message: 'Campanha ainda não chegou no horário de agendamento.',
      }
    }
  }

  if (!options.forceStart && !['scheduled', 'running'].includes(campaign.status)) {
    return {
      campaignId: campaign.id,
      campaignName: campaign.name,
      status: campaign.status,
      processed: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      pendingRemaining: await countRecipientsByStatus(supabaseAdmin, campaign.id, 'pending'),
      message: 'Campanha não está pronta para processamento.',
    }
  }

  if (options.forceStart || campaign.status === 'scheduled') {
    await updateCampaignStatus(supabaseAdmin, campaign.id, {
      status: 'running',
      started_at: campaign.started_at || nowIso,
      completed_at: null,
    })
  }

  const dayStart = new Date(now)
  dayStart.setHours(0, 0, 0, 0)
  const sentToday = await countSentToday(supabaseAdmin, campaign.id, dayStart.toISOString())
  const remainingDailyLimit = Math.max((campaign.daily_limit || 0) - sentToday, 0)

  if (remainingDailyLimit <= 0) {
    return {
      campaignId: campaign.id,
      campaignName: campaign.name,
      status: 'running',
      processed: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      pendingRemaining: await countRecipientsByStatus(supabaseAdmin, campaign.id, 'pending'),
      message: 'Limite diário atingido para esta campanha.',
    }
  }

  const lastSentAt = await getLastSentAt(supabaseAdmin, campaign.id)
  if (lastSentAt && campaign.batch_interval_seconds > 0) {
    const elapsedMs = now.getTime() - new Date(lastSentAt).getTime()
    const cooldownMs = campaign.batch_interval_seconds * 1000

    if (elapsedMs < cooldownMs) {
      return {
        campaignId: campaign.id,
        campaignName: campaign.name,
        status: 'running',
        processed: 0,
        sent: 0,
        failed: 0,
        skipped: 0,
        pendingRemaining: await countRecipientsByStatus(supabaseAdmin, campaign.id, 'pending'),
        message: 'Intervalo entre lotes ainda em andamento.',
      }
    }
  }

  const recipientLimit = Math.min(remainingDailyLimit, MAX_RECIPIENTS_PER_RUN)
  const { data: recipients, error: recipientsError } = await supabaseAdmin
    .from('campaign_recipients')
    .select(`
      id,
      customer:customers(
        id,
        name,
        phone_normalized,
        accepted_marketing,
        status,
        city
      )
    `)
    .eq('campaign_id', campaign.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(recipientLimit)

  if (recipientsError) {
    throw recipientsError
  }

  let sent = 0
  let failed = 0
  let skipped = 0

  for (const recipientRow of (recipients || []) as ProcessorRecipient[]) {
    const customer = takeFirst(recipientRow.customer)

    if (!customer) {
      skipped += 1
      await supabaseAdmin
        .from('campaign_recipients')
        .update({
          status: 'skipped',
          skip_reason: 'Cliente removido do CRM.',
        })
        .eq('id', recipientRow.id)
      continue
    }

    if (template.category === 'marketing' && (!customer.accepted_marketing || customer.status === 'opt-out')) {
      skipped += 1
      await supabaseAdmin
        .from('campaign_recipients')
        .update({
          status: 'skipped',
          skip_reason: 'Cliente sem consentimento de marketing.',
        })
        .eq('id', recipientRow.id)
      continue
    }

    const phone = normalizeWhatsAppPhone(customer.phone_normalized)
    if (!phone) {
      skipped += 1
      await supabaseAdmin
        .from('campaign_recipients')
        .update({
          status: 'skipped',
          skip_reason: 'Telefone inválido.',
        })
        .eq('id', recipientRow.id)
      continue
    }

    const resolvedVariables = (template.variables || []).map((variableName: string) =>
      resolveVariableValue(variableName, campaign.template_variables?.[variableName], customer)
    )

    if (resolvedVariables.some(value => !value.trim())) {
      skipped += 1
      await supabaseAdmin
        .from('campaign_recipients')
        .update({
          status: 'skipped',
          skip_reason: 'Variáveis obrigatórias do template não foram preenchidas.',
        })
        .eq('id', recipientRow.id)
      continue
    }

    const conversation = await findOrCreateConversation(supabaseAdmin, customer)
    const sendResult = await sendTemplateMessage({
      to: phone,
      templateName: template.name,
      components: buildTemplateComponents(resolvedVariables),
    })

    if (!sendResult.success) {
      failed += 1
      await supabaseAdmin
        .from('campaign_recipients')
        .update({
          status: 'failed',
          skip_reason: sendResult.error || 'Falha ao enviar template pela Meta.',
        })
        .eq('id', recipientRow.id)
      continue
    }

    const wamid = sendResult.data?.messages?.[0]?.id ?? null
    const { data: messageRecord, error: messageInsertError } = await supabaseAdmin
      .from('whatsapp_messages')
      .insert({
        conversation_id: conversation.id,
        wamid,
        direction: 'outbound',
        message_type: 'template',
        content: null,
        template_name: template.name,
        template_variables: campaign.template_variables || {},
        status: 'sent',
        campaign_id: campaign.id,
      })
      .select('id')
      .single()

    if (messageInsertError) {
      failed += 1
      await supabaseAdmin
        .from('campaign_recipients')
        .update({
          status: 'failed',
          skip_reason: messageInsertError.message,
        })
        .eq('id', recipientRow.id)
      continue
    }

    sent += 1
    await supabaseAdmin
      .from('campaign_recipients')
      .update({
        status: 'sent',
        message_id: messageRecord.id,
        sent_at: nowIso,
        skip_reason: null,
      })
      .eq('id', recipientRow.id)
  }

  const pendingRemaining = await countRecipientsByStatus(supabaseAdmin, campaign.id, 'pending')
  const nextStatus = pendingRemaining === 0 ? 'completed' : 'running'

  await updateCampaignStatus(supabaseAdmin, campaign.id, {
    status: nextStatus,
    sent_count: (campaign.sent_count || 0) + sent,
    completed_at: pendingRemaining === 0 ? nowIso : null,
    started_at: campaign.started_at || nowIso,
  })

  return {
    campaignId: campaign.id,
    campaignName: campaign.name,
    status: nextStatus,
    processed: sent + failed + skipped,
    sent,
    failed,
    skipped,
    pendingRemaining,
    message:
      pendingRemaining === 0
        ? 'Campanha concluída.'
        : sent > 0
          ? 'Lote processado com sucesso.'
          : failed > 0 || skipped > 0
            ? 'Lote processado com pendências.'
            : 'Nenhum destinatário elegível neste lote.',
  }
}

export async function processCampaignById(
  supabaseAdmin: SupabaseAdminClient,
  campaignId: string,
  options: ProcessCampaignOptions = {}
) {
  const campaigns = await loadCampaigns(supabaseAdmin, campaignId)
  const campaign = campaigns[0]

  if (!campaign) {
    throw new Error('Campanha não encontrada.')
  }

  return processCampaign(supabaseAdmin, campaign, options)
}

export async function processDueCampaigns(
  supabaseAdmin: SupabaseAdminClient
) {
  const now = new Date()
  const campaigns = await loadCampaigns(supabaseAdmin)
  const dueCampaigns = campaigns.filter(campaign => {
    if (campaign.status === 'running') {
      return true
    }

    if (campaign.status === 'scheduled' && campaign.scheduled_at) {
      return new Date(campaign.scheduled_at).getTime() <= now.getTime()
    }

    return false
  })

  const results: CampaignProcessResult[] = []

  for (const campaign of dueCampaigns) {
    results.push(await processCampaign(supabaseAdmin, campaign))
  }

  return results
}
