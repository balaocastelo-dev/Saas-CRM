'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Loader2, Save } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type TemplateRecord = {
  id: string
  name: string
  category: 'marketing' | 'utility' | 'authentication'
  language: string
  body_text: string
  variables: string[] | null
  header_text: string | null
  footer_text: string | null
  status: 'draft' | 'pending' | 'approved' | 'rejected'
  meta_template_id: string | null
  rejection_reason: string | null
  created_at?: string
  updated_at?: string
}

type TemplateFormProps = {
  template?: TemplateRecord
}

const categoryLabels = {
  marketing: 'Marketing',
  utility: 'Utilidade',
  authentication: 'Autenticação',
}

const statusLabels = {
  draft: 'Rascunho',
  pending: 'Aguardando aprovação',
  approved: 'Aprovado',
  rejected: 'Rejeitado',
}

function serializeVariables(input: string) {
  return input
    .split('\n')
    .map((value) => value.trim())
    .filter(Boolean)
}

export default function TemplateForm({ template }: TemplateFormProps) {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    name: template?.name ?? '',
    category: template?.category ?? 'marketing',
    language: template?.language ?? 'pt_BR',
    body_text: template?.body_text ?? '',
    variables: (template?.variables ?? []).join('\n'),
    header_text: template?.header_text ?? '',
    footer_text: template?.footer_text ?? '',
    status: template?.status ?? 'draft',
    meta_template_id: template?.meta_template_id ?? '',
    rejection_reason: template?.rejection_reason ?? '',
  })

  const parsedVariables = useMemo(() => serializeVariables(form.variables), [form.variables])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError('')

    const payload = {
      name: form.name.trim(),
      category: form.category,
      language: form.language.trim() || 'pt_BR',
      body_text: form.body_text.trim(),
      variables: parsedVariables,
      header_text: form.header_text.trim() || null,
      footer_text: form.footer_text.trim() || null,
      status: form.status,
      meta_template_id: form.meta_template_id.trim() || null,
      rejection_reason:
        form.status === 'rejected' ? form.rejection_reason.trim() || null : null,
    }

    const query = template
      ? supabase.from('templates').update(payload).eq('id', template.id)
      : supabase.from('templates').insert(payload)

    const { data, error: saveError } = await query.select('id').single()

    if (saveError) {
      setError(saveError.message)
      setLoading(false)
      return
    }

    router.push(`/templates/${data.id}`)
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div>
        {error && (
          <div
            className="mb-4 rounded-lg border p-3 text-sm"
            style={{
              background: 'rgba(239,68,68,0.1)',
              borderColor: 'rgba(239,68,68,0.2)',
              color: '#f87171',
            }}
          >
            {error}
          </div>
        )}

        <div className="card mb-4 p-6">
          <h3 className="mb-4 font-semibold text-white">Configurações do template</h3>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="form-group sm:col-span-2">
              <label className="label">Nome interno *</label>
              <input
                type="text"
                className="input"
                required
                placeholder="ex: recuperacao_orcamento"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="label">Categoria *</label>
              <select
                className="select"
                value={form.category}
                onChange={(event) => setForm({ ...form, category: event.target.value as TemplateRecord['category'] })}
              >
                {Object.entries(categoryLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="label">Idioma *</label>
              <input
                type="text"
                className="input"
                required
                placeholder="pt_BR"
                value={form.language}
                onChange={(event) => setForm({ ...form, language: event.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="label">Status</label>
              <select
                className="select"
                value={form.status}
                onChange={(event) => setForm({ ...form, status: event.target.value as TemplateRecord['status'] })}
              >
                {Object.entries(statusLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="label">ID Meta</label>
              <input
                type="text"
                className="input"
                placeholder="Opcional, após aprovação"
                value={form.meta_template_id}
                onChange={(event) => setForm({ ...form, meta_template_id: event.target.value })}
              />
            </div>
          </div>
        </div>

        <div className="card mb-4 p-6">
          <h3 className="mb-4 font-semibold text-white">Conteúdo</h3>

          <div className="grid gap-4">
            <div className="form-group">
              <label className="label">Header</label>
              <input
                type="text"
                className="input"
                placeholder="Opcional"
                value={form.header_text}
                onChange={(event) => setForm({ ...form, header_text: event.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="label">Corpo da mensagem *</label>
              <textarea
                className="input"
                required
                rows={8}
                style={{ resize: 'vertical' }}
                placeholder="Use {{1}}, {{2}}..."
                value={form.body_text}
                onChange={(event) => setForm({ ...form, body_text: event.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="label">Footer</label>
              <input
                type="text"
                className="input"
                placeholder="Opcional"
                value={form.footer_text}
                onChange={(event) => setForm({ ...form, footer_text: event.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="label">Variáveis</label>
              <textarea
                className="input"
                rows={5}
                style={{ resize: 'vertical' }}
                placeholder={'nome_cliente\ndescricao_oferta'}
                value={form.variables}
                onChange={(event) => setForm({ ...form, variables: event.target.value })}
              />
              <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                Informe uma variável por linha. A ordem deve corresponder aos placeholders do corpo.
              </p>
            </div>

            {form.status === 'rejected' && (
              <div className="form-group">
                <label className="label">Motivo da rejeição</label>
                <textarea
                  className="input"
                  rows={3}
                  style={{ resize: 'vertical' }}
                  value={form.rejection_reason}
                  onChange={(event) => setForm({ ...form, rejection_reason: event.target.value })}
                />
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-3">
          <Link href="/templates" className="btn-secondary">
            Cancelar
          </Link>
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {template ? 'Salvar alterações' : 'Criar template'}
          </button>
        </div>
      </div>

      <aside className="space-y-4">
        <div className="card p-6">
          <h3 className="mb-3 font-semibold text-white">Preview rápido</h3>

          <div className="space-y-3 rounded-xl border p-4" style={{ borderColor: 'var(--border-color)' }}>
            {form.header_text && (
              <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                {form.header_text}
              </p>
            )}

            <p className="whitespace-pre-wrap text-sm leading-relaxed text-white">
              {form.body_text || 'O corpo do template aparecerá aqui.'}
            </p>

            {form.footer_text && (
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {form.footer_text}
              </p>
            )}
          </div>
        </div>

        <div className="card p-6">
          <h3 className="mb-3 font-semibold text-white">Mapeamento</h3>
          <div className="flex flex-wrap gap-2">
            {parsedVariables.length > 0 ? (
              parsedVariables.map((variable, index) => (
                <span key={`${variable}-${index}`} className="badge badge-gray text-xs">
                  {`{{${index + 1}}}`} = {variable}
                </span>
              ))
            ) : (
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                Nenhuma variável configurada.
              </p>
            )}
          </div>
        </div>
      </aside>
    </form>
  )
}
