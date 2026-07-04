'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Eye, EyeOff, Loader2, Zap } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message === 'Invalid login credentials'
        ? 'E-mail ou senha incorretos.'
        : error.message)
      setLoading(false)
    } else {
      router.push('/dashboard')
      router.refresh()
    }
  }

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--bg-primary)' }}>
      {/* Left panel — branding */}
      <div className="hidden lg:flex flex-col justify-between w-[480px] flex-shrink-0 p-12 relative overflow-hidden"
        style={{ background: 'linear-gradient(145deg, #0d1424 0%, #1a0a0a 100%)' }}>
        {/* Decorative blobs */}
        <div className="absolute -top-24 -left-24 w-64 h-64 rounded-full opacity-20"
          style={{ background: 'radial-gradient(circle, #DC2626, transparent)' }} />
        <div className="absolute bottom-0 right-0 w-96 h-96 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #DC2626, transparent)' }} />

        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-12">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: 'var(--brand-red)' }}>
              <Zap size={20} color="white" />
            </div>
            <div>
              <p className="font-bold text-white text-lg leading-none">Balão CRM</p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>WhatsApp Business</p>
            </div>
          </div>

          <h1 className="text-4xl font-bold text-white leading-tight mb-4">
            Gerencie seus<br />
            <span className="gradient-text">clientes com</span><br />
            inteligência.
          </h1>

          <p className="text-base leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            CRM completo com WhatsApp oficial da Meta para a Balão da Informática Castelo.
            Campanhas, atendimento e vendas em um só lugar.
          </p>
        </div>

        <div className="relative z-10">
          <div className="flex flex-col gap-3">
            {[
              { icon: '📊', text: 'Dashboard com métricas em tempo real' },
              { icon: '💬', text: 'Campanhas via WhatsApp Cloud API' },
              { icon: '🎯', text: 'CRM com funil de vendas' },
              { icon: '🔧', text: 'Controle de ordens de serviço' },
            ].map((item) => (
              <div key={item.text} className="flex items-center gap-3">
                <span className="text-xl">{item.icon}</span>
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{item.text}</span>
              </div>
            ))}
          </div>

          <div className="mt-8 pt-6 border-t" style={{ borderColor: 'var(--border-color)' }}>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Balão da Informática Castelo
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              Av. Anchieta, 789 – Campinas/SP
            </p>
          </div>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="flex items-center gap-3 mb-8 lg:hidden">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: 'var(--brand-red)' }}>
              <Zap size={20} color="white" />
            </div>
            <p className="font-bold text-white text-lg">Balão CRM</p>
          </div>

          <h2 className="text-2xl font-bold text-white mb-1">Bem-vindo de volta</h2>
          <p className="text-sm mb-8" style={{ color: 'var(--text-secondary)' }}>
            Entre com sua conta para acessar o painel
          </p>

          {error && (
            <div className="mb-4 p-3 rounded-lg text-sm border"
              style={{
                background: 'rgba(239,68,68,0.1)',
                borderColor: 'rgba(239,68,68,0.2)',
                color: '#f87171'
              }}>
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <div className="form-group">
              <label htmlFor="email" className="label">E-mail</label>
              <input
                id="email"
                type="email"
                className="input"
                placeholder="seu@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>

            <div className="form-group">
              <label htmlFor="password" className="label">Senha</label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  className="input pr-10"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{ color: 'var(--text-muted)' }}>
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="flex justify-end">
              <Link href="/forgot-password"
                className="text-sm hover:underline"
                style={{ color: 'var(--brand-red)' }}>
                Esqueceu a senha?
              </Link>
            </div>

            <button
              type="submit"
              className="btn-primary w-full mt-2"
              style={{ height: '44px' }}
              disabled={loading}>
              {loading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : 'Entrar'}
            </button>
          </form>

          <p className="text-sm text-center mt-6" style={{ color: 'var(--text-secondary)' }}>
            Não tem uma conta?{' '}
            <Link href="/register" style={{ color: 'var(--brand-red)' }} className="hover:underline">
              Criar conta
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
