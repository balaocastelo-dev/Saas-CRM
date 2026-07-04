import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft, MessageSquarePlus } from 'lucide-react'
import TemplateForm from '../TemplateForm'

export const metadata: Metadata = { title: 'Novo Template' }

export default function NovoTemplatePage() {
  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div className="flex items-center gap-3">
          <Link href="/templates" className="btn-ghost btn-sm p-2">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="page-title">Novo Template</h1>
            <p className="page-subtitle">Cadastre um template alinhado ao schema atual do WhatsApp</p>
          </div>
        </div>
      </div>

      <div className="page-content">
        <div className="mb-5 rounded-xl border p-4" style={{ borderColor: 'rgba(34,197,94,0.2)', background: 'rgba(34,197,94,0.07)' }}>
          <div className="flex items-start gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-lg"
              style={{ background: 'rgba(34,197,94,0.12)' }}
            >
              <MessageSquarePlus size={18} style={{ color: '#22c55e' }} />
            </div>
            <div>
              <p className="text-sm font-medium text-white">Fluxo sugerido</p>
              <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
                Salve primeiro como rascunho, valide placeholders e depois atualize o status conforme a aprovação na Meta.
              </p>
            </div>
          </div>
        </div>

        <TemplateForm />
      </div>
    </div>
  )
}
