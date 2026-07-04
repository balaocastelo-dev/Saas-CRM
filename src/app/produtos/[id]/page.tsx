import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, FileText, Package, ShoppingCart } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import ProductForm from '../ProductForm'
import {
  PRODUCT_CATEGORY_LABELS,
  PRODUCT_STATUS_LABELS,
  QUOTE_STATUS_LABELS,
  formatCurrency,
  formatDateTime,
} from '@/lib/utils'

export const metadata: Metadata = { title: 'Produto' }

const quoteStatusBadge: Record<string, string> = {
  rascunho: 'badge-gray',
  enviado: 'badge-blue',
  aprovado: 'badge-green',
  rejeitado: 'badge-red',
  expirado: 'badge-yellow',
}

export default async function ProdutoDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: product, error: productError }, { data: recentItems, error: recentItemsError }] = await Promise.all([
    supabase
      .from('products')
      .select('*')
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('quote_items')
      .select(`
        id,
        description,
        quantity,
        unit_price,
        total_price,
        created_at,
        quote:quotes(id, quote_number, status)
      `)
      .eq('product_id', id)
      .order('created_at', { ascending: false })
      .limit(6),
  ])

  if (productError) throw new Error(productError.message)
  if (recentItemsError) throw new Error(recentItemsError.message)
  if (!product) notFound()

  const linkedQuotes = recentItems || []

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div className="flex items-center gap-3">
          <Link href="/produtos" className="btn-ghost btn-sm p-2">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="page-title">{product.name}</h1>
            <p className="page-subtitle">Edite dados comerciais, estoque e vínculos com orçamentos</p>
          </div>
        </div>
      </div>

      <div className="page-content">
        <div className="mb-5 grid gap-4 md:grid-cols-3">
          <div className="metric-card">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-lg"
              style={{ background: 'rgba(59,130,246,0.12)' }}
            >
              <Package size={18} style={{ color: '#60a5fa' }} />
            </div>
            <div>
              <p className="metric-value text-white">
                {PRODUCT_CATEGORY_LABELS[product.category] || product.category}
              </p>
              <p className="metric-label">Categoria</p>
            </div>
          </div>

          <div className="metric-card">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-lg"
              style={{ background: 'rgba(34,197,94,0.12)' }}
            >
              <ShoppingCart size={18} style={{ color: '#4ade80' }} />
            </div>
            <div>
              <p className="metric-value text-white">{formatCurrency(Number(product.sale_price || 0))}</p>
              <p className="metric-label">Preço de venda atual</p>
            </div>
          </div>

          <div className="metric-card">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-lg"
              style={{ background: 'rgba(245,158,11,0.12)' }}
            >
              <FileText size={18} style={{ color: '#fbbf24' }} />
            </div>
            <div>
              <p className="metric-value text-white">{linkedQuotes.length}</p>
              <p className="metric-label">Itens em orçamentos recentes</p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <ProductForm product={product} />

          <div className="flex flex-col gap-4">
            <div className="card p-6">
              <h2 className="mb-4 font-semibold text-white">Dados do cadastro</h2>
              <div className="flex flex-col gap-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span style={{ color: 'var(--text-secondary)' }}>Status</span>
                  <span className="text-white">
                    {PRODUCT_STATUS_LABELS[product.status] || product.status}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span style={{ color: 'var(--text-secondary)' }}>Estoque</span>
                  <span className="text-white">{product.stock_quantity}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span style={{ color: 'var(--text-secondary)' }}>Criado em</span>
                  <span className="text-white">{formatDateTime(product.created_at)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span style={{ color: 'var(--text-secondary)' }}>Atualizado em</span>
                  <span className="text-white">{formatDateTime(product.updated_at)}</span>
                </div>
              </div>
            </div>

            <div className="card p-6">
              <h2 className="mb-4 font-semibold text-white">Orçamentos recentes</h2>

              {linkedQuotes.length > 0 ? (
                <div className="flex flex-col gap-3">
                  {linkedQuotes.map((item: any) => (
                    <div
                      key={item.id}
                      className="rounded-xl border p-3"
                      style={{ borderColor: 'rgba(255,255,255,0.08)' }}
                    >
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <span className="font-medium text-white">
                          Orçamento #{item.quote?.quote_number || '—'}
                        </span>
                        <span className={`badge ${quoteStatusBadge[item.quote?.status] || 'badge-gray'}`}>
                          {QUOTE_STATUS_LABELS[item.quote?.status] || item.quote?.status || 'Sem status'}
                        </span>
                      </div>
                      <p className="text-sm text-white">{item.description}</p>
                      <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                        {item.quantity} x {formatCurrency(Number(item.unit_price || 0))} = {formatCurrency(Number(item.total_price || 0))}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  Este produto ainda não foi usado em itens recentes de orçamento.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
