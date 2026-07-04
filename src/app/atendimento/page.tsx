import { createClient } from '@/lib/supabase/server'
import type { Metadata } from 'next'
import AtendimentoClient from './AtendimentoClient'

export const metadata: Metadata = { title: 'Atendimento' }

export default async function AtendimentoPage() {
  const supabase = await createClient()

  const { data: conversations } = await supabase
    .from('whatsapp_conversations')
    .select(`
      *,
      customer:customers(name, phone_normalized),
      assigned_to:profiles!assigned_to(full_name),
      messages:whatsapp_messages(content, direction, created_at, status)
    `)
    .order('last_message_at', { ascending: false })
    .limit(50)

  return (
    <div className="animate-fade-in h-screen flex flex-col">
      <div className="page-header">
        <div>
          <h1 className="page-title">Atendimento</h1>
          <p className="page-subtitle">Caixa de entrada — WhatsApp</p>
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        <AtendimentoClient conversations={conversations || []} />
      </div>
    </div>
  )
}
