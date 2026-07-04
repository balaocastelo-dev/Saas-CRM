import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft, Megaphone } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import CampaignForm from '../CampaignForm'

export const metadata: Metadata = { title: 'Nova Campanha' }

export default async function NovaCampanhaPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()

  const [{ data: templates, error: templatesError }, { data: tags, error: tagsError }] = await Promise.all([
    supabase
      .from('templates')
      .select('id, name, status, category, variables')
      .order('name', { ascending: true }),
    supabase.from('tags').select('id, name, color').order('name', { ascending: true }),
  ])

  if (templatesError) throw new Error(templatesError.message)
  if (tagsError) throw new Error(tagsError.message)

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div className="flex items-center gap-3">
          <Link href="/campanhas" className="btn-ghost btn-sm p-2">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="page-title">Nova Campanha</h1>
            <p className="page-subtitle">Crie uma campanha conectada ao template e público do CRM</p>
          </div>
        </div>
      </div>

      <div className="page-content">
        <div
          className="mb-5 rounded-xl border p-4"
          style={{ borderColor: 'rgba(245,158,11,0.2)', background: 'rgba(245,158,11,0.07)' }}
        >
          <div className="flex items-start gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-lg"
              style={{ background: 'rgba(245,158,11,0.12)' }}
            >
              <Megaphone size={18} style={{ color: '#f59e0b' }} />
            </div>
            <div>
              <p className="text-sm font-medium text-white">Sincronização automática</p>
              <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
                Ao salvar, a campanha atualiza `target_filters`, recalcula `total_recipients` e recria os registros em `campaign_recipients`.
              </p>
            </div>
          </div>
        </div>

        <CampaignForm templates={templates ?? []} tags={tags ?? []} initialTemplateId={params.template} />
      </div>
    </div>
  )
}
