'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Save, Loader2, Settings, MessageSquare, Building2, Shield } from 'lucide-react'

interface Setting {
  key: string
  value: unknown
  description: string
  is_secret: boolean
}

interface RuntimeWhatsappConfig {
  configured: boolean
  accessTokenConfigured: boolean
  accessTokenPreview: string
  phoneNumberId: string
  businessAccountId: string
  verifyTokenConfigured: boolean
  verifyTokenPreview: string
  appSecretConfigured: boolean
  appSecretPreview: string
  webhookUrl: string
}

const DEFAULT_SETTINGS: Record<string, string> = {
  company_name: '',
  company_website: '',
  company_address: '',
  company_phone1: '',
  company_phone2: '',
  whatsapp_access_token: '',
  whatsapp_phone_number_id: '',
  whatsapp_business_account_id: '',
  whatsapp_verify_token: '',
  whatsapp_app_secret: '',
  campaign_daily_limit: '1000',
  campaign_batch_interval: '5',
  business_hours_start: '08:00',
  business_hours_end: '18:00',
  ai_enabled: 'false',
  ai_transfer_keyword: 'atendente',
}

export default function ConfiguracoesPage() {
  const supabase = useMemo(() => createClient(), [])
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [runtimeWhatsapp, setRuntimeWhatsapp] = useState<RuntimeWhatsappConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [activeTab, setActiveTab] = useState('empresa')

  useEffect(() => {
    async function loadSettings() {
      const [{ data }, runtimeResponse] = await Promise.all([
        supabase.from('settings').select('*'),
        fetch('/api/settings/runtime').catch(() => null),
      ])

      const map: Record<string, string> = { ...DEFAULT_SETTINGS }
      if (data) {
        data.forEach((s: Setting) => {
          map[s.key] =
            typeof s.value === 'string'
              ? s.value
              : s.value === null || s.value === undefined
                ? ''
                : String(s.value)
        })
      }

      setSettings(map)

      if (runtimeResponse?.ok) {
        const runtimeData = await runtimeResponse.json()
        setRuntimeWhatsapp(runtimeData.whatsapp || null)
      }

      setLoading(false)
    }

    void loadSettings()
  }, [supabase])

  async function handleSave() {
    setSaving(true)
    const updates = Object.entries(settings).map(([key, value]) => ({
      key,
      value,
      updated_at: new Date().toISOString(),
    }))

    for (const update of updates) {
      await supabase.from('settings').upsert(update, { onConflict: 'key' })
    }

    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const tabs = [
    { id: 'empresa', label: 'Empresa', icon: Building2 },
    { id: 'whatsapp', label: 'WhatsApp API', icon: MessageSquare },
    { id: 'campanhas', label: 'Campanhas', icon: Settings },
    { id: 'seguranca', label: 'Segurança', icon: Shield },
  ]

  if (loading) {
    return (
      <div className="page-content flex items-center justify-center min-h-64">
        <Loader2 size={24} className="animate-spin" style={{ color: 'var(--brand-red)' }} />
      </div>
    )
  }

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Configurações</h1>
          <p className="page-subtitle">Gerencie as configurações da plataforma</p>
        </div>
        <button onClick={handleSave} className="btn-primary" disabled={saving}>
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          {saved ? 'Salvo!' : 'Salvar'}
        </button>
      </div>

      <div className="page-content">
        {/* Tabs */}
        <div className="flex gap-1 mb-6 p-1 rounded-xl w-fit"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-color)' }}>
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? 'text-white'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
              style={activeTab === tab.id ? { background: 'var(--brand-red)' } : {}}>
              <tab.icon size={15} />
              {tab.label}
            </button>
          ))}
        </div>

        <div className="max-w-2xl">
          {/* Empresa */}
          {activeTab === 'empresa' && (
            <div className="card p-6 flex flex-col gap-4">
              <h3 className="font-semibold text-white">Dados da Empresa</h3>
              {[
                { key: 'company_name', label: 'Nome da empresa', type: 'text' },
                { key: 'company_website', label: 'Site', type: 'url' },
                { key: 'company_address', label: 'Endereço', type: 'text' },
                { key: 'company_phone1', label: 'Telefone 1', type: 'tel' },
                { key: 'company_phone2', label: 'Telefone 2', type: 'tel' },
              ].map(field => (
                <div key={field.key} className="form-group">
                  <label className="label">{field.label}</label>
                  <input type={field.type} className="input"
                    value={settings[field.key] || ''}
                    onChange={e => setSettings({ ...settings, [field.key]: e.target.value })} />
                </div>
              ))}
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Horário de funcionamento</p>
                <div className="flex gap-3 items-center">
                  <input type="time" className="input" style={{ width: 'auto' }}
                    value={settings['business_hours_start'] || '08:00'}
                    onChange={e => setSettings({ ...settings, business_hours_start: e.target.value })} />
                  <span style={{ color: 'var(--text-muted)' }}>até</span>
                  <input type="time" className="input" style={{ width: 'auto' }}
                    value={settings['business_hours_end'] || '18:00'}
                    onChange={e => setSettings({ ...settings, business_hours_end: e.target.value })} />
                </div>
              </div>
            </div>
          )}

          {/* WhatsApp */}
          {activeTab === 'whatsapp' && (
            <div className="card p-6 flex flex-col gap-4">
              {runtimeWhatsapp && (
                <div className="rounded-lg p-4"
                  style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)' }}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium" style={{ color: '#86efac' }}>Runtime ativo na Vercel</p>
                      <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                        O backend usa esta configuração em tempo real, mesmo quando a tabela `settings` ainda está vazia.
                      </p>
                    </div>
                    <span className={`badge ${runtimeWhatsapp.configured ? 'badge-green' : 'badge-gray'}`}>
                      {runtimeWhatsapp.configured ? 'Configurado' : 'Incompleto'}
                    </span>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3 mt-4 text-xs">
                    <div>
                      <p style={{ color: 'var(--text-muted)' }}>Access Token</p>
                      <p className="text-white">{runtimeWhatsapp.accessTokenConfigured ? runtimeWhatsapp.accessTokenPreview : 'Não configurado'}</p>
                    </div>
                    <div>
                      <p style={{ color: 'var(--text-muted)' }}>Phone Number ID</p>
                      <p className="text-white">{runtimeWhatsapp.phoneNumberId || 'Não configurado'}</p>
                    </div>
                    <div>
                      <p style={{ color: 'var(--text-muted)' }}>Business Account ID</p>
                      <p className="text-white">{runtimeWhatsapp.businessAccountId || 'Não configurado'}</p>
                    </div>
                    <div>
                      <p style={{ color: 'var(--text-muted)' }}>Verify Token</p>
                      <p className="text-white">{runtimeWhatsapp.verifyTokenConfigured ? runtimeWhatsapp.verifyTokenPreview : 'Não configurado'}</p>
                    </div>
                  </div>
                </div>
              )}
              <div className="rounded-lg p-3"
                style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
                <p className="text-sm font-medium" style={{ color: '#fbbf24' }}>⚠️ Credenciais sensíveis</p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                  Estas configurações são salvas de forma criptografada. Obtenha os valores em{' '}
                  <a href="https://developers.facebook.com" target="_blank" className="underline" style={{ color: '#fbbf24' }}>
                    developers.facebook.com
                  </a>
                </p>
              </div>
              <h3 className="font-semibold text-white">WhatsApp Cloud API</h3>
              {[
                { key: 'whatsapp_access_token', label: 'Access Token', placeholder: 'EAAxxxxxxx...' },
                { key: 'whatsapp_phone_number_id', label: 'Phone Number ID', placeholder: '1234567890' },
                { key: 'whatsapp_business_account_id', label: 'Business Account ID', placeholder: '9876543210' },
                { key: 'whatsapp_verify_token', label: 'Webhook Verify Token', placeholder: 'seu_token_secreto' },
                { key: 'whatsapp_app_secret', label: 'App Secret', placeholder: 'xxxxxx' },
              ].map(field => (
                <div key={field.key} className="form-group">
                  <label className="label">{field.label}</label>
                  <input type="password" className="input" placeholder={field.placeholder}
                    value={settings[field.key] || ''}
                    onChange={e => setSettings({ ...settings, [field.key]: e.target.value })} />
                </div>
              ))}
              <div className="rounded-lg p-3"
                style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)' }}>
                <p className="text-xs font-medium" style={{ color: '#86efac' }}>URL do webhook:</p>
                <code className="text-xs" style={{ color: '#4ade80' }}>
                  {runtimeWhatsapp?.webhookUrl || `${process.env.NEXT_PUBLIC_APP_URL || 'https://seusite.vercel.app'}/api/webhooks/whatsapp`}
                </code>
              </div>
            </div>
          )}

          {/* Campanhas */}
          {activeTab === 'campanhas' && (
            <div className="card p-6 flex flex-col gap-4">
              <h3 className="font-semibold text-white">Configurações de Campanha</h3>
              <div className="form-group">
                <label className="label">Limite diário de mensagens</label>
                <input type="number" className="input" min={1} max={10000}
                  value={settings['campaign_daily_limit'] || '1000'}
                  onChange={e => setSettings({ ...settings, campaign_daily_limit: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="label">Intervalo entre lotes (segundos)</label>
                <input type="number" className="input" min={1} max={60}
                  value={settings['campaign_batch_interval'] || '5'}
                  onChange={e => setSettings({ ...settings, campaign_batch_interval: e.target.value })} />
              </div>
              <div className="rounded-lg p-3 flex items-start gap-2"
                style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                <span className="text-red-400 mt-0.5">🛡️</span>
                <div>
                  <p className="text-sm font-medium text-red-400">Proteção anti-spam ativa</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                    Mensagens nunca são enviadas para clientes com opt-out ou aceitou_marketing = false.
                    Quando o cliente responder &quot;SAIR&quot;, é removido automaticamente.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Segurança */}
          {activeTab === 'seguranca' && (
            <div className="card p-6 flex flex-col gap-4">
              <h3 className="font-semibold text-white">Segurança e IA</h3>
              <div className="flex items-center justify-between p-4 rounded-lg"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)' }}>
                <div>
                  <p className="text-sm font-medium text-white">IA de atendimento</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Responde dúvidas comuns automaticamente</p>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <div className="relative w-10 h-6">
                    <input type="checkbox" className="sr-only"
                      checked={settings['ai_enabled'] === 'true'}
                      onChange={e => setSettings({ ...settings, ai_enabled: e.target.checked ? 'true' : 'false' })} />
                    <div className="w-10 h-6 rounded-full transition-colors"
                      style={{ background: settings['ai_enabled'] === 'true' ? 'var(--brand-red)' : 'rgba(255,255,255,0.1)' }}>
                      <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                        settings['ai_enabled'] === 'true' ? 'translate-x-4' : ''
                      }`} />
                    </div>
                  </div>
                </label>
              </div>
              <div className="form-group">
                <label className="label">Palavra-chave para transferir ao atendente</label>
                <input type="text" className="input"
                  value={settings['ai_transfer_keyword'] || 'atendente'}
                  onChange={e => setSettings({ ...settings, ai_transfer_keyword: e.target.value })} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
