import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  ArrowLeft,
  BadgeDollarSign,
  CalendarDays,
  ClipboardList,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  ShoppingCart,
  Tag,
  UserRound,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatPhone,
  MESSAGE_STATUS_LABELS,
  SERVICE_ORDER_STATUS_LABELS,
  STAGE_LABELS,
} from '@/lib/utils'

export const metadata: Metadata = {
  title: 'Detalhes do Cliente',
}

const customerStatusBadge: Record<string, string> = {
  ativo: 'badge-green',
  inativo: 'badge-gray',
  bloqueado: 'badge-red',
  'opt-out': 'badge-yellow',
}

const quoteStatusBadge: Record<string, string> = {
  rascunho: 'badge-gray',
  enviado: 'badge-blue',
  aprovado: 'badge-green',
  rejeitado: 'badge-red',
  expirado: 'badge-yellow',
}

const orderStatusBadge: Record<string, string> = {
  recebido: 'badge-blue',
  em_analise: 'badge-yellow',
  aguardando_aprovacao: 'badge-yellow',
  em_manutencao: 'badge-red',
  aguardando_peca: 'badge-gray',
  pronto: 'badge-green',
  entregue: 'badge-gray',
  cancelado: 'badge-gray',
}

const conversationStatusBadge: Record<string, string> = {
  aberto: 'badge-blue',
  em_atendimento: 'badge-yellow',
  resolvido: 'badge-green',
  aguardando: 'badge-gray',
}

export default async function ClienteDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: customer } = await supabase
    .from('customers')
    .select(`
      id,
      name,
      phone,
      phone_normalized,
      email,
      cpf_cnpj,
      city,
      neighborhood,
      contact_origin,
      main_interest,
      notes,
      accepted_marketing,
      status,
      last_contact,
      created_at,
      assigned_vendor:profiles!assigned_vendor_id(full_name),
      customer_tags(tag:tags(id, name, color))
    `)
    .eq('id', id)
    .maybeSingle()

  if (!customer) {
    notFound()
  }

  const [opportunitiesResult, quotesResult, ordersResult, conversationsResult] = await Promise.all([
    supabase
      .from('opportunities')
      .select('id, title, stage, estimated_value, next_action, next_action_date, created_at')
      .eq('customer_id', id)
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('quotes')
      .select('id, quote_number, status, total, valid_until, created_at')
      .eq('customer_id', id)
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('service_orders')
      .select('id, order_number, equipment, status, deadline, total_value, created_at')
      .eq('customer_id', id)
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('whatsapp_conversations')
      .select('id, phone, status, unread_count, last_message_at, created_at')
      .eq('customer_id', id)
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  const opportunities = opportunitiesResult.data || []
  const quotes = quotesResult.data || []
  const orders = ordersResult.data || []
  const conversations = conversationsResult.data || []
  const assignedVendor = Array.isArray(customer.assigned_vendor)
    ? customer.assigned_vendor[0]
    : customer.assigned_vendor
  const totalQuoteValue = quotes.reduce((sum, quote) => sum + (quote.total || 0), 0)
  const totalOrderValue = orders.reduce((sum, order) => sum + (order.total_value || 0), 0)

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div className="flex items-center gap-3">
          <Link href="/clientes" className="btn-ghost btn-sm p-2">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="page-title">{customer.name}</h1>
            <p className="page-subtitle">Visao consolidada do cadastro, CRM, orcamentos e atendimento</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className={`badge ${customerStatusBadge[customer.status] || 'badge-gray'}`}>
            {customer.status}
          </span>
          <Link href="/clientes/importar" className="btn-secondary btn-sm">
            Importar mais clientes
          </Link>
        </div>
      </div>

      <div className="page-content">
        <div className="grid lg:grid-cols-3 gap-4 mb-6">
          <div className="metric-card">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center"
              style={{ background: 'rgba(59,130,246,0.12)' }}>
              <ClipboardList size={18} style={{ color: '#60a5fa' }} />
            </div>
            <div>
              <p className="metric-value">{opportunities.length}</p>
              <p className="metric-label">Oportunidades</p>
            </div>
          </div>

          <div className="metric-card">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center"
              style={{ background: 'rgba(34,197,94,0.12)' }}>
              <ShoppingCart size={18} style={{ color: '#4ade80' }} />
            </div>
            <div>
              <p className="metric-value">{formatCurrency(totalQuoteValue)}</p>
              <p className="metric-label">Total em orcamentos listados</p>
            </div>
          </div>

          <div className="metric-card">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center"
              style={{ background: 'rgba(220,38,38,0.12)' }}>
              <BadgeDollarSign size={18} style={{ color: 'var(--brand-red)' }} />
            </div>
            <div>
              <p className="metric-value">{formatCurrency(totalOrderValue)}</p>
              <p className="metric-label">Valor das OS listadas</p>
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 flex flex-col gap-4">
            <div className="card p-6">
              <div className="flex items-center gap-2 mb-4">
                <UserRound size={18} style={{ color: 'var(--brand-red)' }} />
                <h2 className="font-semibold text-white">Dados do cliente</h2>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="flex items-start gap-3">
                  <Phone size={16} className="mt-1" style={{ color: 'var(--text-muted)' }} />
                  <div>
                    <p className="text-xs uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Telefone</p>
                    <p className="text-sm text-white">{formatPhone(customer.phone_normalized || customer.phone)}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Mail size={16} className="mt-1" style={{ color: 'var(--text-muted)' }} />
                  <div>
                    <p className="text-xs uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>E-mail</p>
                    <p className="text-sm text-white">{customer.email || 'Nao informado'}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <MapPin size={16} className="mt-1" style={{ color: 'var(--text-muted)' }} />
                  <div>
                    <p className="text-xs uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Cidade / bairro</p>
                    <p className="text-sm text-white">
                      {[customer.city, customer.neighborhood].filter(Boolean).join(' - ') || 'Nao informado'}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <CalendarDays size={16} className="mt-1" style={{ color: 'var(--text-muted)' }} />
                  <div>
                    <p className="text-xs uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Cadastro</p>
                    <p className="text-sm text-white">{formatDateTime(customer.created_at)}</p>
                  </div>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4 mt-4">
                <div>
                  <p className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>CPF/CNPJ</p>
                  <p className="text-sm text-white">{customer.cpf_cnpj || 'Nao informado'}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Origem</p>
                  <p className="text-sm text-white">{customer.contact_origin || 'Nao informado'}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Interesse principal</p>
                  <p className="text-sm text-white">{customer.main_interest || 'Nao informado'}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Ultimo contato</p>
                  <p className="text-sm text-white">
                    {customer.last_contact ? formatDateTime(customer.last_contact) : 'Sem registro'}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Responsavel</p>
                  <p className="text-sm text-white">{assignedVendor?.full_name || 'Nao atribuido'}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Marketing</p>
                  <span className={`badge ${customer.accepted_marketing ? 'badge-green' : 'badge-gray'}`}>
                    {customer.accepted_marketing ? 'Aceita comunicacao' : 'Nao aceita marketing'}
                  </span>
                </div>
              </div>

              <div className="mt-4">
                <p className="text-xs uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Tags</p>
                <div className="flex flex-wrap gap-2">
                  {(customer.customer_tags || []).length > 0 ? (
                    customer.customer_tags.map((item: any) => (
                      <span
                        key={item.tag?.id || item.tag?.name}
                        className="badge"
                        style={{
                          background: `${item.tag?.color || '#DC2626'}20`,
                          color: item.tag?.color || '#f87171',
                          border: `1px solid ${(item.tag?.color || '#DC2626')}30`,
                        }}
                      >
                        <Tag size={12} />
                        {item.tag?.name}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Nenhuma tag vinculada.</span>
                  )}
                </div>
              </div>

              <div className="mt-4">
                <p className="text-xs uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Observacoes</p>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  {customer.notes || 'Nenhuma observacao registrada.'}
                </p>
              </div>
            </div>

            <div className="card p-6">
              <div className="flex items-center gap-2 mb-4">
                <ClipboardList size={18} style={{ color: 'var(--brand-red)' }} />
                <h2 className="font-semibold text-white">CRM e vendas</h2>
              </div>

              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Tipo</th>
                      <th>Titulo</th>
                      <th>Status</th>
                      <th>Data</th>
                      <th>Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {opportunities.map(opportunity => (
                      <tr key={opportunity.id}>
                        <td><span className="badge badge-blue">Oportunidade</span></td>
                        <td>
                          <div>
                            <p className="text-sm font-medium text-white">{opportunity.title}</p>
                            {opportunity.next_action && (
                              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                Proxima acao: {opportunity.next_action}
                              </p>
                            )}
                          </div>
                        </td>
                        <td>
                          <span className="badge badge-purple">
                            {STAGE_LABELS[opportunity.stage] || opportunity.stage}
                          </span>
                        </td>
                        <td>
                          <span className="text-sm">{formatDate(opportunity.created_at)}</span>
                        </td>
                        <td>
                          <span className="text-sm text-white">
                            {opportunity.estimated_value ? formatCurrency(opportunity.estimated_value) : '-'}
                          </span>
                        </td>
                      </tr>
                    ))}

                    {quotes.map(quote => (
                      <tr key={quote.id}>
                        <td><span className="badge badge-green">Orcamento</span></td>
                        <td>
                          <div>
                            <p className="text-sm font-medium text-white">Orcamento #{quote.quote_number}</p>
                            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                              Validade: {quote.valid_until ? formatDate(quote.valid_until) : 'Nao definida'}
                            </p>
                          </div>
                        </td>
                        <td>
                          <span className={`badge ${quoteStatusBadge[quote.status] || 'badge-gray'}`}>
                            {quote.status}
                          </span>
                        </td>
                        <td>
                          <span className="text-sm">{formatDate(quote.created_at)}</span>
                        </td>
                        <td>
                          <span className="text-sm text-white">{formatCurrency(quote.total || 0)}</span>
                        </td>
                      </tr>
                    ))}

                    {opportunities.length === 0 && quotes.length === 0 && (
                      <tr>
                        <td colSpan={5}>
                          <div className="text-center py-8 text-sm" style={{ color: 'var(--text-muted)' }}>
                            Nenhum registro de CRM ou orcamento para este cliente.
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card p-6">
              <div className="flex items-center gap-2 mb-4">
                <MessageSquare size={18} style={{ color: 'var(--brand-red)' }} />
                <h2 className="font-semibold text-white">Atendimento e servicos</h2>
              </div>

              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Tipo</th>
                      <th>Descricao</th>
                      <th>Status</th>
                      <th>Referencia</th>
                      <th>Atualizacao</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map(order => (
                      <tr key={order.id}>
                        <td><span className="badge badge-yellow">OS</span></td>
                        <td>
                          <p className="text-sm font-medium text-white">{order.equipment}</p>
                        </td>
                        <td>
                          <span className={`badge ${orderStatusBadge[order.status] || 'badge-gray'}`}>
                            {SERVICE_ORDER_STATUS_LABELS[order.status] || order.status}
                          </span>
                        </td>
                        <td>
                          <span className="text-sm">#{order.order_number}</span>
                        </td>
                        <td>
                          <span className="text-sm">
                            {order.deadline ? formatDate(order.deadline) : formatDate(order.created_at)}
                          </span>
                        </td>
                      </tr>
                    ))}

                    {conversations.map(conversation => (
                      <tr key={conversation.id}>
                        <td><span className="badge badge-blue">WhatsApp</span></td>
                        <td>
                          <p className="text-sm font-medium text-white">{formatPhone(conversation.phone)}</p>
                        </td>
                        <td>
                          <span className={`badge ${conversationStatusBadge[conversation.status] || 'badge-gray'}`}>
                            {conversation.status}
                          </span>
                        </td>
                        <td>
                          <span className="text-sm">
                            {conversation.unread_count > 0
                              ? `${conversation.unread_count} nao lidas`
                              : MESSAGE_STATUS_LABELS.read}
                          </span>
                        </td>
                        <td>
                          <span className="text-sm">
                            {conversation.last_message_at
                              ? formatDateTime(conversation.last_message_at)
                              : formatDateTime(conversation.created_at)}
                          </span>
                        </td>
                      </tr>
                    ))}

                    {orders.length === 0 && conversations.length === 0 && (
                      <tr>
                        <td colSpan={5}>
                          <div className="text-center py-8 text-sm" style={{ color: 'var(--text-muted)' }}>
                            Nenhuma ordem de servico ou conversa encontrada.
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="card p-6">
              <h2 className="font-semibold text-white mb-4">Resumo rapido</h2>
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Oportunidades</span>
                  <span className="text-sm text-white font-medium">{opportunities.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Orcamentos</span>
                  <span className="text-sm text-white font-medium">{quotes.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Ordens de servico</span>
                  <span className="text-sm text-white font-medium">{orders.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Conversas</span>
                  <span className="text-sm text-white font-medium">{conversations.length}</span>
                </div>
              </div>
            </div>

            <div className="card p-6">
              <h2 className="font-semibold text-white mb-4">Atalhos</h2>
              <div className="flex flex-col gap-2">
                <Link href="/clientes" className="btn-secondary w-full">Voltar para clientes</Link>
                <Link href="/crm" className="btn-secondary w-full">Abrir CRM</Link>
                <Link href="/orcamentos" className="btn-secondary w-full">Abrir orcamentos</Link>
                <Link href="/ordens" className="btn-secondary w-full">Abrir ordens</Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
