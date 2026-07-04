'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  CalendarClock,
  CircleDollarSign,
  Loader2,
  Save,
  UserRound,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  STAGE_LABELS,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatPhone,
} from '@/lib/utils'

interface OpportunityCustomer {
  id: string
  name: string
  phone_normalized: string
  email: string | null
  city: string | null
  main_interest: string | null
  status: string
}

interface OpportunityVendor {
  id: string
  full_name: string | null
  email: string | null
}

interface OpportunityDetails {
  id: string
  title: string
  stage: keyof typeof STAGE_LABELS
  product_interest: string | null
  estimated_value: number | null
  next_action: string | null
  next_action_date: string | null
  origin: string | null
  notes: string | null
  lost_reason: string | null
  closed_at: string | null
  created_at: string
  updated_at: string
  customer_id: string | null
  vendor_id: string | null
  customer: OpportunityCustomer | null
  vendor: OpportunityVendor | null
}

interface OpportunityHistoryEntry {
  id: string
  action: string
  old_stage: string | null
  new_stage: string | null
  notes: string | null
  created_at: string
  user_name: string
}

interface OpportunityQuote {
  id: string
  quote_number: number | null
  status: string
  total: number | null
  valid_until: string | null
  created_at: string
}

interface VendorOption {
  id: string
  full_name: string
}

interface OpportunityDetailsClientProps {
  opportunity: OpportunityDetails
  history: OpportunityHistoryEntry[]
  quotes: OpportunityQuote[]
  vendors: VendorOption[]
}

const STAGE_OPTIONS = Object.entries(STAGE_LABELS) as Array<[keyof typeof STAGE_LABELS, string]>

const STAGE_BADGES: Record<keyof typeof STAGE_LABELS, string> = {
  novo_lead: 'badge-blue',
  em_atendimento: 'badge-yellow',
  orcamento_enviado: 'badge-purple',
  negociacao: 'badge-yellow',
  aguardando_pagamento: 'badge-blue',
  venda_concluida: 'badge-green',
  perdido: 'badge-gray',
}

const QUOTE_BADGES: Record<string, string> = {
  rascunho: 'badge-gray',
  enviado: 'badge-blue',
  aprovado: 'badge-green',
  rejeitado: 'badge-red',
  expirado: 'badge-yellow',
}

function normalizeCurrencyInput(value: string) {
  return value.replace(/\./g, '').replace(',', '.').trim()
}

export default function OpportunityDetailsClient({
  opportunity,
  history,
  quotes,
  vendors,
}: OpportunityDetailsClientProps) {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [form, setForm] = useState({
    title: opportunity.title,
    stage: opportunity.stage,
    vendorId: opportunity.vendor_id || '',
    productInterest: opportunity.product_interest || '',
    estimatedValue:
      opportunity.estimated_value !== null && opportunity.estimated_value !== undefined
        ? String(opportunity.estimated_value)
        : '',
    nextAction: opportunity.next_action || '',
    nextActionDate: opportunity.next_action_date || '',
    origin: opportunity.origin || '',
    notes: opportunity.notes || '',
    lostReason: opportunity.lost_reason || '',
  })

  const stageChanged = form.stage !== opportunity.stage
  const hasCustomer = Boolean(opportunity.customer)
  const normalizedEstimatedValue = normalizeCurrencyInput(form.estimatedValue)
  const currentEstimatedValue = normalizedEstimatedValue
    ? Number(normalizedEstimatedValue)
    : null
  const hasChanges =
    form.title.trim() !== opportunity.title ||
    form.stage !== opportunity.stage ||
    form.vendorId !== (opportunity.vendor_id || '') ||
    form.productInterest !== (opportunity.product_interest || '') ||
    currentEstimatedValue !== (opportunity.estimated_value ?? null) ||
    form.nextAction !== (opportunity.next_action || '') ||
    form.nextActionDate !== (opportunity.next_action_date || '') ||
    form.origin !== (opportunity.origin || '') ||
    form.notes !== (opportunity.notes || '') ||
    (form.stage === 'perdido' ? form.lostReason : '') !== (opportunity.lost_reason || '')

  const summaryCards = useMemo(
    () => [
      {
        label: 'Etapa atual',
        value: STAGE_LABELS[form.stage],
        icon: CalendarClock,
        badgeClass: STAGE_BADGES[form.stage],
      },
      {
        label: 'Valor estimado',
        value: currentEstimatedValue !== null
          ? formatCurrency(currentEstimatedValue)
          : 'Nao informado',
        icon: CircleDollarSign,
        badgeClass: '',
      },
      {
        label: 'Responsavel',
        value:
          vendors.find(vendor => vendor.id === form.vendorId)?.full_name ||
          opportunity.vendor?.full_name ||
          'Nao atribuido',
        icon: UserRound,
        badgeClass: '',
      },
    ],
    [currentEstimatedValue, form.stage, form.vendorId, opportunity.vendor?.full_name, vendors]
  )

  async function handleSave() {
    setLoading(true)
    setError('')
    setSuccess('')

    const normalizedValue = normalizeCurrencyInput(form.estimatedValue)
    const estimatedValue = normalizedValue ? Number(normalizedValue) : null

    if (!form.title.trim()) {
      setError('Informe um titulo para a oportunidade.')
      setLoading(false)
      return
    }

    if (normalizedValue && Number.isNaN(estimatedValue)) {
      setError('Informe um valor estimado valido.')
      setLoading(false)
      return
    }

    if (!hasChanges) {
      setSuccess('Nenhuma alteracao pendente para salvar.')
      setLoading(false)
      return
    }

    try {
      const { error: updateError } = await supabase
        .from('opportunities')
        .update({
          title: form.title.trim(),
          stage: form.stage,
          vendor_id: form.vendorId || null,
          product_interest: form.productInterest || null,
          estimated_value: estimatedValue,
          next_action: form.nextAction || null,
          next_action_date: form.nextActionDate || null,
          origin: form.origin || null,
          notes: form.notes || null,
          lost_reason: form.stage === 'perdido' ? form.lostReason || null : null,
          closed_at:
            form.stage === 'venda_concluida' || form.stage === 'perdido'
              ? opportunity.closed_at || new Date().toISOString()
              : null,
        })
        .eq('id', opportunity.id)

      if (updateError) {
        throw updateError
      }

      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user) {
        const historyEntries = []

        if (stageChanged) {
          historyEntries.push({
            opportunity_id: opportunity.id,
            user_id: user.id,
            action: 'stage_changed',
            old_stage: opportunity.stage,
            new_stage: form.stage,
            notes: form.notes || null,
          })
        }

        historyEntries.push({
          opportunity_id: opportunity.id,
          user_id: user.id,
          action: stageChanged ? 'updated_after_stage_change' : 'updated',
          old_stage: stageChanged ? null : opportunity.stage,
          new_stage: form.stage,
          notes: 'Detalhes da oportunidade atualizados.',
        })

        await supabase.from('opportunity_history').insert(historyEntries)
      }

      setSuccess('Oportunidade atualizada com sucesso.')
      router.refresh()
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'Erro ao salvar oportunidade.'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full" style={{ maxWidth: '1180px' }}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <Link href="/crm" className="btn-ghost btn-sm">
            <ArrowLeft size={16} />
            Voltar ao funil
          </Link>
          <span className={`badge ${STAGE_BADGES[form.stage]}`}>
            {STAGE_LABELS[form.stage]}
          </span>
        </div>
        <div className="flex gap-3">
          {hasCustomer && opportunity.customer && (
            <Link href={`/clientes/${opportunity.customer.id}`} className="btn-secondary">
              Ver cliente
            </Link>
          )}
          <button type="button" className="btn-primary" onClick={handleSave} disabled={loading}>
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Salvar alteracoes
          </button>
        </div>
      </div>

      {error && (
        <div
          className="mb-4 p-3 rounded-lg text-sm border"
          style={{
            background: 'rgba(239,68,68,0.1)',
            borderColor: 'rgba(239,68,68,0.2)',
            color: '#f87171',
          }}
        >
          {error}
        </div>
      )}

      {success && (
        <div
          className="mb-4 p-3 rounded-lg text-sm border"
          style={{
            background: 'rgba(34,197,94,0.1)',
            borderColor: 'rgba(34,197,94,0.2)',
            color: '#4ade80',
          }}
        >
          {success}
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-4 mb-4">
        {summaryCards.map(card => (
          <div key={card.label} className="metric-card">
            <div className="flex items-center justify-between">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center"
                style={{ background: 'rgba(220,38,38,0.12)' }}
              >
                <card.icon size={18} style={{ color: 'var(--brand-red)' }} />
              </div>
              {card.badgeClass && <span className={`badge ${card.badgeClass}`}>{card.value}</span>}
            </div>
            <div>
              {!card.badgeClass && (
                <p className="metric-value" style={{ fontSize: '1.25rem' }}>
                  {card.value}
                </p>
              )}
              <p className="metric-label">{card.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 flex flex-col gap-4">
          <div className="card p-6">
            <h2 className="font-semibold text-white mb-4">Dados principais</h2>
            <div className="grid gap-4">
              <div className="form-group">
                <label htmlFor="title" className="label">Titulo *</label>
                <input
                  id="title"
                  className="input"
                  value={form.title}
                  onChange={event => setForm(prev => ({ ...prev, title: event.target.value }))}
                />
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div className="form-group">
                  <label htmlFor="stage" className="label">Etapa</label>
                  <select
                    id="stage"
                    className="select"
                    value={form.stage}
                    onChange={event =>
                      setForm(prev => ({
                        ...prev,
                        stage: event.target.value as keyof typeof STAGE_LABELS,
                      }))
                    }
                  >
                    {STAGE_OPTIONS.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="vendorId" className="label">Responsavel</label>
                  <select
                    id="vendorId"
                    className="select"
                    value={form.vendorId}
                    onChange={event => setForm(prev => ({ ...prev, vendorId: event.target.value }))}
                  >
                    <option value="">Nao atribuido</option>
                    {vendors.map(vendor => (
                      <option key={vendor.id} value={vendor.id}>
                        {vendor.full_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div className="form-group">
                  <label htmlFor="productInterest" className="label">Produto ou interesse</label>
                  <input
                    id="productInterest"
                    className="input"
                    value={form.productInterest}
                    onChange={event =>
                      setForm(prev => ({ ...prev, productInterest: event.target.value }))
                    }
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="estimatedValue" className="label">Valor estimado</label>
                  <input
                    id="estimatedValue"
                    className="input"
                    inputMode="decimal"
                    value={form.estimatedValue}
                    onChange={event =>
                      setForm(prev => ({ ...prev, estimatedValue: event.target.value }))
                    }
                  />
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div className="form-group">
                  <label htmlFor="origin" className="label">Origem</label>
                  <input
                    id="origin"
                    className="input"
                    value={form.origin}
                    onChange={event => setForm(prev => ({ ...prev, origin: event.target.value }))}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="nextActionDate" className="label">Proxima acao em</label>
                  <input
                    id="nextActionDate"
                    type="date"
                    className="input"
                    value={form.nextActionDate}
                    onChange={event =>
                      setForm(prev => ({ ...prev, nextActionDate: event.target.value }))
                    }
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="nextAction" className="label">Proxima acao</label>
                <input
                  id="nextAction"
                  className="input"
                  value={form.nextAction}
                  onChange={event => setForm(prev => ({ ...prev, nextAction: event.target.value }))}
                  placeholder="Ex.: retornar ligacao, enviar proposta, cobrar resposta"
                />
              </div>

              <div className="form-group">
                <label htmlFor="notes" className="label">Observacoes</label>
                <textarea
                  id="notes"
                  className="input"
                  rows={6}
                  value={form.notes}
                  onChange={event => setForm(prev => ({ ...prev, notes: event.target.value }))}
                  style={{ resize: 'vertical' }}
                />
              </div>

              {form.stage === 'perdido' && (
                <div className="form-group">
                  <label htmlFor="lostReason" className="label">Motivo da perda</label>
                  <textarea
                    id="lostReason"
                    className="input"
                    rows={3}
                    value={form.lostReason}
                    onChange={event =>
                      setForm(prev => ({ ...prev, lostReason: event.target.value }))
                    }
                    style={{ resize: 'vertical' }}
                  />
                </div>
              )}
            </div>
          </div>

          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-white">Historico</h2>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {history.length} registros
              </span>
            </div>
            {history.length > 0 ? (
              <div className="flex flex-col gap-3">
                {history.map(entry => (
                  <div
                    key={entry.id}
                    className="p-4 rounded-lg"
                    style={{
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid var(--border-color)',
                    }}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="badge badge-gray">{entry.action}</span>
                        {entry.new_stage && (
                          <span className={`badge ${STAGE_BADGES[(entry.new_stage as keyof typeof STAGE_LABELS)] || 'badge-gray'}`}>
                            {STAGE_LABELS[(entry.new_stage as keyof typeof STAGE_LABELS)] || entry.new_stage}
                          </span>
                        )}
                      </div>
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {formatDateTime(entry.created_at)}
                      </span>
                    </div>
                    <p className="text-sm text-white mb-1">{entry.user_name}</p>
                    {entry.notes && (
                      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                        {entry.notes}
                      </p>
                    )}
                    {entry.old_stage && entry.new_stage && entry.old_stage !== entry.new_stage && (
                      <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
                        {STAGE_LABELS[(entry.old_stage as keyof typeof STAGE_LABELS)] || entry.old_stage}
                        {' -> '}
                        {STAGE_LABELS[(entry.new_stage as keyof typeof STAGE_LABELS)] || entry.new_stage}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                Nenhum historico registrado para esta oportunidade.
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="card p-6">
            <h2 className="font-semibold text-white mb-4">Cliente vinculado</h2>
            {opportunity.customer ? (
              <div className="flex flex-col gap-3">
                <div>
                  <p className="text-base font-semibold text-white">{opportunity.customer.name}</p>
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    {formatPhone(opportunity.customer.phone_normalized)}
                  </p>
                </div>
                {opportunity.customer.email && (
                  <div>
                    <p className="text-xs uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                      E-mail
                    </p>
                    <p className="text-sm text-white">{opportunity.customer.email}</p>
                  </div>
                )}
                {opportunity.customer.city && (
                  <div>
                    <p className="text-xs uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                      Cidade
                    </p>
                    <p className="text-sm text-white">{opportunity.customer.city}</p>
                  </div>
                )}
                {opportunity.customer.main_interest && (
                  <div>
                    <p className="text-xs uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                      Interesse principal
                    </p>
                    <p className="text-sm text-white">{opportunity.customer.main_interest}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                    Status do cliente
                  </p>
                  <span className={`badge ${opportunity.customer.status === 'ativo' ? 'badge-green' : 'badge-gray'}`}>
                    {opportunity.customer.status}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                Esta oportunidade ainda nao possui cliente vinculado.
              </p>
            )}
          </div>

          <div className="card p-6">
            <h2 className="font-semibold text-white mb-4">Datas importantes</h2>
            <div className="flex flex-col gap-3">
              <div>
                <p className="text-xs uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                  Criada em
                </p>
                <p className="text-sm text-white">{formatDateTime(opportunity.created_at)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                  Ultima atualizacao
                </p>
                <p className="text-sm text-white">{formatDateTime(opportunity.updated_at)}</p>
              </div>
              {opportunity.next_action_date && (
                <div>
                  <p className="text-xs uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                    Proxima acao
                  </p>
                  <p className="text-sm text-white">{formatDate(opportunity.next_action_date)}</p>
                </div>
              )}
              {opportunity.closed_at && (
                <div>
                  <p className="text-xs uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                    Encerrada em
                  </p>
                  <p className="text-sm text-white">{formatDateTime(opportunity.closed_at)}</p>
                </div>
              )}
            </div>
          </div>

          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-white">Orcamentos relacionados</h2>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {quotes.length} itens
              </span>
            </div>
            {quotes.length > 0 ? (
              <div className="flex flex-col gap-3">
                {quotes.map(quote => (
                  <div
                    key={quote.id}
                    className="p-4 rounded-lg"
                    style={{
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid var(--border-color)',
                    }}
                  >
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <p className="text-sm font-medium text-white">
                        Orcamento #{quote.quote_number || 'N/A'}
                      </p>
                      <span className={`badge ${QUOTE_BADGES[quote.status] || 'badge-gray'}`}>
                        {quote.status}
                      </span>
                    </div>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                      Total: {formatCurrency(Number(quote.total || 0))}
                    </p>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                      Criado em {formatDateTime(quote.created_at)}
                    </p>
                    {quote.valid_until && (
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        Valido ate {formatDate(quote.valid_until)}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                Nenhum orcamento vinculado a esta oportunidade.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
