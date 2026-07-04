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
  assigned_to?: { id: string; full_name: string } | Array<{ id: string; full_name: string }>
  messages?: Array<{ content: string; direction: string; created_at: string; status: string }>
  [key: string]: unknown
}

type ConversationView = {
  id: string
  phone: string
  status: string
  unread_count: number
  last_message_at: string
  customer?: { name: string; phone_normalized: string }
  assigned_to?: { id: string; full_name: string }
  messages: Array<{ content: string; direction: string; created_at: string; status: string }>
}

type QuickReply = {
  id: string
  shortcut: string
  title: string
  content: string
}

type AssigneeOption = {
  id: string
  full_name: string | null
  user_role: string
}

type ApprovedTemplate = {
  id: string
  name: string
  variables: string[] | null
}

function pickLatestConversation(current: ConversationRow | undefined, candidate: ConversationRow) {
  if (!current) return candidate

  const currentTime = current.last_message_at ? new Date(current.last_message_at).getTime() : 0
  const candidateTime = candidate.last_message_at ? new Date(candidate.last_message_at).getTime() : 0

  return candidateTime > currentTime ? candidate : current
}

function mergeMessages(rows: ConversationRow[]) {
  const messages = rows.flatMap(row => row.messages || [])
  const seen = new Set<string>()

  return messages
    .sort((left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime())
    .filter(message => {
      const key = [
        message.direction,
        message.created_at,
        message.status,
        message.content || '',
      ].join('|')

      if (seen.has(key)) {
        return false
      }

      seen.add(key)
      return true
    })
}

function dedupeConversations(rows: ConversationRow[]): ConversationView[] {
  const grouped = new Map<string, ConversationRow[]>()

  for (const row of rows) {
    const signature = getWhatsAppPhoneCandidates(row.phone).sort().join('|') || row.id
    const currentGroup = grouped.get(signature) || []
    currentGroup.push(row)
    grouped.set(signature, currentGroup)
  }

  const deduped: ConversationView[] = []

  for (const group of grouped.values()) {
    const latest = group.reduce<ConversationRow | undefined>(
      (current, row) => pickLatestConversation(current, row),
      undefined
    )

    if (!latest) {
      continue
    }

    deduped.push(
      normalizeConversation({
        ...latest,
        unread_count: group.reduce((total, row) => total + (row.unread_count || 0), 0),
        customer: firstDefined(group.map(row => takeFirst(row.customer))),
        assigned_to: firstDefined(group.map(row => takeFirst(row.assigned_to))),
        messages: mergeMessages(group),
      })
    )
  }

  return deduped.sort((a, b) => {
    const left = new Date(a.last_message_at).getTime()
    const right = new Date(b.last_message_at).getTime()
    return right - left
  })
}

function normalizeConversation(row: ConversationRow): ConversationView {
  return {
    ...row,
    last_message_at: row.last_message_at || new Date(0).toISOString(),
    customer: takeFirst(row.customer),
    assigned_to: takeFirst(row.assigned_to),
    messages: (row.messages || []).sort(
      (left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime()
    ),
  }
}
function takeFirst<T>(value: T | T[] | undefined): T | undefined {
  return Array.isArray(value) ? value[0] : value
}

function firstDefined<T>(values: Array<T | undefined>): T | undefined {
  return values.find((value): value is T => value !== undefined)
}


export default async function AtendimentoPage() {
  const supabase = await createClient()

  const [
    { data: conversations },
    { data: quickReplies },
    { data: assignees },
    { data: approvedTemplates },
  ] = await Promise.all([
    supabase
      .from('whatsapp_conversations')
      .select(`
        *,
        customer:customers(name, phone_normalized),
        assigned_to:profiles!assigned_to(id, full_name),
        messages:whatsapp_messages(content, direction, created_at, status)
      `)
      .order('last_message_at', { ascending: false })
      .limit(200),
    supabase
      .from('quick_replies')
      .select('id, shortcut, title, content')
      .order('shortcut', { ascending: true }),
    supabase
      .from('profiles')
      .select('id, full_name, user_role')
      .eq('is_active', true)
      .in('user_role', ['admin', 'atendente', 'vendedor'])
      .order('full_name', { ascending: true }),
    supabase
      .from('templates')
      .select('id, name, variables')
      .eq('status', 'approved')
      .order('name', { ascending: true }),
  ])

  const visibleConversations = dedupeConversations((conversations || []) as ConversationRow[]).slice(0, 50)

  return (
    <div className="animate-fade-in h-screen flex flex-col">
      <div className="page-header">
        <div>
          <h1 className="page-title">Atendimento</h1>
          <p className="page-subtitle">Caixa de entrada — WhatsApp</p>
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        <AtendimentoClient
          conversations={visibleConversations}
          quickReplies={(quickReplies || []) as QuickReply[]}
          assignees={(assignees || []) as AssigneeOption[]}
          approvedTemplates={(approvedTemplates || []) as ApprovedTemplate[]}
        />
      </div>
    </div>
  )
}
