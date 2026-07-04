import { createClient } from '@/lib/supabase/server'
import type { Metadata } from 'next'
import { BarChart3, TrendingUp, Users, MessageSquare, Megaphone, Wrench, FileText } from 'lucide-react'

export const metadata: Metadata = { title: 'Relatórios' }

export default async function RelatoriosPage() {
  const supabase = await createClient()

  const [
    { count: totalCustomers },
    { count: marketingCustomers },
    { count: totalMessages },
    { count: readMessages },
    { count: totalCampaigns },
    { count: completedCampaigns },
    { count: totalOrders },
    { count: deliveredOrders },
    { count: totalQuotes },
    { count: approvedQuotes },
    { data: approvedQuotesData },
  ] = await Promise.all([
    supabase.from('customers').select('*', { count: 'exact', head: true }),
    supabase.from('customers').select('*', { count: 'exact', head: true }).eq('accepted_marketing', true),
    supabase.from('whatsapp_messages').select('*', { count: 'exact', head: true }).eq('direction', 'outbound'),
    supabase.from('whatsapp_messages').select('*', { count: 'exact', head: true }).eq('status', 'read'),
    supabase.from('campaigns').select('*', { count: 'exact', head: true }),
    supabase.from('campaigns').select('*', { count: 'exact', head: true }).eq('status', 'completed'),
    supabase.from('service_orders').select('*', { count: 'exact', head: true }),
    supabase.from('service_orders').select('*', { count: 'exact', head: true }).eq('status', 'entregue'),
    supabase.from('quotes').select('*', { count: 'exact', head: true }),
    supabase.from('quotes').select('*', { count: 'exact', head: true }).eq('status', 'aprovado'),
    supabase.from('quotes').select('total').eq('status', 'aprovado'),
  ])

  const totalRevenue = approvedQuotesData?.reduce((sum, q: any) => sum + (q.total || 0), 0) || 0
  const readRate = totalMessages ? Math.round((readMessages || 0) / totalMessages * 100) : 0

  const sections = [
    {
      title: 'Clientes',
      icon: Users,
      color: '#3b82f6',
      metrics: [
        { label: 'Total de clientes', value: totalCustomers || 0, format: 'number' },
        { label: 'Com autorização de marketing', value: marketingCustomers || 0, format: 'number' },
        { label: 'Taxa de consentimento', value: totalCustomers ? Math.round((marketingCustomers || 0) / totalCustomers * 100) : 0, format: 'percent' },
      ]
    },
    {
      title: 'WhatsApp',
      icon: MessageSquare,
      color: '#22c55e',
      metrics: [
        { label: 'Mensagens enviadas', value: totalMessages || 0, format: 'number' },
        { label: 'Mensagens lidas', value: readMessages || 0, format: 'number' },
        { label: 'Taxa de leitura', value: readRate, format: 'percent' },
      ]
    },
    {
      title: 'Campanhas',
      icon: Megaphone,
      color: '#f59e0b',
      metrics: [
        { label: 'Total de campanhas', value: totalCampaigns || 0, format: 'number' },
        { label: 'Campanhas concluídas', value: completedCampaigns || 0, format: 'number' },
        { label: 'Taxa de conclusão', value: totalCampaigns ? Math.round((completedCampaigns || 0) / totalCampaigns * 100) : 0, format: 'percent' },
      ]
    },
    {
      title: 'Ordens de Serviço',
      icon: Wrench,
      color: '#06b6d4',
      metrics: [
        { label: 'Total de OS', value: totalOrders || 0, format: 'number' },
        { label: 'OS entregues', value: deliveredOrders || 0, format: 'number' },
        { label: 'Taxa de entrega', value: totalOrders ? Math.round((deliveredOrders || 0) / totalOrders * 100) : 0, format: 'percent' },
      ]
    },
    {
      title: 'Orçamentos',
      icon: FileText,
      color: '#a855f7',
      metrics: [
        { label: 'Total de orçamentos', value: totalQuotes || 0, format: 'number' },
        { label: 'Orçamentos aprovados', value: approvedQuotes || 0, format: 'number' },
        { label: 'Receita aprovada', value: totalRevenue, format: 'currency' },
      ]
    },
  ]

  function formatValue(value: number, format: string): string {
    if (format === 'percent') return `${value}%`
    if (format === 'currency') return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
    return value.toLocaleString('pt-BR')
  }

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Relatórios</h1>
          <p className="page-subtitle">Visão consolidada de todas as métricas</p>
        </div>
      </div>

      <div className="page-content">
        {/* Revenue highlight */}
        <div className="rounded-2xl p-6 mb-6 flex items-center gap-6"
          style={{ background: 'linear-gradient(135deg, rgba(220,38,38,0.15), rgba(220,38,38,0.05))', border: '1px solid rgba(220,38,38,0.2)' }}>
          <div className="w-14 h-14 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(220,38,38,0.2)' }}>
            <TrendingUp size={28} style={{ color: 'var(--brand-red)' }} />
          </div>
          <div>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Receita Total Aprovada</p>
            <p className="text-4xl font-bold text-white mt-1">
              R$ {totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              {approvedQuotes} orçamentos aprovados
            </p>
          </div>
        </div>

        {/* Sections */}
        <div className="flex flex-col gap-6">
          {sections.map(section => (
            <div key={section.title} className="card p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center"
                  style={{ background: `${section.color}15` }}>
                  <section.icon size={18} style={{ color: section.color }} />
                </div>
                <h3 className="font-semibold text-white">{section.title}</h3>
              </div>

              <div className="grid grid-cols-3 gap-4">
                {section.metrics.map(metric => (
                  <div key={metric.label} className="p-4 rounded-lg"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)' }}>
                    <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>{metric.label}</p>
                    <p className="text-2xl font-bold text-white">{formatValue(metric.value, metric.format)}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
