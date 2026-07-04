import { createClient } from '@/lib/supabase/server'
import { Plus, MessageSquare, CheckCircle, Clock, XCircle, AlertTriangle } from 'lucide-react'
import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Templates WhatsApp' }

const statusConfig: Record<string, { label: string; badge: string }> = {
  draft: { label: 'Rascunho', badge: 'badge-gray' },
  pending: { label: 'Aguardando aprovação', badge: 'badge-yellow' },
  approved: { label: 'Aprovado', badge: 'badge-green' },
  rejected: { label: 'Rejeitado', badge: 'badge-red' },
}

const categoryLabels: Record<string, string> = {
  marketing: 'Marketing',
  utility: 'Utilidade',
  authentication: 'Autenticação',
}

export default async function TemplatesPage() {
  const supabase = await createClient()
  const { data: templates } = await supabase
    .from('templates')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Templates WhatsApp</h1>
          <p className="page-subtitle">Gerencie seus templates aprovados pela Meta</p>
        </div>
        <Link href="/templates/novo" className="btn-primary">
          <Plus size={15} /> Novo Template
        </Link>
      </div>

      <div className="page-content">
        {/* Info banner */}
        <div className="rounded-xl p-4 mb-5 flex items-start gap-3"
          style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)' }}>
          <AlertTriangle size={18} style={{ color: '#3b82f6' }} className="flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium" style={{ color: '#93c5fd' }}>Como funcionam os templates</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              Templates de marketing precisam de aprovação da Meta antes de serem usados em campanhas.
              Após criar o template aqui, você deve cadastrá-lo no WhatsApp Business Manager e aguardar aprovação.
            </p>
          </div>
        </div>

        {/* Grid */}
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {templates && templates.map((template: any) => {
            const sc = statusConfig[template.status] || statusConfig.draft
            return (
              <div key={template.id} className="card p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center"
                    style={{ background: 'rgba(34,197,94,0.12)' }}>
                    <MessageSquare size={17} style={{ color: '#22c55e' }} />
                  </div>
                  <span className={`badge ${sc.badge}`}>{sc.label}</span>
                </div>
                <h3 className="font-semibold text-white mb-1">{template.name}</h3>
                <span className="text-xs badge badge-blue mb-3">
                  {categoryLabels[template.category] || template.category}
                </span>
                <p className="text-sm leading-relaxed line-clamp-3"
                  style={{ color: 'var(--text-secondary)' }}>
                  {template.body_text}
                </p>
                {template.variables && (template.variables as string[]).length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {(template.variables as string[]).map((v, i) => (
                      <span key={i} className="badge badge-gray text-xs">
                        {`{{${i + 1}}}`} = {v}
                      </span>
                    ))}
                  </div>
                )}
                <div className="mt-4 pt-3 border-t flex justify-end gap-2"
                  style={{ borderColor: 'var(--border-color)' }}>
                  <Link href={`/templates/${template.id}`} className="btn-ghost btn-sm">Editar</Link>
                  <Link href={`/campanhas/nova?template=${template.id}`} className="btn-secondary btn-sm">
                    Usar em campanha
                  </Link>
                </div>
              </div>
            )
          })}

          {/* Empty state */}
          {(!templates || templates.length === 0) && (
            <div className="card p-10 text-center md:col-span-2 xl:col-span-3">
              <MessageSquare size={36} className="mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Nenhum template cadastrado</p>
              <Link href="/templates/novo" className="btn-primary mt-4 inline-flex">
                <Plus size={15} /> Criar template
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
