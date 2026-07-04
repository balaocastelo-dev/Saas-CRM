'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Loader2, RefreshCcw, Save } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type TemplateOption = {
  id: string
  name: string
  status: string
  category: string
  variables: string[] | null
}

type TagOption = {
  id: string
  name: string
  color: string
}

type CampaignRecord = {
  id: string
  name: string
  template_id: string | null
  target_filters: Record<string, unknown> | null
  template_variables: Record<string, string> | null
  status: 'draft' | 'scheduled' | 'running' | 'paused' | 'completed' | 'cancelled'
  scheduled_at: string | null
  started_at: string | null
  completed_at: string | null
  daily_limit: number
  batch_interval_seconds: number
  total_recipients: number
  estimated_cost: number | null
}

type CampaignFormProps = {
  templates: TemplateOption[]
  tags: TagOption[]
  campaign?: CampaignRecord
  initialTemplateId?: string
}

const statusLabels = {
  draft: 'Rascunho',
  scheduled: 'Agendada',
  running: 'Em andamento',
  paused: 'Pausada',
  completed: 'Concluída',
  cancelled: 'Cancelada',
}

function toDatetimeLocal(value?: string | null) {
  if (!value) return ''

  const date = new Date(value)
  const timezoneOffset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 16)
}

function fromDatetimeLocal(value: string) {
  if (!value) return null
  return new Date(value).toISOString()
}

function normalizeFilters(input?: Record<string, unknown> | null) {
  return {
    city: typeof input?.city === 'string' ? input.city : '',
    customer_status: typeof input?.customer_status === 'string' ? input.customer_status : '',
    accepted_marketing_only: Boolean(input?.accepted_marketing_only),
    tag_ids: Array.isArray(input?.tag_ids) ? input.tag_ids.filter(Boolean) : [],
  }
}

function normalizeTemplateVariables(
  templateId: string,
  templates: TemplateOption[],
  currentVariables?: Record<string, string> | null
) {
  const selectedTemplate = templates.find((item) => item.id === templateId)
  const variableNames = selectedTemplate?.variables ?? []

  return variableNames.reduce<Record<string, string>>((accumulator, name) => {
    accumulator[name] = currentVariables?.[name] ?? ''
    return accumulator
  }, {})
}

export default function CampaignForm({
  templates,
  tags,
  campaign,
  initialTemplateId,
}: CampaignFormProps) {
  const router = useRouter()
  const supabase = createClient()
  const defaultTemplateId = campaign?.template_id ?? initialTemplateId ?? templates[0]?.id ?? ''
  const defaultFilters = normalizeFilters(campaign?.target_filters)

  const [loading, setLoading] = useState(false)
  const [estimating, setEstimating] = useState(false)
  const [error, setError] = useState('')
  const [estimatedRecipients, setEstimatedRecipients] = useState(campaign?.total_recipients ?? 0)
  const [form, setForm] = useState({
    name: campaign?.name ?? '',
    template_id: defaultTemplateId,
    status: campaign?.status ?? 'draft',
    scheduled_at: toDatetimeLocal(campaign?.scheduled_at),
    daily_limit: String(campaign?.daily_limit ?? 1000),
    batch_interval_seconds: String(campaign?.batch_interval_seconds ?? 5),
    estimated_cost: campaign?.estimated_cost?.toString() ?? '',
    city: defaultFilters.city,
    customer_status: defaultFilters.customer_status,
    accepted_marketing_only: defaultFilters.accepted_marketing_only,
    tag_ids: defaultFilters.tag_ids as string[],
    template_variables: normalizeTemplateVariables(
      defaultTemplateId,
      templates,
      campaign?.template_variables
    ),
  })

  const selectedTemplate = useMemo(
    () => templates.find((item) => item.id === form.template_id),
    [form.template_id, templates]
  )

  function toggleTag(tagId: string) {
    setForm((current) => ({
      ...current,
      tag_ids: current.tag_ids.includes(tagId)
        ? current.tag_ids.filter((value) => value !== tagId)
        : [...current.tag_ids, tagId],
    }))
  }

  async function resolveRecipients() {
    let customerQuery = supabase.from('customers').select('id')

    if (form.city.trim()) {
      customerQuery = customerQuery.ilike('city', `%${form.city.trim()}%`)
    }

    if (form.customer_status) {
      customerQuery = customerQuery.eq('status', form.customer_status)
    }

    if (form.accepted_marketing_only) {
      customerQuery = customerQuery.eq('accepted_marketing', true)
    }

    const { data: customers, error: customerError } = await customerQuery

    if (customerError) throw customerError

    let recipientIds: string[] = (customers ?? []).map((customer: { id: string }) => customer.id)

    if (form.tag_ids.length > 0) {
      const { data: customerTags, error: tagError } = await supabase
        .from('customer_tags')
        .select('customer_id, tag_id')
        .in('tag_id', form.tag_ids)

      if (tagError) throw tagError

      const allowedCustomerIds = new Set<string>(
        (customerTags ?? []).map((row: { customer_id: string }) => row.customer_id)
      )
      recipientIds = recipientIds.filter((customerId: string) => allowedCustomerIds.has(customerId))
    }

    return Array.from(new Set(recipientIds))
  }

  async function handleRefreshRecipients() {
    setEstimating(true)
    setError('')

    try {
      const recipientIds = await resolveRecipients()
      setEstimatedRecipients(recipientIds.length)
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : 'Erro ao estimar destinatários.')
    } finally {
      setEstimating(false)
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError('')

    try {
      if (!form.template_id) {
        throw new Error('Selecione um template para a campanha.')
      }

      if (form.status === 'scheduled' && !form.scheduled_at) {
        throw new Error('Defina a data de agendamento antes de salvar.')
      }

      const recipientIds = await resolveRecipients()
      const now = new Date().toISOString()

      const payload = {
        name: form.name.trim(),
        template_id: form.template_id,
        target_filters: {
          city: form.city.trim() || null,
          customer_status: form.customer_status || null,
          accepted_marketing_only: form.accepted_marketing_only,
          tag_ids: form.tag_ids,
        },
        template_variables: form.template_variables,
        status: form.status,
        scheduled_at: fromDatetimeLocal(form.scheduled_at),
        started_at:
          form.status === 'running'
            ? campaign?.started_at ?? now
            : campaign?.started_at ?? null,
        completed_at:
          form.status === 'completed'
            ? campaign?.completed_at ?? now
            : null,
        daily_limit: Number(form.daily_limit) || 1000,
        batch_interval_seconds: Number(form.batch_interval_seconds) || 5,
        total_recipients: recipientIds.length,
        estimated_cost: form.estimated_cost ? Number(form.estimated_cost) : null,
      }

      const query = campaign
        ? supabase.from('campaigns').update(payload).eq('id', campaign.id)
        : supabase.from('campaigns').insert(payload)

      const { data, error: saveError } = await query.select('id').single()

      if (saveError) throw saveError

      const campaignId = data.id

      const { error: deleteRecipientsError } = await supabase
        .from('campaign_recipients')
        .delete()
        .eq('campaign_id', campaignId)

      if (deleteRecipientsError) throw deleteRecipientsError

      if (recipientIds.length > 0) {
        const { error: insertRecipientsError } = await supabase
          .from('campaign_recipients')
          .insert(
            recipientIds.map((customerId: string) => ({ campaign_id: campaignId, customer_id: customerId }))
          )

        if (insertRecipientsError) throw insertRecipientsError
      }

      setEstimatedRecipients(recipientIds.length)
      router.push(`/campanhas/${campaignId}`)
      router.refresh()
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Erro ao salvar campanha.')
      setLoading(false)
      return
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div>
        {error && (
          <div
            className="mb-4 rounded-lg border p-3 text-sm"
            style={{
              background: 'rgba(239,68,68,0.1)',
              borderColor: 'rgba(239,68,68,0.2)',
              color: '#f87171',
            }}
          >
            {error}
          </div>
        )}

        <div className="card mb-4 p-6">
          <h3 className="mb-4 font-semibold text-white">Dados da campanha</h3>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="form-group sm:col-span-2">
              <label className="label">Nome da campanha *</label>
              <input
                type="text"
                className="input"
                required
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="label">Template *</label>
              <select
                className="select"
                required
                value={form.template_id}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    template_id: event.target.value,
                    template_variables: normalizeTemplateVariables(
                      event.target.value,
                      templates,
                      current.template_variables
                    ),
                  }))
                }
              >
                <option value="">Selecione...</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name} • {template.status}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="label">Status</label>
              <select
                className="select"
                value={form.status}
                onChange={(event) => setForm({ ...form, status: event.target.value as CampaignRecord['status'] })}
              >
                {Object.entries(statusLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="label">Agendar envio</label>
              <input
                type="datetime-local"
                className="input"
                value={form.scheduled_at}
                onChange={(event) => setForm({ ...form, scheduled_at: event.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="label">Custo estimado (R$)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                className="input"
                value={form.estimated_cost}
                onChange={(event) => setForm({ ...form, estimated_cost: event.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="label">Limite diário</label>
              <input
                type="number"
                min="1"
                className="input"
                value={form.daily_limit}
                onChange={(event) => setForm({ ...form, daily_limit: event.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="label">Intervalo entre lotes (s)</label>
              <input
                type="number"
                min="1"
                className="input"
                value={form.batch_interval_seconds}
                onChange={(event) => setForm({ ...form, batch_interval_seconds: event.target.value })}
              />
            </div>
          </div>
        </div>

        <div className="card mb-4 p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-white">Público-alvo</h3>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Os filtros são gravados em `target_filters` e sincronizados com `campaign_recipients`.
              </p>
            </div>

            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={handleRefreshRecipients}
              disabled={estimating}
            >
              {estimating ? <Loader2 size={14} className="animate-spin" /> : <RefreshCcw size={14} />}
              Atualizar estimativa
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="form-group">
              <label className="label">Cidade</label>
              <input
                type="text"
                className="input"
                placeholder="Campinas, Sumaré..."
                value={form.city}
                onChange={(event) => setForm({ ...form, city: event.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="label">Status do cliente</label>
              <select
                className="select"
                value={form.customer_status}
                onChange={(event) => setForm({ ...form, customer_status: event.target.value })}
              >
                <option value="">Todos</option>
                <option value="ativo">Ativo</option>
                <option value="inativo">Inativo</option>
                <option value="bloqueado">Bloqueado</option>
                <option value="opt-out">Opt-out</option>
              </select>
            </div>
          </div>

          <div className="mt-4">
            <label className="mb-3 flex items-center gap-3 cursor-pointer">
              <div className="relative">
                <input
                  type="checkbox"
                  className="peer sr-only"
                  checked={form.accepted_marketing_only}
                  onChange={(event) =>
                    setForm({ ...form, accepted_marketing_only: event.target.checked })
                  }
                />
                <div
                  className="h-6 w-10 rounded-full transition-colors peer-checked:bg-red-600"
                  style={{
                    background: form.accepted_marketing_only
                      ? 'var(--brand-red)'
                      : 'rgba(255,255,255,0.1)',
                  }}
                >
                  <div
                    className={`absolute top-1 left-1 h-4 w-4 rounded-full bg-white transition-transform ${
                      form.accepted_marketing_only ? 'translate-x-4' : ''
                    }`}
                  />
                </div>
              </div>
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Enviar apenas para clientes com consentimento de marketing
              </span>
            </label>
          </div>

          <div className="mt-4">
            <label className="label">Tags</label>
            <div className="mt-2 flex flex-wrap gap-2">
              {tags.length > 0 ? (
                tags.map((tag) => {
                  const selected = form.tag_ids.includes(tag.id)

                  return (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => toggleTag(tag.id)}
                      className="badge cursor-pointer transition-all"
                      style={{
                        background: selected ? `${tag.color}20` : 'rgba(255,255,255,0.06)',
                        color: selected ? tag.color : 'var(--text-secondary)',
                        border: `1px solid ${selected ? `${tag.color}40` : 'rgba(255,255,255,0.1)'}`,
                      }}
                    >
                      {tag.name}
                    </button>
                  )
                })
              ) : (
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  Nenhuma tag cadastrada.
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="card mb-4 p-6">
          <h3 className="mb-4 font-semibold text-white">Variáveis do template</h3>

          {selectedTemplate && (selectedTemplate.variables ?? []).length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {(selectedTemplate.variables ?? []).map((variableName) => (
                <div key={variableName} className="form-group">
                  <label className="label">{variableName}</label>
                  <input
                    type="text"
                    className="input"
                    value={form.template_variables[variableName] ?? ''}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        template_variables: {
                          ...current.template_variables,
                          [variableName]: event.target.value,
                        },
                      }))
                    }
                  />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              O template selecionado não possui variáveis configuradas.
            </p>
          )}
        </div>

        <div className="flex gap-3">
          <Link href="/campanhas" className="btn-secondary">
            Cancelar
          </Link>
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {campaign ? 'Salvar campanha' : 'Criar campanha'}
          </button>
        </div>
      </div>

      <aside className="space-y-4">
        <div className="card p-6">
          <h3 className="mb-3 font-semibold text-white">Resumo</h3>
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span style={{ color: 'var(--text-secondary)' }}>Template</span>
              <span className="text-right text-white">{selectedTemplate?.name || 'Não selecionado'}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span style={{ color: 'var(--text-secondary)' }}>Status</span>
              <span className="text-white">{statusLabels[form.status]}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span style={{ color: 'var(--text-secondary)' }}>Destinatários estimados</span>
              <span className="text-white">{estimatedRecipients}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span style={{ color: 'var(--text-secondary)' }}>Tags ativas</span>
              <span className="text-white">{form.tag_ids.length}</span>
            </div>
          </div>
        </div>

        <div className="card p-6">
          <h3 className="mb-3 font-semibold text-white">Variáveis salvas</h3>
          <div className="space-y-2">
            {Object.entries(form.template_variables).length > 0 ? (
              Object.entries(form.template_variables).map(([key, value]) => (
                <div key={key} className="rounded-lg border p-3" style={{ borderColor: 'var(--border-color)' }}>
                  <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                    {key}
                  </p>
                  <p className="mt-1 text-sm text-white">{value || 'Sem valor definido'}</p>
                </div>
              ))
            ) : (
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                Nenhuma variável a preencher.
              </p>
            )}
          </div>
        </div>
      </aside>
    </form>
  )
}
