'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, Plus, Save, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { QUOTE_STATUS_LABELS, STAGE_LABELS, formatCurrency, formatPhone } from '@/lib/utils'

interface CustomerOption {
  id: string
  name: string
  phone_normalized: string | null
}

interface OpportunityOption {
  id: string
  customer_id: string | null
  title: string
  stage: string
  estimated_value: number | null
}

interface VendorOption {
  id: string
  full_name: string
}

interface ProductOption {
  id: string
  name: string
  sale_price: number | null
  stock_quantity: number
  status: string
}

interface QuoteItemRecord {
  id?: string
  product_id: string | null
  description: string
  quantity: number
  unit_price: number
  total_price?: number
}

interface QuoteRecord {
  id: string
  customer_id: string | null
  opportunity_id: string | null
  vendor_id: string | null
  status: string
  valid_until: string | null
  payment_method: string | null
  notes: string | null
  subtotal: number
  discount: number
  total: number
  sent_via_whatsapp: boolean
  sent_at: string | null
  quote_number?: number | null
}

interface QuoteFormProps {
  customers: CustomerOption[]
  opportunities: OpportunityOption[]
  vendors: VendorOption[]
  products: ProductOption[]
  currentUserId?: string
  quote?: QuoteRecord
  initialItems?: QuoteItemRecord[]
}

interface QuoteItemFormState {
  localId: string
  productId: string
  description: string
  quantity: string
  unitPrice: string
}

const STATUS_OPTIONS = Object.entries(QUOTE_STATUS_LABELS)

function normalizeDecimalInput(value: string) {
  return value.replace(/\./g, '').replace(',', '.').trim()
}

function createEmptyItem(): QuoteItemFormState {
  return {
    localId: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    productId: '',
    description: '',
    quantity: '1',
    unitPrice: '',
  }
}

export default function QuoteForm({
  customers,
  opportunities,
  vendors,
  products,
  currentUserId = '',
  quote,
  initialItems = [],
}: QuoteFormProps) {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [form, setForm] = useState({
    customerId: quote?.customer_id || '',
    opportunityId: quote?.opportunity_id || '',
    vendorId: quote?.vendor_id || currentUserId,
    status: quote?.status || 'rascunho',
    validUntil: quote?.valid_until || '',
    paymentMethod: quote?.payment_method || '',
    notes: quote?.notes || '',
    discount:
      quote?.discount !== null && quote?.discount !== undefined
        ? String(quote.discount)
        : '',
    sentViaWhatsapp: quote?.sent_via_whatsapp ?? false,
  })
  const [items, setItems] = useState<QuoteItemFormState[]>(
    initialItems.length > 0
      ? initialItems.map(item => ({
        localId: item.id || `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        productId: item.product_id || '',
        description: item.description,
        quantity: String(item.quantity),
        unitPrice: String(item.unit_price),
      }))
      : [createEmptyItem()]
  )

  const selectedCustomer = useMemo(
    () => customers.find(customer => customer.id === form.customerId) || null,
    [customers, form.customerId]
  )
  const filteredOpportunities = useMemo(
    () =>
      opportunities.filter(opportunity =>
        !form.customerId || opportunity.customer_id === form.customerId
      ),
    [form.customerId, opportunities]
  )

  const totals = useMemo(() => {
    const subtotal = items.reduce((sum, item) => {
      const quantity = Number(item.quantity || 0)
      const unitPrice = Number(normalizeDecimalInput(item.unitPrice) || 0)
      if (Number.isNaN(quantity) || Number.isNaN(unitPrice)) return sum
      return sum + quantity * unitPrice
    }, 0)

    const discount = Number(normalizeDecimalInput(form.discount) || 0)
    const total = Math.max(subtotal - discount, 0)

    return { subtotal, discount, total }
  }, [form.discount, items])

  function updateItem(localId: string, field: keyof QuoteItemFormState, value: string) {
    setItems(prev =>
      prev.map(item => (
        item.localId === localId
          ? { ...item, [field]: value }
          : item
      ))
    )
  }

  function handleSelectProduct(localId: string, productId: string) {
    const product = products.find(item => item.id === productId)

    setItems(prev =>
      prev.map(item => (
        item.localId === localId
          ? {
            ...item,
            productId,
            description: item.description || product?.name || '',
            unitPrice:
              item.unitPrice || product?.sale_price === null || product?.sale_price === undefined
                ? item.unitPrice
                : String(product.sale_price),
          }
          : item
      ))
    )
  }

  function addItem() {
    setItems(prev => [...prev, createEmptyItem()])
  }

  function removeItem(localId: string) {
    setItems(prev => (prev.length > 1 ? prev.filter(item => item.localId !== localId) : prev))
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')

    const parsedDiscount = Number(normalizeDecimalInput(form.discount) || 0)

    if (Number.isNaN(parsedDiscount) || parsedDiscount < 0) {
      setError('Informe um desconto válido.')
      setLoading(false)
      return
    }

    const sanitizedItems = items
      .map(item => {
        const quantity = Number(item.quantity || 0)
        const unitPrice = Number(normalizeDecimalInput(item.unitPrice) || 0)

        return {
          product_id: item.productId || null,
          description: item.description.trim(),
          quantity,
          unit_price: unitPrice,
          total_price: quantity * unitPrice,
        }
      })
      .filter(item => item.description)

    if (sanitizedItems.length === 0) {
      setError('Adicione pelo menos um item no orçamento.')
      setLoading(false)
      return
    }

    const hasInvalidItem = sanitizedItems.some(item =>
      !Number.isFinite(item.quantity) ||
      !Number.isFinite(item.unit_price) ||
      item.quantity <= 0 ||
      item.unit_price < 0
    )

    if (hasInvalidItem) {
      setError('Revise quantidade e preço unitário dos itens.')
      setLoading(false)
      return
    }

    const payload = {
      customer_id: form.customerId || null,
      opportunity_id: form.opportunityId || null,
      vendor_id: form.vendorId || null,
      status: form.status,
      valid_until: form.validUntil || null,
      payment_method: form.paymentMethod.trim() || null,
      notes: form.notes.trim() || null,
      subtotal: totals.subtotal,
      discount: parsedDiscount,
      total: totals.total,
      sent_via_whatsapp: form.sentViaWhatsapp,
      sent_at:
        form.sentViaWhatsapp
          ? quote?.sent_at || new Date().toISOString()
          : null,
    }

    try {
      let quoteId = quote?.id

      if (quoteId) {
        const { error: updateError } = await supabase
          .from('quotes')
          .update(payload)
          .eq('id', quoteId)

        if (updateError) throw updateError

        const { error: deleteItemsError } = await supabase
          .from('quote_items')
          .delete()
          .eq('quote_id', quoteId)

        if (deleteItemsError) throw deleteItemsError
      } else {
        const { data: createdQuote, error: insertError } = await supabase
          .from('quotes')
          .insert(payload)
          .select('id')
          .single()

        if (insertError || !createdQuote) {
          throw insertError || new Error('Não foi possível criar o orçamento.')
        }

        quoteId = createdQuote.id
      }

      const { error: insertItemsError } = await supabase
        .from('quote_items')
        .insert(
          sanitizedItems.map(item => ({
            quote_id: quoteId,
            ...item,
          }))
        )

      if (insertItemsError) throw insertItemsError

      if (quote?.id) {
        setSuccess('Orçamento atualizado com sucesso.')
        router.refresh()
      } else if (quoteId) {
        router.push(`/orcamentos/${quoteId}`)
        router.refresh()
      }
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Erro ao salvar orçamento.'
      )
      setLoading(false)
      return
    }

    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit} className="w-full" style={{ maxWidth: '1180px' }}>
      <div className="mb-4 flex items-center gap-3">
        <Link href="/orcamentos" className="btn-ghost btn-sm">
          <ArrowLeft size={16} />
          Voltar para orçamentos
        </Link>
        {quote?.quote_number && (
          <span className="badge badge-blue">
            Orçamento #{quote.quote_number}
          </span>
        )}
      </div>

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

      {success && (
        <div
          className="mb-4 rounded-lg border p-3 text-sm"
          style={{
            background: 'rgba(34,197,94,0.1)',
            borderColor: 'rgba(34,197,94,0.2)',
            color: '#86efac',
          }}
        >
          {success}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-4">
          <div className="card p-6">
            <h2 className="mb-4 font-semibold text-white">Dados gerais</h2>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="form-group md:col-span-2">
                <label htmlFor="customerId" className="label">Cliente</label>
                <select
                  id="customerId"
                  className="select"
                  value={form.customerId}
                  onChange={event => {
                    const nextCustomerId = event.target.value
                    setForm(prev => ({
                      ...prev,
                      customerId: nextCustomerId,
                      opportunityId:
                        prev.opportunityId &&
                        opportunities.some(opportunity =>
                          opportunity.id === prev.opportunityId &&
                          opportunity.customer_id === nextCustomerId
                        )
                          ? prev.opportunityId
                          : '',
                    }))
                  }}
                >
                  <option value="">Selecione um cliente</option>
                  {customers.map(customer => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                      {customer.phone_normalized ? ` - ${formatPhone(customer.phone_normalized)}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="opportunityId" className="label">Oportunidade vinculada</label>
                <select
                  id="opportunityId"
                  className="select"
                  value={form.opportunityId}
                  onChange={event => setForm(prev => ({ ...prev, opportunityId: event.target.value }))}
                >
                  <option value="">Sem vínculo</option>
                  {filteredOpportunities.map(opportunity => (
                    <option key={opportunity.id} value={opportunity.id}>
                      {opportunity.title} - {STAGE_LABELS[opportunity.stage] || opportunity.stage}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="vendorId" className="label">Vendedor</label>
                <select
                  id="vendorId"
                  className="select"
                  value={form.vendorId}
                  onChange={event => setForm(prev => ({ ...prev, vendorId: event.target.value }))}
                >
                  <option value="">Não atribuído</option>
                  {vendors.map(vendor => (
                    <option key={vendor.id} value={vendor.id}>
                      {vendor.full_name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="status" className="label">Status</label>
                <select
                  id="status"
                  className="select"
                  value={form.status}
                  onChange={event => setForm(prev => ({ ...prev, status: event.target.value }))}
                >
                  {STATUS_OPTIONS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="validUntil" className="label">Validade</label>
                <input
                  id="validUntil"
                  type="date"
                  className="input"
                  value={form.validUntil}
                  onChange={event => setForm(prev => ({ ...prev, validUntil: event.target.value }))}
                />
              </div>

              <div className="form-group md:col-span-2">
                <label htmlFor="paymentMethod" className="label">Condição de pagamento</label>
                <input
                  id="paymentMethod"
                  className="input"
                  value={form.paymentMethod}
                  onChange={event => setForm(prev => ({ ...prev, paymentMethod: event.target.value }))}
                  placeholder="Ex.: PIX, boleto, cartão em 6x"
                />
              </div>
            </div>
          </div>

          <div className="card p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="font-semibold text-white">Itens do orçamento</h2>
              <button type="button" className="btn-secondary btn-sm" onClick={addItem}>
                <Plus size={15} />
                Adicionar item
              </button>
            </div>

            <div className="flex flex-col gap-4">
              {items.map((item, index) => {
                const lineTotal =
                  Number(item.quantity || 0) * Number(normalizeDecimalInput(item.unitPrice) || 0)

                return (
                  <div
                    key={item.localId}
                    className="rounded-2xl border p-4"
                    style={{ borderColor: 'rgba(255,255,255,0.08)' }}
                  >
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <h3 className="font-medium text-white">Item {index + 1}</h3>
                      <button
                        type="button"
                        className="btn-ghost btn-sm"
                        disabled={items.length === 1}
                        onClick={() => removeItem(item.localId)}
                      >
                        <Trash2 size={15} />
                        Remover
                      </button>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="form-group md:col-span-2">
                        <label className="label">Produto</label>
                        <select
                          className="select"
                          value={item.productId}
                          onChange={event => handleSelectProduct(item.localId, event.target.value)}
                        >
                          <option value="">Selecione um produto</option>
                          {products.map(product => (
                            <option key={product.id} value={product.id}>
                              {product.name} - estoque {product.stock_quantity}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="form-group md:col-span-2">
                        <label className="label">Descrição *</label>
                        <textarea
                          className="input"
                          rows={3}
                          value={item.description}
                          onChange={event => updateItem(item.localId, 'description', event.target.value)}
                          style={{ resize: 'vertical' }}
                          placeholder="Descrição comercial do item"
                        />
                      </div>

                      <div className="form-group">
                        <label className="label">Quantidade</label>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          className="input"
                          value={item.quantity}
                          onChange={event => updateItem(item.localId, 'quantity', event.target.value)}
                        />
                      </div>

                      <div className="form-group">
                        <label className="label">Preço unitário</label>
                        <input
                          className="input"
                          inputMode="decimal"
                          value={item.unitPrice}
                          onChange={event => updateItem(item.localId, 'unitPrice', event.target.value)}
                          placeholder="Ex.: 299,90"
                        />
                      </div>
                    </div>

                    <div className="mt-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
                      Total do item: <span className="font-medium text-white">{formatCurrency(Number.isFinite(lineTotal) ? lineTotal : 0)}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="card p-6">
            <h2 className="mb-4 font-semibold text-white">Observações e envio</h2>

            <div className="grid gap-4">
              <div className="form-group">
                <label htmlFor="notes" className="label">Observações</label>
                <textarea
                  id="notes"
                  className="input"
                  rows={5}
                  value={form.notes}
                  onChange={event => setForm(prev => ({ ...prev, notes: event.target.value }))}
                  style={{ resize: 'vertical' }}
                  placeholder="Condições comerciais, prazo de entrega, garantia..."
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="form-group">
                  <label htmlFor="discount" className="label">Desconto</label>
                  <input
                    id="discount"
                    className="input"
                    inputMode="decimal"
                    value={form.discount}
                    onChange={event => setForm(prev => ({ ...prev, discount: event.target.value }))}
                    placeholder="Ex.: 50,00"
                  />
                </div>

                <div className="form-group">
                  <label className="label">Envio por WhatsApp</label>
                  <label className="flex cursor-pointer items-center gap-3">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={form.sentViaWhatsapp}
                      onChange={event =>
                        setForm(prev => ({ ...prev, sentViaWhatsapp: event.target.checked }))
                      }
                    />
                    <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                      Marcar orçamento como enviado
                    </span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="card p-6">
            <h2 className="mb-4 font-semibold text-white">Resumo</h2>
            <div className="flex flex-col gap-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span style={{ color: 'var(--text-secondary)' }}>Cliente</span>
                <span className="text-right text-white">{selectedCustomer?.name || 'Não vinculado'}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span style={{ color: 'var(--text-secondary)' }}>Contato</span>
                <span className="text-right text-white">
                  {selectedCustomer?.phone_normalized ? formatPhone(selectedCustomer.phone_normalized) : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span style={{ color: 'var(--text-secondary)' }}>Subtotal</span>
                <span className="text-right text-white">{formatCurrency(totals.subtotal)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span style={{ color: 'var(--text-secondary)' }}>Desconto</span>
                <span className="text-right text-white">{formatCurrency(totals.discount)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span style={{ color: 'var(--text-secondary)' }}>Total</span>
                <span className="text-right text-white">{formatCurrency(totals.total)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span style={{ color: 'var(--text-secondary)' }}>Status</span>
                <span className="text-right text-white">{QUOTE_STATUS_LABELS[form.status] || form.status}</span>
              </div>
            </div>
          </div>

          <div className="card p-6">
            <h2 className="mb-2 font-semibold text-white">Ação</h2>
            <p className="mb-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
              Salva `quotes` e recria `quote_items` com base no estado atual do formulário.
            </p>
            <div className="flex flex-col gap-3">
              <Link href="/orcamentos" className="btn-secondary w-full justify-center">
                Cancelar
              </Link>
              <button type="submit" className="btn-primary w-full justify-center" disabled={loading}>
                {loading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                {quote?.id ? 'Salvar alterações' : 'Criar orçamento'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </form>
  )
}
