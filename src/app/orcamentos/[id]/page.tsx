import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, CircleDollarSign, FileText, MessageSquare } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import QuoteForm from '../QuoteForm'
import {
  QUOTE_STATUS_LABELS,
  STAGE_LABELS,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatPhone,
} from '@/lib/utils'

export const metadata: Metadata = { title: 'Orçamento' }

const quoteStatusBadge: Record<string, string> = {
  rascunho: 'badge-gray',
  enviado: 'badge-blue',
  aprovado: 'badge-green',
  rejeitado: 'badge-red',
  expirado: 'badge-yellow',
}

export default async function OrcamentoDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const [
    { data: quote, error: quoteError },
    { data: items, error: itemsError },
    { data: customers, error: customersError },
    { data: opportunities, error: opportunitiesError },
    { data: vendors, error: vendorsError },
    { data: products, error: productsError },
  ] = await Promise.all([
    supabase
      .from('quotes')
      .select(`
        *,
        customer:customers(id, name, phone_normalized),
        vendor:profiles!vendor_id(id, full_name),
        opportunity:opportunities(id, title, stage, estimated_value)
      `)
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('quote_items')
      .select(`
        *,
        product:products(id, name, stock_quantity)
      `)
      .eq('quote_id', id)
      .order('created_at', { ascending: true }),
    supabase
      .from('customers')
      .select('id, name, phone_normalized')
      .order('name', { ascending: true }),
    supabase
      .from('opportunities')
      .select('id, customer_id, title, stage, estimated_value')
      .order('created_at', { ascending: false }),
    supabase
      .from('profiles')
      .select('id, full_name, user_role')
      .eq('is_active', true)
      .in('user_role', ['admin', 'vendedor'])
      .order('full_name', { ascending: true }),
    supabase
      .from('products')
      .select('id, name, sale_price, stock_quantity, status')
      .order('name', { ascending: true }),
  ])

  if (quoteError) throw new Error(quoteError.message)
  if (itemsError) throw new Error(itemsError.message)
  if (customersError) throw new Error(customersError.message)
  if (opportunitiesError) throw new Error(opportunitiesError.message)
  if (vendorsError) throw new Error(vendorsError.message)
  if (productsError) throw new Error(productsError.message)
  if (!quote) notFound()

  const [{ data: conversations, error: relatedConversationsError }] = quote.customer_id
    ? await Promise.all([
      supabase
        .from('whatsapp_conversations')
        .select('id, status, unread_count, phone, last_message_at, created_at')
        .eq('customer_id', quote.customer_id)
        .order('created_at', { ascending: false })
        .limit(5),
    ])
    : [{ data: [], error: null }]

  if (relatedConversationsError) throw new Error(relatedConversationsError.message)

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div className="flex items-center gap-3">
          <Link href="/orcamentos" className="btn-ghost btn-sm p-2">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="page-title">Orçamento #{quote.quote_number || '—'}</h1>
            <p className="page-subtitle">Edite itens, totais, vínculo comercial e dados de envio</p>
          </div>
        </div>

        <span className={`badge ${quoteStatusBadge[quote.status] || 'badge-gray'}`}>
          {QUOTE_STATUS_LABELS[quote.status] || quote.status}
        </span>
      </div>

      <div className="page-content">
        <div className="mb-5 grid gap-4 md:grid-cols-3">
          <div className="metric-card">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-lg"
              style={{ background: 'rgba(34,197,94,0.12)' }}
            >
              <CircleDollarSign size={18} style={{ color: '#4ade80' }} />
            </div>
            <div>
              <p className="metric-value text-white">{formatCurrency(Number(quote.total || 0))}</p>
              <p className="metric-label">Total atual</p>
            </div>
          </div>

          <div className="metric-card">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-lg"
              style={{ background: 'rgba(59,130,246,0.12)' }}
            >
              <FileText size={18} style={{ color: '#60a5fa' }} />
            </div>
            <div>
              <p className="metric-value text-white">{items?.length || 0}</p>
              <p className="metric-label">Itens vinculados</p>
            </div>
          </div>

          <div className="metric-card">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-lg"
              style={{ background: 'rgba(245,158,11,0.12)' }}
            >
              <MessageSquare size={18} style={{ color: '#fbbf24' }} />
            </div>
            <div>
              <p className="metric-value text-white">
                {quote.sent_via_whatsapp ? 'Enviado' : 'Pendente'}
              </p>
              <p className="metric-label">Status de envio</p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <QuoteForm
            customers={customers || []}
            opportunities={opportunities || []}
            vendors={(vendors || []).map(vendor => ({
              id: vendor.id,
              full_name: vendor.full_name || vendor.user_role || 'Sem nome',
            }))}
            products={products || []}
            quote={quote}
            initialItems={(items || []).map((item: any) => ({
              id: item.id,
              product_id: item.product_id,
              description: item.description,
              quantity: item.quantity,
              unit_price: Number(item.unit_price || 0),
              total_price: Number(item.total_price || 0),
            }))}
          />

          <div className="flex flex-col gap-4">
            <div className="card p-6">
              <h2 className="mb-4 font-semibold text-white">Contexto comercial</h2>
              <div className="flex flex-col gap-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span style={{ color: 'var(--text-secondary)' }}>Cliente</span>
                  <span className="text-right text-white">{quote.customer?.name || 'Não vinculado'}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span style={{ color: 'var(--text-secondary)' }}>WhatsApp</span>
                  <span className="text-right text-white">
                    {quote.customer?.phone_normalized ? formatPhone(quote.customer.phone_normalized) : '—'}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span style={{ color: 'var(--text-secondary)' }}>Vendedor</span>
                  <span className="text-right text-white">{quote.vendor?.full_name || 'Não atribuído'}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span style={{ color: 'var(--text-secondary)' }}>Validade</span>
                  <span className="text-right text-white">
                    {quote.valid_until ? formatDate(quote.valid_until) : 'Não definida'}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span style={{ color: 'var(--text-secondary)' }}>Atualizado em</span>
                  <span className="text-right text-white">{formatDateTime(quote.updated_at)}</span>
                </div>
              </div>
            </div>

            <div className="card p-6">
              <h2 className="mb-4 font-semibold text-white">Oportunidade vinculada</h2>
              {quote.opportunity ? (
                <div className="rounded-xl border p-4" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
                  <p className="font-medium text-white">{quote.opportunity.title}</p>
                  <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                    Etapa: {STAGE_LABELS[quote.opportunity.stage] || quote.opportunity.stage}
                  </p>
                  <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
                    Valor estimado: {formatCurrency(Number(quote.opportunity.estimated_value || 0))}
                  </p>
                </div>
              ) : (
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  Nenhuma oportunidade vinculada.
                </p>
              )}
            </div>

            <div className="card p-6">
              <h2 className="mb-4 font-semibold text-white">Conversas recentes</h2>
              {conversations.length > 0 ? (
                <div className="flex flex-col gap-3">
                  {conversations.map((conversation: any) => (
                    <div
                      key={conversation.id}
                      className="rounded-xl border p-3"
                      style={{ borderColor: 'rgba(255,255,255,0.08)' }}
                    >
                      <p className="font-medium text-white">{formatPhone(conversation.phone)}</p>
                      <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
                        {conversation.status} {conversation.unread_count > 0 ? `• ${conversation.unread_count} não lidas` : ''}
                      </p>
                      <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                        {conversation.last_message_at
                          ? formatDateTime(conversation.last_message_at)
                          : formatDateTime(conversation.created_at)}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  Nenhuma conversa recente encontrada para este cliente.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
