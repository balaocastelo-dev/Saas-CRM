'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Save, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { normalizePhone } from '@/lib/utils'

const TAGS_DEFAULT = [
  'Gamer', 'Notebook', 'Assistência', 'Empresa', 'Orçamento pendente',
  'Comprou recentemente', 'Cliente antigo', 'Peças', 'Impressoras', 'Apple', 'Promoção'
]

export default function NovoClientePage() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    name: '', phone: '', email: '', cpf_cnpj: '',
    city: '', neighborhood: '', contact_origin: '',
    main_interest: '', notes: '', accepted_marketing: false, status: 'ativo',
  })
  const [selectedTags, setSelectedTags] = useState<string[]>([])

  function toggleTag(tag: string) {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const phone_normalized = normalizePhone(form.phone)

    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .insert({
        ...form,
        phone: form.phone.replace(/\D/g, ''),
        phone_normalized,
      })
      .select('id')
      .single()

    if (customerError) {
      setError(customerError.message)
      setLoading(false)
      return
    }

    // Add tags
    if (selectedTags.length > 0 && customer) {
      const { data: tags } = await supabase
        .from('tags')
        .select('id, name')
        .in('name', selectedTags)

      if (tags && tags.length > 0) {
        await supabase.from('customer_tags').insert(
          tags.map(tag => ({ customer_id: customer.id, tag_id: tag.id }))
        )
      }
    }

    router.push('/clientes')
  }

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div className="flex items-center gap-3">
          <Link href="/clientes" className="btn-ghost btn-sm p-2">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="page-title">Novo Cliente</h1>
            <p className="page-subtitle">Preencha os dados do cliente</p>
          </div>
        </div>
      </div>

      <div className="page-content">
        <form onSubmit={handleSubmit} className="max-w-2xl">
          {error && (
            <div className="mb-4 p-3 rounded-lg text-sm border"
              style={{ background: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.2)', color: '#f87171' }}>
              {error}
            </div>
          )}

          <div className="card p-6 mb-4">
            <h3 className="font-semibold text-white mb-4">Dados Pessoais</h3>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="form-group sm:col-span-2">
                <label className="label">Nome completo *</label>
                <input type="text" className="input" required
                  value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="label">Telefone / WhatsApp *</label>
                <input type="tel" className="input" required placeholder="(19) 99999-0000"
                  value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="label">E-mail</label>
                <input type="email" className="input"
                  value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="label">CPF / CNPJ</label>
                <input type="text" className="input" placeholder="Opcional"
                  value={form.cpf_cnpj} onChange={e => setForm({ ...form, cpf_cnpj: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="label">Cidade</label>
                <input type="text" className="input"
                  value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="label">Bairro</label>
                <input type="text" className="input"
                  value={form.neighborhood} onChange={e => setForm({ ...form, neighborhood: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="label">Origem do contato</label>
                <select className="select"
                  value={form.contact_origin} onChange={e => setForm({ ...form, contact_origin: e.target.value })}>
                  <option value="">Selecione...</option>
                  <option value="WhatsApp">WhatsApp</option>
                  <option value="Loja física">Loja física</option>
                  <option value="Indicação">Indicação</option>
                  <option value="Site">Site</option>
                  <option value="Instagram">Instagram</option>
                  <option value="Facebook">Facebook</option>
                  <option value="Google">Google</option>
                  <option value="Outro">Outro</option>
                </select>
              </div>
              <div className="form-group">
                <label className="label">Interesse principal</label>
                <select className="select"
                  value={form.main_interest} onChange={e => setForm({ ...form, main_interest: e.target.value })}>
                  <option value="">Selecione...</option>
                  <option value="Notebook">Notebook</option>
                  <option value="PC Gamer">PC Gamer</option>
                  <option value="Assistência técnica">Assistência técnica</option>
                  <option value="Impressora">Impressora</option>
                  <option value="Periféricos">Periféricos</option>
                  <option value="Placa de vídeo">Placa de vídeo</option>
                  <option value="Outro">Outro</option>
                </select>
              </div>
            </div>
          </div>

          <div className="card p-6 mb-4">
            <h3 className="font-semibold text-white mb-4">Tags</h3>
            <div className="flex flex-wrap gap-2">
              {TAGS_DEFAULT.map(tag => (
                <button key={tag} type="button"
                  onClick={() => toggleTag(tag)}
                  className={`badge cursor-pointer transition-all ${
                    selectedTags.includes(tag)
                      ? 'badge-red'
                      : 'badge-gray hover:badge-red'
                  }`}>
                  {tag}
                </button>
              ))}
            </div>
          </div>

          <div className="card p-6 mb-4">
            <h3 className="font-semibold text-white mb-4">Configurações</h3>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="form-group">
                <label className="label">Status</label>
                <select className="select"
                  value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                  <option value="ativo">Ativo</option>
                  <option value="inativo">Inativo</option>
                  <option value="bloqueado">Bloqueado</option>
                </select>
              </div>
              <div className="form-group">
                <label className="label">Consentimento de marketing</label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <div className="relative">
                    <input type="checkbox" className="sr-only peer"
                      checked={form.accepted_marketing}
                      onChange={e => setForm({ ...form, accepted_marketing: e.target.checked })} />
                    <div className="w-10 h-6 rounded-full transition-colors peer-checked:bg-red-600"
                      style={{ background: form.accepted_marketing ? 'var(--brand-red)' : 'rgba(255,255,255,0.1)' }}>
                      <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                        form.accepted_marketing ? 'translate-x-4' : ''
                      }`} />
                    </div>
                  </div>
                  <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    {form.accepted_marketing ? 'Aceita receber mensagens de marketing' : 'Não aceita marketing'}
                  </span>
                </label>
              </div>
            </div>
            <div className="form-group mt-4">
              <label className="label">Observações</label>
              <textarea className="input" rows={3} style={{ resize: 'vertical' }}
                value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>

          <div className="flex gap-3">
            <Link href="/clientes" className="btn-secondary">Cancelar</Link>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              Salvar cliente
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
