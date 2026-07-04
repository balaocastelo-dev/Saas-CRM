'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, Save } from 'lucide-react'
import { STAGE_LABELS, formatPhone } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'

interface CustomerOption {
  id: string
  name: string
  phone_normalized: string
  main_interest: string
}

interface VendorOption {
  id: string
  full_name: string
}

interface NovaOportunidadeFormProps {
  customers: CustomerOption[]
  vendors: VendorOption[]
  currentUserId: string
  initialCustomerId: string
  initialStage: keyof typeof STAGE_LABELS
}

const STAGE_OPTIONS = Object.entries(STAGE_LABELS) as Array<[keyof typeof STAGE_LABELS, string]>

export default function NovaOportunidadeForm({
  customers,
  vendors,
  currentUserId,
  initialCustomerId,
  initialStage,
}: NovaOportunidadeFormProps) {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    title: '',
    customerId: initialCustomerId,
    vendorId: currentUserId,
    productInterest: '',
    estimatedValue: '',
    stage: initialStage,
    nextAction: '',
    nextActionDate: '',
    origin: 'Manual',
    notes: '',
    lostReason: '',
  })

  const selectedCustomer = useMemo(
    () => customers.find(customer => customer.id === form.customerId) || null,
    [customers, form.customerId]
  )

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError('')

    const finalTitle =
      form.title.trim() ||
      (selectedCustomer ? `Oportunidade - ${selectedCustomer.name}` : '')

    if (!finalTitle) {
      setError('Informe um titulo para a oportunidade.')
      setLoading(false)
      return
    }

    const normalizedValue = form.estimatedValue.replace(/\./g, '').replace(',', '.').trim()
    const estimatedValue = normalizedValue ? Number(normalizedValue) : null

    if (normalizedValue && Number.isNaN(estimatedValue)) {
      setError('Informe um valor estimado valido.')
      setLoading(false)
      return
    }

    try {
      const { data: createdOpportunity, error: insertError } = await supabase
        .from('opportunities')
        .insert({
          customer_id: form.customerId || null,
          vendor_id: form.vendorId || null,
          title: finalTitle,
          product_interest: form.productInterest || selectedCustomer?.main_interest || null,
          estimated_value: estimatedValue,
          stage: form.stage,
          next_action: form.nextAction || null,
          next_action_date: form.nextActionDate || null,
          origin: form.origin || 'Manual',
          notes: form.notes || null,
          lost_reason: form.stage === 'perdido' ? form.lostReason || null : null,
          closed_at:
            form.stage === 'venda_concluida' || form.stage === 'perdido'
              ? new Date().toISOString()
              : null,
        })
        .select('id')
        .single()

      if (insertError || !createdOpportunity) {
        throw insertError || new Error('Nao foi possivel criar a oportunidade.')
      }

      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user) {
        await supabase.from('opportunity_history').insert({
          opportunity_id: createdOpportunity.id,
          user_id: user.id,
          action: 'created',
          new_stage: form.stage,
          notes: form.notes || 'Oportunidade criada manualmente.',
        })
      }

      router.push(`/crm/${createdOpportunity.id}`)
      router.refresh()
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Erro ao criar oportunidade.'
      )
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full" style={{ maxWidth: '960px' }}>
      <div className="flex items-center gap-3 mb-4">
        <Link href="/crm" className="btn-ghost btn-sm">
          <ArrowLeft size={16} />
          Voltar ao funil
        </Link>
        {selectedCustomer && (
          <span className="badge badge-blue">
            Cliente: {selectedCustomer.name}
          </span>
        )}
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

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card p-6">
          <h2 className="font-semibold text-white mb-4">Dados da oportunidade</h2>
          <div className="grid gap-4">
            <div className="form-group">
              <label htmlFor="title" className="label">Titulo *</label>
              <input
                id="title"
                className="input"
                value={form.title}
                onChange={event => setForm(prev => ({ ...prev, title: event.target.value }))}
                placeholder="Ex.: Upgrade de notebook para empresa"
              />
            </div>

            <div className="form-group">
              <label htmlFor="customerId" className="label">Cliente</label>
              <select
                id="customerId"
                className="select"
                value={form.customerId}
                onChange={event => {
                  const nextCustomer = customers.find(customer => customer.id === event.target.value)
                  setForm(prev => ({
                    ...prev,
                    customerId: event.target.value,
                    productInterest:
                      prev.productInterest || !nextCustomer?.main_interest
                        ? prev.productInterest
                        : nextCustomer.main_interest,
                    title:
                      prev.title.trim() || !nextCustomer
                        ? prev.title
                        : `Oportunidade - ${nextCustomer.name}`,
                  }))
                }}
              >
                <option value="">Selecione um cliente</option>
                {customers.map(customer => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name} {customer.phone_normalized ? `- ${formatPhone(customer.phone_normalized)}` : ''}
                  </option>
                ))}
              </select>
              {selectedCustomer && (
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  WhatsApp: {formatPhone(selectedCustomer.phone_normalized)}
                </span>
              )}
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

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="form-group">
                <label htmlFor="stage" className="label">Etapa inicial</label>
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
                <label htmlFor="estimatedValue" className="label">Valor estimado</label>
                <input
                  id="estimatedValue"
                  className="input"
                  inputMode="decimal"
                  value={form.estimatedValue}
                  onChange={event =>
                    setForm(prev => ({ ...prev, estimatedValue: event.target.value }))
                  }
                  placeholder="Ex.: 3500,00"
                />
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
                  placeholder="Notebook, PC Gamer, impressora..."
                />
              </div>

              <div className="form-group">
                <label htmlFor="origin" className="label">Origem</label>
                <select
                  id="origin"
                  className="select"
                  value={form.origin}
                  onChange={event => setForm(prev => ({ ...prev, origin: event.target.value }))}
                >
                  <option value="Manual">Manual</option>
                  <option value="WhatsApp">WhatsApp</option>
                  <option value="Loja fisica">Loja fisica</option>
                  <option value="Site">Site</option>
                  <option value="Instagram">Instagram</option>
                  <option value="Indicacao">Indicacao</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <div className="card p-6">
          <h2 className="font-semibold text-white mb-4">Proximo passo</h2>
          <div className="grid gap-4">
            <div className="form-group">
              <label htmlFor="nextAction" className="label">Acao planejada</label>
              <input
                id="nextAction"
                className="input"
                value={form.nextAction}
                onChange={event => setForm(prev => ({ ...prev, nextAction: event.target.value }))}
                placeholder="Ex.: Enviar proposta no WhatsApp"
              />
            </div>

            <div className="form-group">
              <label htmlFor="nextActionDate" className="label">Data da proxima acao</label>
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

            <div className="form-group">
              <label htmlFor="notes" className="label">Observacoes</label>
              <textarea
                id="notes"
                className="input"
                rows={8}
                value={form.notes}
                onChange={event => setForm(prev => ({ ...prev, notes: event.target.value }))}
                style={{ resize: 'vertical' }}
                placeholder="Contexto da negociacao, preferencias do cliente, combinados..."
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
                  onChange={event => setForm(prev => ({ ...prev, lostReason: event.target.value }))}
                  style={{ resize: 'vertical' }}
                  placeholder="Ex.: cliente optou por concorrente"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="card p-5 mt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-medium text-white">Resumo do cadastro</p>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Cria a oportunidade diretamente no Supabase e abre a tela de detalhes em seguida.
            </p>
          </div>
          <div className="flex gap-3">
            <Link href="/crm" className="btn-secondary">
              Cancelar
            </Link>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              Salvar oportunidade
            </button>
          </div>
        </div>
      </div>
    </form>
  )
}
