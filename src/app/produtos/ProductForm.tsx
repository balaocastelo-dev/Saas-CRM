'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, Package, Save } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  PRODUCT_CATEGORY_LABELS,
  PRODUCT_STATUS_LABELS,
  formatCurrency,
} from '@/lib/utils'

interface ProductRecord {
  id: string
  name: string
  category: string
  description: string | null
  cost_price: number | null
  sale_price: number | null
  stock_quantity: number
  status: string
  photos: string[] | null
  notes: string | null
  created_at?: string
  updated_at?: string
}

interface ProductFormProps {
  product?: ProductRecord
}

const CATEGORY_OPTIONS = Object.entries(PRODUCT_CATEGORY_LABELS)
const STATUS_OPTIONS = Object.entries(PRODUCT_STATUS_LABELS)

function normalizeDecimalInput(value: string) {
  return value.replace(/\./g, '').replace(',', '.').trim()
}

export default function ProductForm({ product }: ProductFormProps) {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [form, setForm] = useState({
    name: product?.name || '',
    category: product?.category || 'outros',
    description: product?.description || '',
    costPrice: product?.cost_price !== null && product?.cost_price !== undefined
      ? String(product.cost_price)
      : '',
    salePrice: product?.sale_price !== null && product?.sale_price !== undefined
      ? String(product.sale_price)
      : '',
    stockQuantity: String(product?.stock_quantity ?? 0),
    status: product?.status || 'ativo',
    notes: product?.notes || '',
    photos: Array.isArray(product?.photos) ? product?.photos.join('\n') : '',
  })

  const metrics = useMemo(() => {
    const normalizedCost = normalizeDecimalInput(form.costPrice)
    const normalizedSale = normalizeDecimalInput(form.salePrice)
    const cost = normalizedCost ? Number(normalizedCost) : 0
    const sale = normalizedSale ? Number(normalizedSale) : 0
    const stock = Number(form.stockQuantity || 0)
    const margin = cost > 0 && sale > 0 ? ((sale - cost) / sale) * 100 : null

    return {
      stock,
      margin,
      projectedValue: sale > 0 ? sale * Math.max(stock, 0) : 0,
    }
  }, [form.costPrice, form.salePrice, form.stockQuantity])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')

    if (!form.name.trim()) {
      setError('Informe o nome do produto.')
      setLoading(false)
      return
    }

    const normalizedCost = normalizeDecimalInput(form.costPrice)
    const normalizedSale = normalizeDecimalInput(form.salePrice)
    const costPrice = normalizedCost ? Number(normalizedCost) : null
    const salePrice = normalizedSale ? Number(normalizedSale) : null
    const stockQuantity = Number(form.stockQuantity || 0)

    if (normalizedCost && Number.isNaN(costPrice)) {
      setError('Informe um preço de custo válido.')
      setLoading(false)
      return
    }

    if (normalizedSale && Number.isNaN(salePrice)) {
      setError('Informe um preço de venda válido.')
      setLoading(false)
      return
    }

    if (!Number.isInteger(stockQuantity) || stockQuantity < 0) {
      setError('O estoque precisa ser um número inteiro maior ou igual a zero.')
      setLoading(false)
      return
    }

    const payload = {
      name: form.name.trim(),
      category: form.category,
      description: form.description.trim() || null,
      cost_price: costPrice,
      sale_price: salePrice,
      stock_quantity: stockQuantity,
      status: form.status,
      notes: form.notes.trim() || null,
      photos: form.photos
        .split('\n')
        .map(item => item.trim())
        .filter(Boolean),
    }

    try {
      if (product?.id) {
        const { error: updateError } = await supabase
          .from('products')
          .update(payload)
          .eq('id', product.id)

        if (updateError) throw updateError

        setSuccess('Produto atualizado com sucesso.')
        router.refresh()
      } else {
        const { data: createdProduct, error: insertError } = await supabase
          .from('products')
          .insert(payload)
          .select('id')
          .single()

        if (insertError || !createdProduct) {
          throw insertError || new Error('Não foi possível salvar o produto.')
        }

        router.push(`/produtos/${createdProduct.id}`)
        router.refresh()
      }
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Erro ao salvar produto.'
      )
      setLoading(false)
      return
    }

    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit} className="w-full" style={{ maxWidth: '1080px' }}>
      <div className="mb-4 flex items-center gap-3">
        <Link href="/produtos" className="btn-ghost btn-sm">
          <ArrowLeft size={16} />
          Voltar para produtos
        </Link>
        {product?.id && (
          <span className="badge badge-blue">
            SKU interno: {product.id.slice(0, 8)}
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
            <h2 className="mb-4 font-semibold text-white">Dados do produto</h2>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="form-group md:col-span-2">
                <label htmlFor="name" className="label">Nome *</label>
                <input
                  id="name"
                  className="input"
                  value={form.name}
                  onChange={event => setForm(prev => ({ ...prev, name: event.target.value }))}
                  placeholder="Ex.: Notebook Dell Inspiron 15"
                />
              </div>

              <div className="form-group">
                <label htmlFor="category" className="label">Categoria</label>
                <select
                  id="category"
                  className="select"
                  value={form.category}
                  onChange={event => setForm(prev => ({ ...prev, category: event.target.value }))}
                >
                  {CATEGORY_OPTIONS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
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

              <div className="form-group md:col-span-2">
                <label htmlFor="description" className="label">Descrição comercial</label>
                <textarea
                  id="description"
                  className="input"
                  rows={4}
                  value={form.description}
                  onChange={event => setForm(prev => ({ ...prev, description: event.target.value }))}
                  style={{ resize: 'vertical' }}
                  placeholder="Destaques, configuração e diferenciais do item..."
                />
              </div>
            </div>
          </div>

          <div className="card p-6">
            <h2 className="mb-4 font-semibold text-white">Preço e estoque</h2>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="form-group">
                <label htmlFor="costPrice" className="label">Preço de custo</label>
                <input
                  id="costPrice"
                  className="input"
                  inputMode="decimal"
                  value={form.costPrice}
                  onChange={event => setForm(prev => ({ ...prev, costPrice: event.target.value }))}
                  placeholder="Ex.: 2500,00"
                />
              </div>

              <div className="form-group">
                <label htmlFor="salePrice" className="label">Preço de venda</label>
                <input
                  id="salePrice"
                  className="input"
                  inputMode="decimal"
                  value={form.salePrice}
                  onChange={event => setForm(prev => ({ ...prev, salePrice: event.target.value }))}
                  placeholder="Ex.: 3299,00"
                />
              </div>

              <div className="form-group">
                <label htmlFor="stockQuantity" className="label">Quantidade em estoque</label>
                <input
                  id="stockQuantity"
                  type="number"
                  min="0"
                  step="1"
                  className="input"
                  value={form.stockQuantity}
                  onChange={event => setForm(prev => ({ ...prev, stockQuantity: event.target.value }))}
                />
              </div>
            </div>
          </div>

          <div className="card p-6">
            <h2 className="mb-4 font-semibold text-white">Observações e mídia</h2>

            <div className="grid gap-4">
              <div className="form-group">
                <label htmlFor="notes" className="label">Observações internas</label>
                <textarea
                  id="notes"
                  className="input"
                  rows={4}
                  value={form.notes}
                  onChange={event => setForm(prev => ({ ...prev, notes: event.target.value }))}
                  style={{ resize: 'vertical' }}
                  placeholder="Condição do item, lote, fornecedor, garantia..."
                />
              </div>

              <div className="form-group">
                <label htmlFor="photos" className="label">URLs de fotos</label>
                <textarea
                  id="photos"
                  className="input"
                  rows={5}
                  value={form.photos}
                  onChange={event => setForm(prev => ({ ...prev, photos: event.target.value }))}
                  style={{ resize: 'vertical' }}
                  placeholder="Uma URL por linha"
                />
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  O schema atual usa `photos` como array JSON.
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="card p-6">
            <div className="mb-4 flex items-center gap-2">
              <Package size={18} style={{ color: 'var(--brand-red)' }} />
              <h2 className="font-semibold text-white">Resumo</h2>
            </div>

            <div className="flex flex-col gap-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span style={{ color: 'var(--text-secondary)' }}>Categoria</span>
                <span className="text-white">{PRODUCT_CATEGORY_LABELS[form.category] || form.category}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span style={{ color: 'var(--text-secondary)' }}>Status</span>
                <span className="text-white">{PRODUCT_STATUS_LABELS[form.status] || form.status}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span style={{ color: 'var(--text-secondary)' }}>Estoque</span>
                <span className="text-white">{metrics.stock}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span style={{ color: 'var(--text-secondary)' }}>Margem estimada</span>
                <span className="text-white">
                  {metrics.margin !== null ? `${metrics.margin.toFixed(1)}%` : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span style={{ color: 'var(--text-secondary)' }}>Valor em estoque</span>
                <span className="text-white">{formatCurrency(metrics.projectedValue)}</span>
              </div>
            </div>
          </div>

          <div className="card p-6">
            <h2 className="mb-2 font-semibold text-white">Ação</h2>
            <p className="mb-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
              Salva diretamente na tabela `products` do schema atual.
            </p>
            <div className="flex flex-col gap-3">
              <Link href="/produtos" className="btn-secondary w-full justify-center">
                Cancelar
              </Link>
              <button type="submit" className="btn-primary w-full justify-center" disabled={loading}>
                {loading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                {product?.id ? 'Salvar alterações' : 'Criar produto'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </form>
  )
}
