import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, CheckCircle2, MessageSquare, Wrench } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import OrderForm from '../OrderForm'
import {
  SERVICE_ORDER_STATUS_LABELS,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatPhone,
} from '@/lib/utils'

export const metadata: Metadata = { title: 'Ordem de Serviço' }

const statusBadge: Record<string, string> = {
  recebido: 'badge-blue',
  em_analise: 'badge-yellow',
  aguardando_aprovacao: 'badge-yellow',
  em_manutencao: 'badge-red',
  aguardando_peca: 'badge-gray',
  pronto: 'badge-green',
  entregue: 'badge-gray',
  cancelado: 'badge-gray',
}

export default async function OrdemDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const [
    { data: order, error: orderError },
    { data: customers, error: customersError },
    { data: technicians, error: techniciansError },
  ] = await Promise.all([
    supabase
      .from('service_orders')
      .select(`
        *,
        customer:customers(id, name, phone_normalized, city),
        technician:profiles!technician_id(id, full_name)
      `)
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('customers')
      .select('id, name, phone_normalized, city')
      .order('name', { ascending: true }),
    supabase
      .from('profiles')
      .select('id, full_name, user_role')
      .eq('is_active', true)
      .in('user_role', ['admin', 'tecnico'])
      .order('full_name', { ascending: true }),
  ])

  if (orderError) throw new Error(orderError.message)
  if (customersError) throw new Error(customersError.message)
  if (techniciansError) throw new Error(techniciansError.message)
  if (!order) notFound()

  const customerId = order.customer?.id || order.customer_id
  const [
    { data: relatedQuotes, error: relatedQuotesError },
    { data: conversations, error: conversationsError },
  ] = customerId
    ? await Promise.all([
      supabase
        .from('quotes')
        .select('id, quote_number, status, total, valid_until, created_at')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false })
        .limit(5),
      supabase
        .from('whatsapp_conversations')
        .select('id, phone, status, unread_count, last_message_at, created_at')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false })
        .limit(5),
    ])
    : [
      { data: [], error: null },
      { data: [], error: null },
    ]

  if (relatedQuotesError) throw new Error(relatedQuotesError.message)
  if (conversationsError) throw new Error(conversationsError.message)

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div className="flex items-center gap-3">
          <Link href="/ordens" className="btn-ghost btn-sm p-2">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="page-title">OS #{order.order_number || '—'}</h1>
            <p className="page-subtitle">Atualize diagnóstico, execução técnica e comunicação com o cliente</p>
          </div>
        </div>

        <span className={`badge ${statusBadge[order.status] || 'badge-gray'}`}>
          {SERVICE_ORDER_STATUS_LABELS[order.status] || order.status}
        </span>
      </div>

      <div className="page-content">
        <div className="mb-5 grid gap-4 md:grid-cols-3">
          <div className="metric-card">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-lg"
              style={{ background: 'rgba(220,38,38,0.12)' }}
            >
              <Wrench size={18} style={{ color: 'var(--brand-red)' }} />
            </div>
            <div>
              <p className="metric-value text-white">{order.equipment}</p>
              <p className="metric-label">Equipamento</p>
            </div>
          </div>

          <div className="metric-card">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-lg"
              style={{ background: 'rgba(34,197,94,0.12)' }}
            >
              <CheckCircle2 size={18} style={{ color: '#4ade80' }} />
            </div>
            <div>
              <p className="metric-value text-white">{formatCurrency(Number(order.total_value || 0))}</p>
              <p className="metric-label">Valor da OS</p>
            </div>
          </div>

          <div className="metric-card">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-lg"
              style={{ background: 'rgba(59,130,246,0.12)' }}
            >
              <MessageSquare size={18} style={{ color: '#60a5fa' }} />
            </div>
            <div>
              <p className="metric-value text-white">{conversations?.length || 0}</p>
              <p className="metric-label">Conversas do cliente</p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <OrderForm
            customers={customers || []}
            technicians={(technicians || []).map(technician => ({
              id: technician.id,
              full_name: technician.full_name || technician.user_role || 'Sem nome',
            }))}
            order={order}
          />

          <div className="flex flex-col gap-4">
            <div className="card p-6">
              <h2 className="mb-4 font-semibold text-white">Vínculos</h2>
              <div className="flex flex-col gap-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span style={{ color: 'var(--text-secondary)' }}>Cliente</span>
                  <span className="text-right text-white">{order.customer?.name || 'Não vinculado'}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span style={{ color: 'var(--text-secondary)' }}>WhatsApp</span>
                  <span className="text-right text-white">
                    {order.customer?.phone_normalized ? formatPhone(order.customer.phone_normalized) : '—'}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span style={{ color: 'var(--text-secondary)' }}>Técnico</span>
                  <span className="text-right text-white">{order.technician?.full_name || 'Não atribuído'}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span style={{ color: 'var(--text-secondary)' }}>Prazo</span>
                  <span className="text-right text-white">
                    {order.deadline ? formatDate(order.deadline) : 'Não definido'}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span style={{ color: 'var(--text-secondary)' }}>Atualizado em</span>
                  <span className="text-right text-white">{formatDateTime(order.updated_at)}</span>
                </div>
              </div>
            </div>

            <div className="card p-6">
              <h2 className="mb-4 font-semibold text-white">Orçamentos do cliente</h2>

              {customerId && relatedQuotes && relatedQuotes.length > 0 ? (
                <div className="flex flex-col gap-3">
                  {relatedQuotes.map((quote: any) => (
                    <div
                      key={quote.id}
                      className="rounded-xl border p-3"
                      style={{ borderColor: 'rgba(255,255,255,0.08)' }}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium text-white">#{quote.quote_number}</span>
                        <span className="badge badge-gray">{quote.status}</span>
                      </div>
                      <p className="mt-2 text-sm text-white">{formatCurrency(Number(quote.total || 0))}</p>
                      <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                        Criado em {formatDateTime(quote.created_at)}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  Nenhum orçamento encontrado para o cliente vinculado.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
