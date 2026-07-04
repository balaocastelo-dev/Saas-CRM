import { createClient } from '@/lib/supabase/server'
import { Plus, Wrench, Clock, AlertCircle, CheckCircle } from 'lucide-react'
import Link from 'next/link'
import type { Metadata } from 'next'
import { SERVICE_ORDER_STATUS_LABELS } from '@/lib/utils'

export const metadata: Metadata = { title: 'Ordens de Serviço' }

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

export default async function OrdensPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()

  let query = supabase
    .from('service_orders')
    .select(`
      id, order_number, equipment, brand, model, reported_issue,
      status, deadline, total_value, created_at,
      customer:customers(name),
      technician:profiles!technician_id(full_name)
    `)
    .order('created_at', { ascending: false })

  if (params.status) query = query.eq('status', params.status)
  if (params.q) query = query.ilike('equipment', `%${params.q}%`)

  const { data: orders } = await query

  const stats = {
    total: orders?.length || 0,
    em_manutencao: orders?.filter(o => o.status === 'em_manutencao').length || 0,
    pronto: orders?.filter(o => o.status === 'pronto').length || 0,
    aguardando_peca: orders?.filter(o => o.status === 'aguardando_peca').length || 0,
  }

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Ordens de Serviço</h1>
          <p className="page-subtitle">Controle de assistência técnica</p>
        </div>
        <Link href="/ordens/nova" className="btn-primary">
          <Plus size={15} /> Nova OS
        </Link>
      </div>

      <div className="page-content">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Total abertas', value: stats.total, color: '#3b82f6', icon: Wrench },
            { label: 'Em manutenção', value: stats.em_manutencao, color: '#DC2626', icon: AlertCircle },
            { label: 'Prontas p/ entrega', value: stats.pronto, color: '#22c55e', icon: CheckCircle },
            { label: 'Aguard. peça', value: stats.aguardando_peca, color: '#f59e0b', icon: Clock },
          ].map(stat => (
            <div key={stat.label} className="metric-card">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center"
                style={{ background: `${stat.color}15` }}>
                <stat.icon size={18} style={{ color: stat.color }} />
              </div>
              <div>
                <p className="metric-value" style={{ color: stat.color }}>{stat.value}</p>
                <p className="metric-label">{stat.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap gap-2 mb-5">
          {['', 'recebido', 'em_analise', 'em_manutencao', 'aguardando_peca', 'pronto', 'entregue'].map(s => (
            <Link key={s}
              href={s ? `/ordens?status=${s}` : '/ordens'}
              className={`badge cursor-pointer transition-all ${
                params.status === s || (!params.status && s === '')
                  ? 'badge-red'
                  : 'badge-gray hover:badge-red'
              }`}>
              {s ? SERVICE_ORDER_STATUS_LABELS[s] : 'Todas'}
            </Link>
          ))}
        </div>

        {/* Table */}
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Nº OS</th>
                <th>Cliente</th>
                <th>Equipamento</th>
                <th>Defeito</th>
                <th>Técnico</th>
                <th>Status</th>
                <th>Prazo</th>
                <th>Valor</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {orders && orders.length > 0 ? orders.map((order: any) => (
                <tr key={order.id}>
                  <td>
                    <span className="font-mono text-sm font-bold" style={{ color: 'var(--brand-red)' }}>
                      #{order.order_number}
                    </span>
                  </td>
                  <td>
                    <span className="text-sm font-medium">{order.customer?.name || '—'}</span>
                  </td>
                  <td>
                    <div>
                      <p className="text-sm font-medium text-white">{order.equipment}</p>
                      {(order.brand || order.model) && (
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          {[order.brand, order.model].filter(Boolean).join(' ')}
                        </p>
                      )}
                    </div>
                  </td>
                  <td>
                    <span className="text-sm line-clamp-1" style={{ color: 'var(--text-secondary)' }}>
                      {order.reported_issue}
                    </span>
                  </td>
                  <td>
                    <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                      {order.technician?.full_name || '—'}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${statusBadge[order.status] || 'badge-gray'}`}>
                      {SERVICE_ORDER_STATUS_LABELS[order.status] || order.status}
                    </span>
                  </td>
                  <td>
                    {order.deadline ? (
                      <span className={`text-sm ${
                        new Date(order.deadline) < new Date() && !['entregue','cancelado'].includes(order.status)
                          ? 'text-red-400' : ''
                      }`}>
                        {new Date(order.deadline).toLocaleDateString('pt-BR')}
                      </span>
                    ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                  </td>
                  <td>
                    <span className="text-sm font-medium text-white">
                      {order.total_value > 0 ? `R$ ${order.total_value.toFixed(2)}` : '—'}
                    </span>
                  </td>
                  <td>
                    <Link href={`/ordens/${order.id}`} className="btn-ghost btn-sm">Ver</Link>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={9}>
                    <div className="text-center py-12">
                      <Wrench size={32} className="mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
                      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Nenhuma ordem de serviço</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
