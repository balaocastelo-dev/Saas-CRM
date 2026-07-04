'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Eye, EyeOff, Loader2, Zap } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default function RegisterPage() {
  const router = useRouter()
  const supabase = createClient()
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        data: { full_name: form.name }
      }
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      setSuccess(true)
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8" style={{ background: 'var(--bg-primary)' }}>
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
            style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)' }}>
            <span className="text-3xl">✅</span>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Conta criada!</h2>
          <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
            Verifique seu e-mail <strong style={{ color: 'white' }}>{form.email}</strong> para confirmar sua conta.
          </p>
          <Link href="/login" className="btn-primary">Ir para o login</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-8" style={{ background: 'var(--bg-primary)' }}>
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'var(--brand-red)' }}>
            <Zap size={20} color="white" />
          </div>
          <p className="font-bold text-white text-lg">Balão CRM</p>
        </div>

        <h2 className="text-2xl font-bold text-white mb-1">Criar conta</h2>
        <p className="text-sm mb-8" style={{ color: 'var(--text-secondary)' }}>
          Preencha os dados para criar sua conta
        </p>

        {error && (
          <div className="mb-4 p-3 rounded-lg text-sm border"
            style={{ background: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.2)', color: '#f87171' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleRegister} className="flex flex-col gap-4">
          <div className="form-group">
            <label className="label">Nome completo</label>
            <input type="text" className="input" placeholder="Seu nome"
              value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div className="form-group">
            <label className="label">E-mail</label>
            <input type="email" className="input" placeholder="seu@email.com"
              value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required />
          </div>
          <div className="form-group">
            <label className="label">Senha</label>
            <div className="relative">
              <input type={showPassword ? 'text' : 'password'} className="input pr-10"
                placeholder="Mínimo 8 caracteres" minLength={8}
                value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required />
              <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2"
                onClick={() => setShowPassword(!showPassword)}
                style={{ color: 'var(--text-muted)' }}>
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button type="submit" className="btn-primary w-full mt-2"
            style={{ height: '44px' }} disabled={loading}>
            {loading ? <Loader2 size={18} className="animate-spin" /> : 'Criar conta'}
          </button>
        </form>

        <p className="text-sm text-center mt-6" style={{ color: 'var(--text-secondary)' }}>
          Já tem uma conta?{' '}
          <Link href="/login" style={{ color: 'var(--brand-red)' }} className="hover:underline">
            Entrar
          </Link>
        </p>
      </div>
    </div>
  )
}
