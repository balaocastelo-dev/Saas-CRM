import { createClient } from '@/lib/supabase/server'
import CampaignProcessControls from './CampaignProcessControls'
import { Plus, Megaphone, Play, Pause, Clock, CheckCircle, XCircle } from 'lucide-react'
import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Campanhas' }

const statusConfig: Record<string, { label: string; badge: string; icon: any }> = {
  draft: { label: 'Rascunho', badge: 'badge-gray', icon: Clock },
  scheduled: { label: 'Agendada', badge: 'badge-blue', icon: Clock },
  running: { label: 'Em andamento', badge: 'badge-yellow', icon: Play },
  paused: { label: 'Pausada', badge: 'badge-gray', icon: Pause },
  completed: { label: 'Concluída', badge: 'badge-green', icon: CheckCircle },
  cancelled: { label: 'Cancelada', badge: 'badge-red', icon: XCircle },
}

export default async function CampanhasPage() {
  const supabase = await createClient()
  
  const { data: campaigns } = await supabase
    .from('campaigns')
    .select(`*, template:templates(name)`)
    .order('created_at', { ascending: false })

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Campanhas WhatsApp</h1>
          <p className="page-subtitle">Envie mensagens em massa para seus clientes via API oficial</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <CampaignProcessControls />
          <Link href="/campanhas/nova" className="btn-primary">
            <Plus size={15} /> Nova Campanha
          </Link>
        </div>
      </div>

      <div className="page-content">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Total', value: campaigns?.length || 0, color: '#3b82f6' },
            { label: 'Ativas', value: campaigns?.filter(c => c.status === 'running').length || 0, color: '#f59e0b' },
            { label: 'Concluídas', value: campaigns?.filter(c => c.status === 'completed').length || 0, color: '#22c55e' },
            { label: 'Agendadas', value: campaigns?.filter(c => c.status === 'scheduled').length || 0, color: '#a855f7' },
          ].map(stat => (
            <div key={stat.label} className="metric-card">
              <p className="metric-value" style={{ color: stat.color }}>{stat.value}</p>
              <p className="metric-label">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Table */}
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Campanha</th>
                <th>Template</th>
                <th>Status</th>
                <th>Destinatários</th>
                <th>Enviadas</th>
                <th>Lidas</th>
                <th>Taxa</th>
                <th>Data</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {campaigns && campaigns.length > 0 ? campaigns.map((campaign: any) => {
                const sc = statusConfig[campaign.status] || statusConfig.draft
                const rate = campaign.sent_count > 0
                  ? Math.round(campaign.read_count / campaign.sent_count * 100) : 0
                return (
                  <tr key={campaign.id}>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                          style={{ background: 'rgba(245,158,11,0.12)' }}>
                          <Megaphone size={15} style={{ color: '#f59e0b' }} />
                        </div>
                        <span className="font-medium text-white">{campaign.name}</span>
                      </div>
                    </td>
                    <td>
                      <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                        {campaign.template?.name || '—'}
                      </span>
                    </td>
                    <td><span className={`badge ${sc.badge}`}>{sc.label}</span></td>
                    <td><span className="text-sm">{campaign.total_recipients}</span></td>
                    <td><span className="text-sm text-green-400">{campaign.sent_count}</span></td>
                    <td><span className="text-sm text-purple-400">{campaign.read_count}</span></td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.1)', minWidth: '40px' }}>
                          <div className="h-full rounded-full" style={{ width: `${rate}%`, background: '#a855f7' }} />
                        </div>
                        <span className="text-xs text-white">{rate}%</span>
                      </div>
                    </td>
                    <td>
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {new Date(campaign.created_at).toLocaleDateString('pt-BR')}
                      </span>
                    </td>
                    <td>
                      <Link href={`/campanhas/${campaign.id}`} className="btn-ghost btn-sm">Ver</Link>
                    </td>
                  </tr>
                )
              }) : (
                <tr>
                  <td colSpan={9}>
                    <div className="text-center py-12">
                      <Megaphone size={32} className="mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
                      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Nenhuma campanha criada</p>
                      <Link href="/campanhas/nova" className="btn-primary mt-3 inline-flex">
                        <Plus size={15} /> Criar campanha
                      </Link>
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
