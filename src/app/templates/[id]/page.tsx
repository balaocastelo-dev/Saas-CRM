import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Clock3, Megaphone, MessageSquare } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { formatDateTime } from '@/lib/utils'
import TemplateForm from '../TemplateForm'

export const metadata: Metadata = { title: 'Editar Template' }

const statusLabels: Record<string, string> = {
  draft: 'Rascunho',
  pending: 'Aguardando aprovação',
  approved: 'Aprovado',
  rejected: 'Rejeitado',
}

export default async function TemplateDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: template, error }, { data: recentCampaigns }, { count: campaignCount }] = await Promise.all([
    supabase.from('templates').select('*').eq('id', id).maybeSingle(),
    supabase
      .from('campaigns')
      .select('id, name, status, total_recipients, created_at')
      .eq('template_id', id)
      .order('created_at', { ascending: false })
      .limit(5),
    supabase.from('campaigns').select('id', { count: 'exact', head: true }).eq('template_id', id),
  ])

  if (error) throw new Error(error.message)
  if (!template) notFound()

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div className="flex items-center gap-3">
          <Link href="/templates" className="btn-ghost btn-sm p-2">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="page-title">{template.name}</h1>
            <p className="page-subtitle">Edite conteúdo, status e metadados do template</p>
          </div>
        </div>

        <Link href={`/campanhas/nova?template=${template.id}`} className="btn-primary">
          <Megaphone size={15} /> Criar campanha
        </Link>
      </div>

      <div className="page-content">
        <div className="mb-5 grid gap-4 md:grid-cols-3">
          <div className="metric-card">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-lg"
              style={{ background: 'rgba(34,197,94,0.12)' }}
            >
              <MessageSquare size={18} style={{ color: '#22c55e' }} />
            </div>
            <div>
              <p className="metric-value text-white">{statusLabels[template.status] || template.status}</p>
              <p className="metric-label">Status atual</p>
            </div>
          </div>

          <div className="metric-card">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-lg"
              style={{ background: 'rgba(59,130,246,0.12)' }}
            >
              <Megaphone size={18} style={{ color: '#3b82f6' }} />
            </div>
            <div>
              <p className="metric-value text-white">{campaignCount || 0}</p>
              <p className="metric-label">Campanhas vinculadas</p>
            </div>
          </div>

          <div className="metric-card">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-lg"
              style={{ background: 'rgba(245,158,11,0.12)' }}
            >
              <Clock3 size={18} style={{ color: '#f59e0b' }} />
            </div>
            <div>
              <p className="metric-value text-white">{formatDateTime(template.updated_at)}</p>
              <p className="metric-label">Última atualização</p>
            </div>
          </div>
        </div>

        <TemplateForm template={template} />

        <div className="card mt-6 p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-white">Uso em campanhas</h3>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Últimas campanhas que usam este template
              </p>
            </div>
          </div>

          {recentCampaigns && recentCampaigns.length > 0 ? (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Campanha</th>
                    <th>Status</th>
                    <th>Destinatários</th>
                    <th>Criação</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {recentCampaigns.map((campaign: any) => (
                    <tr key={campaign.id}>
                      <td>
                        <span className="font-medium text-white">{campaign.name}</span>
                      </td>
                      <td>
                        <span className="badge badge-gray">{campaign.status}</span>
                      </td>
                      <td>
                        <span className="text-sm">{campaign.total_recipients}</span>
                      </td>
                      <td>
                        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          {formatDateTime(campaign.created_at)}
                        </span>
                      </td>
                      <td>
                        <Link href={`/campanhas/${campaign.id}`} className="btn-ghost btn-sm">
                          Ver campanha
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Este template ainda não foi usado em campanhas.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
