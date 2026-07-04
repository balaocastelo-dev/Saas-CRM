import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Clock3, Megaphone, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { formatDateTime, formatPhone } from '@/lib/utils'
import CampaignForm from '../CampaignForm'
import CampaignProcessControls from '../CampaignProcessControls'

export const metadata: Metadata = { title: 'Editar Campanha' }

const statusLabels: Record<string, string> = {
  draft: 'Rascunho',
  scheduled: 'Agendada',
  running: 'Em andamento',
  paused: 'Pausada',
  completed: 'Concluída',
  cancelled: 'Cancelada',
}

export default async function CampanhaDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const [
    { data: campaign, error: campaignError },
    { data: templates, error: templatesError },
    { data: tags, error: tagsError },
    { data: recipients, error: recipientsError },
  ] = await Promise.all([
    supabase.from('campaigns').select('*').eq('id', id).maybeSingle(),
    supabase
      .from('templates')
      .select('id, name, status, category, variables')
      .order('name', { ascending: true }),
    supabase.from('tags').select('id, name, color').order('name', { ascending: true }),
    supabase
      .from('campaign_recipients')
      .select(`
        id,
        status,
        sent_at,
        customer:customers(name, phone_normalized, city)
      `)
      .eq('campaign_id', id)
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  if (campaignError) throw new Error(campaignError.message)
  if (templatesError) throw new Error(templatesError.message)
  if (tagsError) throw new Error(tagsError.message)
  if (recipientsError) throw new Error(recipientsError.message)
  if (!campaign) notFound()

  const recipientStats = (recipients ?? []).reduce<Record<string, number>>((accumulator, row: any) => {
    accumulator[row.status] = (accumulator[row.status] ?? 0) + 1
    return accumulator
  }, {})

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div className="flex items-center gap-3">
          <Link href="/campanhas" className="btn-ghost btn-sm p-2">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="page-title">{campaign.name}</h1>
            <p className="page-subtitle">Acompanhe e ajuste o template, o público e o status da campanha</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <CampaignProcessControls campaignId={campaign.id} status={campaign.status} />
          {campaign.template_id && (
            <Link href={`/templates/${campaign.template_id}`} className="btn-secondary">
              <Megaphone size={15} /> Ver template
            </Link>
          )}
        </div>
      </div>

      <div className="page-content">
        <div
          className="mb-5 rounded-xl border p-4"
          style={{ borderColor: 'rgba(59,130,246,0.2)', background: 'rgba(59,130,246,0.07)' }}
        >
          <p className="text-sm font-medium" style={{ color: '#93c5fd' }}>
            Segurança da campanha
          </p>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
            O disparo usa apenas a API oficial da Meta, exige template aprovado e bloqueia destinatários sem consentimento.
          </p>
        </div>

        <div className="mb-5 grid gap-4 md:grid-cols-3">
          <div className="metric-card">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-lg"
              style={{ background: 'rgba(245,158,11,0.12)' }}
            >
              <Megaphone size={18} style={{ color: '#f59e0b' }} />
            </div>
            <div>
              <p className="metric-value text-white">{statusLabels[campaign.status] || campaign.status}</p>
              <p className="metric-label">Status atual</p>
            </div>
          </div>

          <div className="metric-card">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-lg"
              style={{ background: 'rgba(34,197,94,0.12)' }}
            >
              <Users size={18} style={{ color: '#22c55e' }} />
            </div>
            <div>
              <p className="metric-value text-white">{campaign.total_recipients}</p>
              <p className="metric-label">Destinatários salvos</p>
            </div>
          </div>

          <div className="metric-card">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-lg"
              style={{ background: 'rgba(59,130,246,0.12)' }}
            >
              <Clock3 size={18} style={{ color: '#3b82f6' }} />
            </div>
            <div>
              <p className="metric-value text-white">{formatDateTime(campaign.updated_at)}</p>
              <p className="metric-label">Última atualização</p>
            </div>
          </div>
        </div>

        <CampaignForm templates={templates ?? []} tags={tags ?? []} campaign={campaign} />

        <div className="mt-6 grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
          <div className="card p-6">
            <h3 className="mb-3 font-semibold text-white">Status dos destinatários</h3>
            <div className="space-y-2 text-sm">
              {Object.keys(recipientStats).length > 0 ? (
                Object.entries(recipientStats).map(([status, count]) => (
                  <div key={status} className="flex items-center justify-between gap-3">
                    <span style={{ color: 'var(--text-secondary)' }}>{status}</span>
                    <span className="text-white">{count}</span>
                  </div>
                ))
              ) : (
                <p style={{ color: 'var(--text-muted)' }}>Nenhum destinatário sincronizado ainda.</p>
              )}
            </div>
          </div>

          <div className="card p-6">
            <h3 className="mb-4 font-semibold text-white">Destinatários recentes</h3>

            {recipients && recipients.length > 0 ? (
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th>Cidade</th>
                      <th>Status</th>
                      <th>Envio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recipients.map((recipient: any) => (
                      <tr key={recipient.id}>
                        <td>
                          <div>
                            <p className="font-medium text-white">{recipient.customer?.name || 'Cliente removido'}</p>
                            {recipient.customer?.phone_normalized && (
                              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                {formatPhone(recipient.customer.phone_normalized)}
                              </p>
                            )}
                          </div>
                        </td>
                        <td>
                          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                            {recipient.customer?.city || '—'}
                          </span>
                        </td>
                        <td>
                          <span className="badge badge-gray">{recipient.status}</span>
                        </td>
                        <td>
                          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                            {recipient.sent_at ? formatDateTime(recipient.sent_at) : 'Pendente'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                Os destinatários aparecerão aqui após o primeiro salvamento.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
