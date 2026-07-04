import { createClient } from '@/lib/supabase/server'
import { getWhatsAppPhoneCandidates } from '@/lib/utils'
import type { Metadata } from 'next'
import AtendimentoClient from './AtendimentoClient'

export const metadata: Metadata = { title: 'Atendimento' }

type ConversationRow = {
  id: string
  phone: string
  status: string
  unread_count: number
  last_message_at: string | null
  customer?: { name: string; phone_normalized: string } | Array<{ name: string; phone_normalized: string }>
  assigned_to?: { full_name: string } | Array<{ full_name: string }>
  messages?: Array<{ content: string; direction: string; created_at: string; status: string }>
  [key: string]: unknown
}

function pickLatestConversation(current: ConversationRow | undefined, candidate: ConversationRow) {
  if (!current) return candidate

  const currentTime = current.last_message_at ? new Date(current.last_message_at).getTime() : 0
  const candidateTime = candidate.last_message_at ? new Date(candidate.last_message_at).getTime() : 0

  return candidateTime > currentTime ? candidate : current
}

function dedupeConversations(rows: ConversationRow[]) {
  const grouped = new Map<string, ConversationRow>()

  for (const row of rows) {
    const signature = getWhatsAppPhoneCandidates(row.phone).sort().join('|') || row.id
    grouped.set(signature, pickLatestConversation(grouped.get(signature), row))
  }

  return Array.from(grouped.values()).sort((a, b) => {
    const left = a.last_message_at ? new Date(a.last_message_at).getTime() : 0
    const right = b.last_message_at ? new Date(b.last_message_at).getTime() : 0
    return right - left
  })
}

function takeFirst<T>(value: T | T[] | undefined): T | undefined {
  return Array.isArray(value) ? value[0] : value
}

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

  const visibleConversations = dedupeConversations((conversations || []) as ConversationRow[]).map(
    conversation => ({
      ...conversation,
      last_message_at: conversation.last_message_at || new Date(0).toISOString(),
      customer: takeFirst(conversation.customer),
      assigned_to: takeFirst(conversation.assigned_to),
    })
  )

  return (
    <div className="animate-fade-in h-screen flex flex-col">
      <div className="page-header">
        <div>
          <h1 className="page-title">Atendimento</h1>
          <p className="page-subtitle">Caixa de entrada — WhatsApp</p>
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        <AtendimentoClient conversations={visibleConversations} />
      </div>
    </div>
  )
}
