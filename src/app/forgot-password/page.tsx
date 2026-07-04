'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, CheckCircle2, KeyRound, Loader2, Mail, ShieldCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type RecoveryMode = 'request' | 'reset'

function getRedirectTo() {
  if (typeof window === 'undefined') return undefined
  return `${window.location.origin}/forgot-password`
}

export default function ForgotPasswordPage() {
  const supabase = useMemo(() => createClient(), [])
  const [mode, setMode] = useState<RecoveryMode>('request')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [initializing, setInitializing] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    let active = true

    async function initializeRecovery() {
      try {
        const searchParams = new URLSearchParams(window.location.search)
        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))

        if (searchParams.get('code')) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(
            searchParams.get('code') || ''
          )

          if (!active) return

          if (exchangeError) {
            setError('O link de recuperacao expirou ou eh invalido.')
          } else {
            setMode('reset')
            window.history.replaceState({}, '', '/forgot-password')
          }

          return
        }

        if (hashParams.get('type') === 'recovery') {
          const access_token = hashParams.get('access_token')
          const refresh_token = hashParams.get('refresh_token')

          if (access_token && refresh_token) {
            const { error: sessionError } = await supabase.auth.setSession({
              access_token,
              refresh_token,
            })

            if (!active) return

            if (sessionError) {
              setError('Nao foi possivel validar o link de recuperacao.')
            } else {
              setMode('reset')
              window.history.replaceState({}, '', '/forgot-password')
            }
          }
        }
      } finally {
        if (active) setInitializing(false)
      }
    }

    void initializeRecovery()

    return () => {
      active = false
    }
  }, [supabase])

  async function handleRequestReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')

    const { error: requestError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: getRedirectTo(),
    })

    if (requestError) {
      setError(requestError.message)
      setLoading(false)
      return
    }

    setSuccess('Enviamos um link de recuperacao para o seu e-mail.')
    setLoading(false)
  }

  async function handleUpdatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')

    if (password.length < 6) {
      setError('A nova senha precisa ter pelo menos 6 caracteres.')
      setLoading(false)
      return
    }

    if (password !== confirmPassword) {
      setError('A confirmacao da senha nao confere.')
      setLoading(false)
      return
    }

    const { error: updateError } = await supabase.auth.updateUser({ password })

    if (updateError) {
      setError(updateError.message)
      setLoading(false)
      return
    }

    setSuccess('Senha atualizada com sucesso. Voce ja pode entrar novamente.')
    setLoading(false)
    setPassword('')
    setConfirmPassword('')
    setTimeout(() => {
      window.location.href = '/login'
    }, 1200)
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-8" style={{ background: 'var(--bg-primary)' }}>
      <div className="w-full max-w-sm">
        <Link href="/login" className="btn-ghost btn-sm mb-4">
          <ArrowLeft size={16} />
          Voltar para login
        </Link>

        <div className="card p-6">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
            style={{ background: 'rgba(220,38,38,0.12)' }}>
            {mode === 'reset' ? (
              <ShieldCheck size={22} style={{ color: 'var(--brand-red)' }} />
            ) : (
              <KeyRound size={22} style={{ color: 'var(--brand-red)' }} />
            )}
          </div>

          <h1 className="text-2xl font-bold text-white mb-1">
            {mode === 'reset' ? 'Definir nova senha' : 'Recuperar senha'}
          </h1>
          <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
            {mode === 'reset'
              ? 'Crie uma nova senha para concluir o acesso.'
              : 'Informe seu e-mail para receber o link de recuperacao.'}
          </p>

          {initializing ? (
            <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
              <Loader2 size={16} className="animate-spin" />
              Validando o link de recuperacao...
            </div>
          ) : (
            <>
              {error && (
                <div className="mb-4 p-3 rounded-lg text-sm border"
                  style={{
                    background: 'rgba(239,68,68,0.1)',
                    borderColor: 'rgba(239,68,68,0.2)',
                    color: '#f87171',
                  }}>
                  {error}
                </div>
              )}

              {success && (
                <div className="mb-4 p-3 rounded-lg text-sm border flex items-center gap-2"
                  style={{
                    background: 'rgba(34,197,94,0.12)',
                    borderColor: 'rgba(34,197,94,0.25)',
                    color: '#86efac',
                  }}>
                  <CheckCircle2 size={16} />
                  {success}
                </div>
              )}

              {mode === 'request' ? (
                <form onSubmit={handleRequestReset} className="flex flex-col gap-4">
                  <div className="form-group">
                    <label htmlFor="email" className="label">E-mail</label>
                    <div className="relative">
                      <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2"
                        style={{ color: 'var(--text-muted)' }} />
                      <input
                        id="email"
                        type="email"
                        className="input pl-9"
                        placeholder="seu@email.com"
                        value={email}
                        onChange={event => setEmail(event.target.value)}
                        autoComplete="email"
                        required
                      />
                    </div>
                  </div>

                  <button type="submit" className="btn-primary w-full" disabled={loading}>
                    {loading ? <Loader2 size={18} className="animate-spin" /> : 'Enviar link'}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleUpdatePassword} className="flex flex-col gap-4">
                  <div className="form-group">
                    <label htmlFor="password" className="label">Nova senha</label>
                    <input
                      id="password"
                      type="password"
                      className="input"
                      placeholder="Minimo de 6 caracteres"
                      value={password}
                      onChange={event => setPassword(event.target.value)}
                      autoComplete="new-password"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="confirm-password" className="label">Confirmar nova senha</label>
                    <input
                      id="confirm-password"
                      type="password"
                      className="input"
                      placeholder="Repita a nova senha"
                      value={confirmPassword}
                      onChange={event => setConfirmPassword(event.target.value)}
                      autoComplete="new-password"
                      required
                    />
                  </div>

                  <button type="submit" className="btn-primary w-full" disabled={loading}>
                    {loading ? <Loader2 size={18} className="animate-spin" /> : 'Salvar nova senha'}
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
