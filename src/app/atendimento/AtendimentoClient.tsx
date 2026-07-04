'use client'

import { useEffect, useState } from 'react'
import { Loader2, MessageSquare, Send, Search, CheckCheck, Check, Clock, User } from 'lucide-react'
import { formatPhone } from '@/lib/utils'

interface Conversation {
  id: string
  phone: string
  status: string
  unread_count: number
  last_message_at: string
  customer?: { name: string; phone_normalized: string }
  assigned_to?: { full_name: string }
  messages?: Array<{ content: string; direction: string; created_at: string; status: string }>
}

function formatMessageTime(value: string, timeZone?: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    ...(timeZone ? { timeZone } : {}),
  }).format(new Date(value))
}

function MessageTime({ value }: { value: string }) {
  const [label, setLabel] = useState(() => formatMessageTime(value, 'UTC'))

  useEffect(() => {
    setLabel(formatMessageTime(value))
  }, [value])

  return <span suppressHydrationWarning>{label}</span>
}

export default function AtendimentoClient({ conversations }: { conversations: Conversation[] }) {
  const [conversationList, setConversationList] = useState(conversations)
  const [selectedId, setSelectedId] = useState<string | null>(conversations[0]?.id || null)
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')

  const filtered = conversationList.filter(c =>
    c.customer?.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.phone?.includes(search)
  )

  const selected = conversationList.find(c => c.id === selectedId)
  const messages = selected?.messages || []

  const statusIcon = (status: string) => {
    if (status === 'read') return <CheckCheck size={13} className="text-blue-400" />
    if (status === 'delivered') return <CheckCheck size={13} style={{ color: 'var(--text-muted)' }} />
    if (status === 'sent') return <Check size={13} style={{ color: 'var(--text-muted)' }} />
    return <Clock size={13} style={{ color: 'var(--text-muted)' }} />
  }

  async function handleSendMessage() {
    if (!selected || !message.trim() || sending) return

    setSending(true)
    setSendError('')

    try {
      const response = await fetch('/api/atendimento/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          conversationId: selected.id,
          text: message.trim(),
        }),
      })

      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload.error || 'Não foi possível enviar a mensagem.')
      }

      const createdMessage = payload.message as {
        content: string
        direction: string
        created_at: string
        status: string
      }

      setConversationList(prev =>
        prev.map(conv =>
          conv.id === selected.id
            ? {
                ...conv,
                status: 'em_atendimento',
                last_message_at: createdMessage.created_at,
                messages: [...(conv.messages || []), createdMessage],
              }
            : conv
        )
      )
      setMessage('')
    } catch (error) {
      setSendError(error instanceof Error ? error.message : 'Erro ao enviar mensagem.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex h-full overflow-hidden" style={{ borderTop: '1px solid var(--border-color)' }}>
      {/* Conversations list */}
      <div className="w-80 flex-shrink-0 flex flex-col border-r" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-sidebar)' }}>
        <div className="p-3 border-b" style={{ borderColor: 'var(--border-color)' }}>
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
            <input
              type="search" className="search-input w-full"
              placeholder="Buscar conversa..."
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtered.map(conv => {
            const lastMsg = conv.messages?.[conv.messages.length - 1]
            const isSelected = conv.id === selectedId

            return (
              <button key={conv.id} onClick={() => setSelectedId(conv.id)}
                className="w-full text-left p-4 border-b transition-colors hover:bg-white/5"
                style={{
                  borderColor: 'var(--border-color)',
                  background: isSelected ? 'rgba(220,38,38,0.08)' : undefined,
                  borderLeft: isSelected ? '3px solid var(--brand-red)' : '3px solid transparent'
                }}>
                <div className="flex items-start gap-3">
                  <div className="avatar w-10 h-10 text-sm flex-shrink-0">
                    {(conv.customer?.name || conv.phone)?.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <p className="font-medium text-white text-sm truncate">
                        {conv.customer?.name || formatPhone(conv.phone)}
                      </p>
                      {lastMsg && (
                        <span className="text-xs flex-shrink-0 ml-1" style={{ color: 'var(--text-muted)' }}>
                          <MessageTime value={lastMsg.created_at} />
                        </span>
                      )}
                    </div>
                    {lastMsg && (
                      <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                        {lastMsg.direction === 'outbound' ? '→ ' : ''}{lastMsg.content || '(template)'}
                      </p>
                    )}
                    {conv.unread_count > 0 && (
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold mt-1"
                        style={{ background: 'var(--brand-red)', color: 'white' }}>
                        {conv.unread_count}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            )
          })}

          {filtered.length === 0 && (
            <div className="text-center py-12">
              <MessageSquare size={28} className="mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Nenhuma conversa</p>
            </div>
          )}
        </div>
      </div>

      {/* Chat area */}
      {selected ? (
        <div className="flex-1 flex flex-col">
          {/* Chat header */}
          <div className="flex items-center gap-3 px-5 py-3 border-b" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-secondary)' }}>
            <div className="avatar w-9 h-9 text-sm">
              {(selected.customer?.name || selected.phone)?.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="font-semibold text-white text-sm">
                {selected.customer?.name || formatPhone(selected.phone)}
              </p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {formatPhone(selected.customer?.phone_normalized || selected.phone)}
              </p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              {selected.assigned_to && (
                <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
                  <User size={13} />
                  {selected.assigned_to.full_name}
                </div>
              )}
              <span className={`badge ${selected.status === 'resolvido' ? 'badge-green' : 'badge-yellow'}`}>
                {selected.status}
              </span>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-3">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                <div>
                  <div className={msg.direction === 'outbound' ? 'chat-bubble-outbound' : 'chat-bubble-inbound'}>
                    {msg.content || '(mensagem de template)'}
                  </div>
                  <div className={`flex items-center gap-1 mt-0.5 ${msg.direction === 'outbound' ? 'justify-end' : ''}`}>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      <MessageTime value={msg.created_at} />
                    </span>
                    {msg.direction === 'outbound' && statusIcon(msg.status)}
                  </div>
                </div>
              </div>
            ))}

            {messages.length === 0 && (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <MessageSquare size={40} className="mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Nenhuma mensagem ainda</p>
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="p-4 border-t" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-secondary)' }}>
            <div className="flex items-center gap-3">
              <input
                type="text"
                className="input flex-1"
                placeholder="Digite uma mensagem... (apenas dentro da janela de 24h)"
                value={message}
                onChange={e => setMessage(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void handleSendMessage()
                  }
                }}
              />
              <button className="btn-primary p-2.5" disabled={!message.trim() || sending} onClick={() => void handleSendMessage()}>
                {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              </button>
            </div>
            {sendError && (
              <p className="text-xs mt-2 text-red-400">
                {sendError}
              </p>
            )}
            <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
              ⚠️ Mensagens livres só podem ser enviadas dentro da janela de 24h após última interação do cliente
            </p>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <MessageSquare size={48} className="mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Selecione uma conversa</p>
          </div>
        </div>
      )}
    </div>
  )
}
