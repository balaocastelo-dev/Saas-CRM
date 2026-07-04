import { createClient } from '@/lib/supabase/server'
import { 
  Users, MessageSquare, Megaphone, TrendingUp, 
  CheckCircle, Eye, Reply, Wrench, ShoppingCart, Activity
} from 'lucide-react'
import type { Metadata } from 'next'
import DashboardCharts from './DashboardCharts'

export const metadata: Metadata = {
  title: 'Dashboard',
}

async function getDashboardStats(supabase: Awaited<ReturnType<typeof createClient>>) {
  const [
    { count: totalCustomers },
    { count: activeCustomers },
    { count: totalMessages },
    { count: deliveredMessages },
    { count: readMessages },
    { count: activeCampaigns },
    { count: openOrders },
    { count: totalOpportunities },
    { count: closedOpportunities },
  ] = await Promise.all([
    supabase.from('customers').select('*', { count: 'exact', head: true }),
    supabase.from('customers').select('*', { count: 'exact', head: true }).eq('status', 'ativo'),
    supabase.from('whatsapp_messages').select('*', { count: 'exact', head: true }).eq('direction', 'outbound'),
    supabase.from('whatsapp_messages').select('*', { count: 'exact', head: true }).eq('status', 'delivered'),
    supabase.from('whatsapp_messages').select('*', { count: 'exact', head: true }).eq('status', 'read'),
    supabase.from('campaigns').select('*', { count: 'exact', head: true }).in('status', ['running', 'scheduled']),
    supabase.from('service_orders').select('*', { count: 'exact', head: true }).not('status', 'in', '("entregue","cancelado")'),
    supabase.from('opportunities').select('*', { count: 'exact', head: true }),
    supabase.from('opportunities').select('*', { count: 'exact', head: true }).eq('stage', 'venda_concluida'),
  ])

  const conversionRate = totalOpportunities ? Math.round((closedOpportunities || 0) / (totalOpportunities || 1) * 100) : 0

  return {
    totalCustomers: totalCustomers || 0,
    activeCustomers: activeCustomers || 0,
    totalMessages: totalMessages || 0,
    deliveredMessages: deliveredMessages || 0,
    readMessages: readMessages || 0,
    activeCampaigns: activeCampaigns || 0,
    openOrders: openOrders || 0,
    conversionRate,
    closedOpportunities: closedOpportunities || 0,
  }
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const stats = await getDashboardStats(supabase)

  // Recent customers
  const { data: recentCustomers } = await supabase
    .from('customers')
    .select('id, name, phone_normalized, status, created_at')
    .order('created_at', { ascending: false })
    .limit(5)

  // Recent messages
  const { data: recentMessages } = await supabase
    .from('whatsapp_messages')
    .select('id, content, status, direction, created_at')
    .order('created_at', { ascending: false })
    .limit(5)

  const metrics = [
    {
      label: 'Total de Clientes',
      value: stats.totalCustomers.toLocaleString('pt-BR'),
      icon: Users,
      color: '#3b82f6',
      bg: 'rgba(59,130,246,0.12)',
      sub: `${stats.activeCustomers} ativos`,
    },
    {
      label: 'Mensagens Enviadas',
      value: stats.totalMessages.toLocaleString('pt-BR'),
      icon: MessageSquare,
      color: '#22c55e',
      bg: 'rgba(34,197,94,0.12)',
      sub: `${stats.deliveredMessages} entregues`,
    },
    {
      label: 'Mensagens Lidas',
      value: stats.readMessages.toLocaleString('pt-BR'),
      icon: Eye,
      color: '#a855f7',
      bg: 'rgba(168,85,247,0.12)',
      sub: stats.totalMessages ? `${Math.round(stats.readMessages / stats.totalMessages * 100)}% de leitura` : '0%',
    },
    {
      label: 'Campanhas Ativas',
      value: stats.activeCampaigns.toString(),
      icon: Megaphone,
      color: '#f59e0b',
      bg: 'rgba(245,158,11,0.12)',
      sub: 'em andamento',
    },
    {
      label: 'Taxa de Conversão',
      value: `${stats.conversionRate}%`,
      icon: TrendingUp,
      color: '#DC2626',
      bg: 'rgba(220,38,38,0.12)',
      sub: `${stats.closedOpportunities} vendas`,
    },
    {
      label: 'Ordens de Serviço',
      value: stats.openOrders.toString(),
      icon: Wrench,
      color: '#06b6d4',
      bg: 'rgba(6,182,212,0.12)',
      sub: 'em aberto',
    },
  ]

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Balão da Informática Castelo — Visão geral do negócio</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="status-dot-green animate-pulse-soft" />
          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Ao vivo</span>
        </div>
      </div>

      <div className="page-content">
        {/* Metrics Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
          {metrics.map((metric) => (
            <div key={metric.label} className="metric-card animate-fade-in">
              <div className="flex items-start justify-between">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center"
                  style={{ background: metric.bg }}>
                  <metric.icon size={18} style={{ color: metric.color }} />
                </div>
              </div>
              <div>
                <p className="metric-value">{metric.value}</p>
                <p className="metric-label">{metric.label}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{metric.sub}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Charts */}
        <DashboardCharts />

        {/* Recent Activity */}
        <div className="grid lg:grid-cols-2 gap-4 mt-6">
          {/* Recent Customers */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-white text-sm">Clientes Recentes</h3>
              <a href="/clientes" className="text-xs hover:underline" style={{ color: 'var(--brand-red)' }}>
                Ver todos
              </a>
            </div>
            {recentCustomers && recentCustomers.length > 0 ? (
              <div className="flex flex-col gap-3">
                {recentCustomers.map((customer) => (
                  <div key={customer.id} className="flex items-center gap-3">
                    <div className="avatar w-8 h-8 text-xs flex-shrink-0">
                      {customer.name?.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{customer.name}</p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{customer.phone_normalized}</p>
                    </div>
                    <span className={`badge ${customer.status === 'ativo' ? 'badge-green' : 'badge-gray'}`}>
                      {customer.status}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <Users size={32} style={{ color: 'var(--text-muted)' }} className="mx-auto mb-2" />
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Nenhum cliente ainda</p>
                <a href="/clientes" className="text-xs mt-1 inline-block hover:underline" style={{ color: 'var(--brand-red)' }}>
                  Adicionar primeiro cliente
                </a>
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div className="card p-5">
            <h3 className="font-semibold text-white text-sm mb-4">Ações Rápidas</h3>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Nova Campanha', href: '/campanhas/nova', icon: Megaphone, color: '#f59e0b' },
                { label: 'Novo Cliente', href: '/clientes/novo', icon: Users, color: '#3b82f6' },
                { label: 'Novo Orçamento', href: '/orcamentos/novo', icon: ShoppingCart, color: '#22c55e' },
                { label: 'Nova OS', href: '/ordens/nova', icon: Wrench, color: '#06b6d4' },
                { label: 'CRM Funil', href: '/crm', icon: Activity, color: '#DC2626' },
                { label: 'Atendimento', href: '/atendimento', icon: MessageSquare, color: '#a855f7' },
              ].map((action) => (
                <a key={action.label} href={action.href}
                  className="flex items-center gap-2.5 p-3 rounded-lg transition-all hover:translate-y-[-1px]"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid var(--border-color)'
                  }}>
                  <action.icon size={16} style={{ color: action.color }} />
                  <span className="text-sm text-white font-medium">{action.label}</span>
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
