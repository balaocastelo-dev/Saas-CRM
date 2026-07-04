'use client'

import Image from 'next/image'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Check,
  CheckCheck,
  Clock,
  ImageIcon,
  Loader2,
  MessageSquare,
  Paperclip,
  Plus,
  Search,
  Send,
  Sparkles,
  User,
  Volume2,
  X,
} from 'lucide-react'
import { formatPhone, normalizeWhatsAppPhone } from '@/lib/utils'
import { getWhatsAppMessagePreview, parseWhatsAppMediaContent } from '@/lib/whatsapp/message-content'

interface Conversation {
  id: string
  phone: string
  status: string
  unread_count: number
  last_message_at: string
  customer?: { name: string; phone_normalized: string }
  assigned_to?: { id?: string; full_name: string }
  messages?: Array<{ content: string; direction: string; created_at: string; status: string; message_type: string }>
}

interface ConversationMessage {
  content: string
  direction: string
  created_at: string
  status: string
  message_type: string
}

interface QuickReply {
  id: string
  shortcut: string
  title: string
  content: string
}

interface AssigneeOption {
  id: string
  full_name: string | null
  user_role: string
}

interface ApprovedTemplate {
  id: string
  name: string
  variables: string[] | null
}

type AtendimentoClientProps = {
  conversations: Conversation[]
  quickReplies: QuickReply[]
  assignees: AssigneeOption[]
  approvedTemplates: ApprovedTemplate[]
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
    const frame = window.requestAnimationFrame(() => {
      setLabel(formatMessageTime(value))
    })

    return () => window.cancelAnimationFrame(frame)
  }, [value])

  return <span suppressHydrationWarning>{label}</span>
}

function getConversationPreview(conversation: Conversation) {
  return conversation.customer?.name || formatPhone(conversation.phone)
}

function getMediaUrl(mediaId: string) {
  return `/api/atendimento/media/${mediaId}`
}

function renderMessageContent(message: ConversationMessage) {
  if (message.message_type === 'image') {
    const media = parseWhatsAppMediaContent(message.content)

    if (!media?.mediaId) {
      return <p>(imagem indisponível)</p>
    }

    return (
      <div className="space-y-2">
        <a href={getMediaUrl(media.mediaId)} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg">
          <Image
            src={getMediaUrl(media.mediaId)}
            alt={media.caption || 'Imagem do WhatsApp'}
            width={320}
            height={240}
            className="h-auto max-w-full rounded-lg"
            unoptimized
          />
        </a>
        {media.caption && <p className="whitespace-pre-wrap break-words">{media.caption}</p>}
      </div>
    )
  }

  if (message.message_type === 'audio') {
    const media = parseWhatsAppMediaContent(message.content)

    if (!media?.mediaId) {
      return <p>(áudio indisponível)</p>
    }

    return (
      <div className="space-y-2">
        <audio controls preload="none" className="max-w-full">
          <source src={getMediaUrl(media.mediaId)} type={media.mimeType || 'audio/ogg'} />
        </audio>
        {media.caption && <p className="whitespace-pre-wrap break-words">{media.caption}</p>}
      </div>
    )
  }

  return <p className="whitespace-pre-wrap break-words">{message.content || '(mensagem de template)'}</p>
}

export default function AtendimentoClient({
  conversations,
  quickReplies,
  assignees,
  approvedTemplates,
}: AtendimentoClientProps) {
  const router = useRouter()
  const [conversationList, setConversationList] = useState(conversations)
  const [selectedId, setSelectedId] = useState<string | null>(conversations[0]?.id || null)
  const [message, setMessage] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [search, setSearch] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const [assigning, setAssigning] = useState(false)
  const [assignmentError, setAssignmentError] = useState('')
  const [showStartForm, setShowStartForm] = useState(false)
  const [startPhone, setStartPhone] = useState('')
  const [startCustomerName, setStartCustomerName] = useState('')
  const [startTemplateId, setStartTemplateId] = useState(approvedTemplates[0]?.id || '')
  const [startTemplateVariables, setStartTemplateVariables] = useState<Record<string, string>>({})
  const [startingConversation, setStartingConversation] = useState(false)
  const [startError, setStartError] = useState('')
  const [startSuccess, setStartSuccess] = useState('')
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    setConversationList(conversations)
    setSelectedId(current =>
      current && conversations.some(conversation => conversation.id === current)
        ? current
        : conversations[0]?.id || null
    )
  }, [conversations])

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        router.refresh()
      }
    }, 5000)

    return () => window.clearInterval(interval)
  }, [router])

  const filtered = useMemo(
    () =>
      conversationList.filter(conversation =>
        conversation.customer?.name?.toLowerCase().includes(search.toLowerCase()) ||
        conversation.phone?.includes(search)
      ),
    [conversationList, search]
  )

  const selected = conversationList.find(conversation => conversation.id === selectedId) || conversationList[0]
  const messages = selected?.messages || []
  const selectedStartTemplate = useMemo(
    () => approvedTemplates.find(template => template.id === startTemplateId) || null,
    [approvedTemplates, startTemplateId]
  )

  useEffect(() => {
    const nextVariables = (selectedStartTemplate?.variables || []).reduce<Record<string, string>>(
      (accumulator, variableName) => {
        accumulator[variableName] = startTemplateVariables[variableName] || ''
        return accumulator
      },
      {}
    )

    setStartTemplateVariables(nextVariables)
  }, [selectedStartTemplate])

  const statusIcon = (status: string) => {
    if (status === 'read') return <CheckCheck size={13} className="text-blue-400" />
    if (status === 'delivered') return <CheckCheck size={13} style={{ color: 'var(--text-muted)' }} />
    if (status === 'sent') return <Check size={13} style={{ color: 'var(--text-muted)' }} />
    return <Clock size={13} style={{ color: 'var(--text-muted)' }} />
  }

  async function handleSendMessage() {
    if (!selected || ((!message.trim() && !selectedFile) || sending)) return

    setSending(true)
    setSendError('')

    try {
      const trimmedMessage = message.trim()
      let response: Response

      if (selectedFile) {
        const formData = new FormData()
        formData.set('conversationId', selected.id)
        formData.set('text', trimmedMessage)
        formData.set('media', selectedFile)

        response = await fetch('/api/atendimento/send', {
          method: 'POST',
          body: formData,
        })
      } else {
        response = await fetch('/api/atendimento/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            conversationId: selected.id,
            text: trimmedMessage,
          }),
        })
      }

      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload.error || 'Não foi possível enviar a mensagem.')
      }

      const createdMessage = payload.message as {
        content: string
        direction: string
        created_at: string
        status: string
        message_type: string
      }

      setConversationList(currentConversations =>
        currentConversations.map(conversation =>
          conversation.id === selected.id
            ? {
                ...conversation,
                status: 'em_atendimento',
                last_message_at: createdMessage.created_at,
                messages: [...(conversation.messages || []), createdMessage],
              }
            : conversation
        )
      )
      setMessage('')
      setSelectedFile(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    } catch (error) {
      setSendError(error instanceof Error ? error.message : 'Erro ao enviar mensagem.')
    } finally {
      setSending(false)
    }
  }

  async function handleAssignConversation(assignedTo: string) {
    if (!selected || assigning) return

    setAssigning(true)
    setAssignmentError('')

    try {
      const response = await fetch('/api/atendimento/assign', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          conversationId: selected.id,
          assignedTo: assignedTo || null,
        }),
      })

      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload.error || 'Não foi possível atribuir a conversa.')
      }

      const assignedProfile = Array.isArray(payload.conversation?.assigned_to)
        ? payload.conversation.assigned_to[0]
        : payload.conversation?.assigned_to

      setConversationList(currentConversations =>
        currentConversations.map(conversation =>
          conversation.id === selected.id
            ? {
                ...conversation,
                assigned_to: assignedProfile
                  ? {
                      id: assignedProfile.id,
                      full_name: assignedProfile.full_name,
                    }
                  : undefined,
              }
            : conversation
        )
      )
    } catch (error) {
      setAssignmentError(error instanceof Error ? error.message : 'Erro ao atribuir a conversa.')
    } finally {
      setAssigning(false)
    }
  }

  async function handleStartConversation() {
    if (!startPhone.trim() || !startTemplateId || startingConversation) {
      return
    }

    setStartingConversation(true)
    setStartError('')
    setStartSuccess('')

    try {
      const response = await fetch('/api/atendimento/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phone: startPhone.trim(),
          customerName: startCustomerName.trim() || undefined,
          templateId: startTemplateId,
          templateVariables: startTemplateVariables,
        }),
      })

      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload.error || 'Não foi possível iniciar a conversa.')
      }

      const normalizedPhone = normalizeWhatsAppPhone(startPhone)
      const optimisticConversation: Conversation = {
        id: payload.conversationId,
        phone: normalizedPhone,
        status: 'aguardando',
        unread_count: 0,
        last_message_at: new Date().toISOString(),
        customer: {
          name: payload.customer?.name || startCustomerName.trim() || formatPhone(normalizedPhone),
          phone_normalized: normalizedPhone,
        },
        messages: [],
      }

      setConversationList(currentConversations => {
        if (currentConversations.some(conversation => conversation.id === optimisticConversation.id)) {
          return currentConversations
        }

        return [optimisticConversation, ...currentConversations]
      })
      setSelectedId(payload.conversationId)
      setShowStartForm(false)
      setStartPhone('')
      setStartCustomerName('')
      setStartTemplateId(approvedTemplates[0]?.id || '')
      setStartTemplateVariables({})
      setStartSuccess(payload.message || 'Conversa iniciada com sucesso.')
      router.refresh()
    } catch (error) {
      setStartError(error instanceof Error ? error.message : 'Erro ao iniciar conversa.')
    } finally {
      setStartingConversation(false)
    }
  }

  function applyQuickReply(content: string) {
    setMessage(currentMessage =>
      currentMessage.trim() ? `${currentMessage.trim()}\n${content}` : content
    )
  }

  function handleSelectFile(file: File | null) {
    setSelectedFile(file)
    if (!file && fileInputRef.current) {
      fileInputRef.current.value = ''
    }
    if (file && !(file.type.startsWith('image/') || file.type.startsWith('audio/'))) {
      setSendError('Selecione apenas arquivos de imagem ou áudio.')
      setSelectedFile(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      return
    }

    setSendError('')
  }

  return (
    <div className="flex h-full overflow-hidden" style={{ borderTop: '1px solid var(--border-color)' }}>
      <div
        className="w-80 flex-shrink-0 flex flex-col border-r"
        style={{ borderColor: 'var(--border-color)', background: 'var(--bg-sidebar)' }}>
        <div className="p-3 border-b space-y-3" style={{ borderColor: 'var(--border-color)' }}>
          <div className="relative">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2"
              style={{ color: 'var(--text-muted)' }}
            />
            <input
              type="search"
              className="search-input w-full"
              placeholder="Buscar conversa..."
              value={search}
              onChange={event => setSearch(event.target.value)}
            />
          </div>

          <button type="button" className="btn-secondary w-full" onClick={() => setShowStartForm(current => !current)}>
            {showStartForm ? <X size={15} /> : <Plus size={15} />}
            {showStartForm ? 'Fechar nova conversa' : 'Iniciar conversa'}
          </button>

          {showStartForm && (
            <div
              className="rounded-xl border p-3 space-y-3"
              style={{
                borderColor: 'var(--border-color)',
                background: 'var(--bg-card)',
              }}>
              <div className="space-y-1">
                <p className="text-sm font-medium text-white">Nova conversa segura</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Usa apenas template aprovado pela Meta para iniciar atendimento em número não salvo.
                </p>
              </div>

              <input
                type="tel"
                className="input"
                placeholder="Telefone com DDI, ex: 5519999999999"
                value={startPhone}
                onChange={event => setStartPhone(event.target.value)}
              />

              <input
                type="text"
                className="input"
                placeholder="Nome do cliente (opcional)"
                value={startCustomerName}
                onChange={event => setStartCustomerName(event.target.value)}
              />

              <select
                className="select"
                value={startTemplateId}
                onChange={event => setStartTemplateId(event.target.value)}>
                <option value="">Selecione um template aprovado...</option>
                {approvedTemplates.map(template => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>

              {(selectedStartTemplate?.variables || []).map(variableName => (
                <div key={variableName} className="form-group">
                  <label className="label">{variableName}</label>
                  <input
                    type="text"
                    className="input"
                    value={startTemplateVariables[variableName] || ''}
                    onChange={event =>
                      setStartTemplateVariables(current => ({
                        ...current,
                        [variableName]: event.target.value,
                      }))
                    }
                  />
                </div>
              ))}

              {approvedTemplates.length === 0 && (
                <p className="text-xs" style={{ color: '#fbbf24' }}>
                  Nenhum template aprovado disponível. Cadastre e aprove um template na Meta antes de iniciar conversas
                  proativas.
                </p>
              )}

              {startError && <p className="text-xs text-red-400">{startError}</p>}
              {startSuccess && <p className="text-xs text-green-400">{startSuccess}</p>}

              <button
                type="button"
                className="btn-primary w-full"
                disabled={!startPhone.trim() || !startTemplateId || startingConversation}
                onClick={() => void handleStartConversation()}>
                {startingConversation ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                Iniciar com template
              </button>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtered.map(conversation => {
            const lastMessage = conversation.messages?.[conversation.messages.length - 1]
            const isSelected = conversation.id === selectedId

            return (
              <button
                key={conversation.id}
                onClick={() => setSelectedId(conversation.id)}
                className="w-full text-left p-4 border-b transition-colors hover:bg-white/5"
                style={{
                  borderColor: 'var(--border-color)',
                  background: isSelected ? 'rgba(220,38,38,0.08)' : undefined,
                  borderLeft: isSelected ? '3px solid var(--brand-red)' : '3px solid transparent',
                }}>
                <div className="flex items-start gap-3">
                  <div className="avatar w-10 h-10 text-sm flex-shrink-0">
                    {getConversationPreview(conversation).charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <p className="font-medium text-white text-sm truncate">
                        {getConversationPreview(conversation)}
                      </p>
                      {lastMessage && (
                        <span className="text-xs flex-shrink-0 ml-1" style={{ color: 'var(--text-muted)' }}>
                          <MessageTime value={lastMessage.created_at} />
                        </span>
                      )}
                    </div>
                    {lastMessage && (
                      <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                        {lastMessage.direction === 'outbound' ? '→ ' : ''}
                        {getWhatsAppMessagePreview(lastMessage.message_type, lastMessage.content)}
                      </p>
                    )}
                    <div className="mt-1 flex items-center gap-2">
                      {conversation.assigned_to?.full_name && (
                        <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                          {conversation.assigned_to.full_name}
                        </span>
                      )}
                      {conversation.unread_count > 0 && (
                        <span
                          className="inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold"
                          style={{ background: 'var(--brand-red)', color: 'white' }}>
                          {conversation.unread_count}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            )
          })}

          {filtered.length === 0 && (
            <div className="text-center py-12">
              <MessageSquare size={28} className="mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                Nenhuma conversa
              </p>
            </div>
          )}
        </div>
      </div>

      {selected ? (
        <div className="flex-1 flex flex-col">
          <div
            className="flex items-center gap-3 px-5 py-3 border-b"
            style={{ borderColor: 'var(--border-color)', background: 'var(--bg-secondary)' }}>
            <div className="avatar w-9 h-9 text-sm">
              {getConversationPreview(selected).charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="font-semibold text-white text-sm">{getConversationPreview(selected)}</p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {formatPhone(selected.phone)}
              </p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <select
                className="select"
                style={{ width: '220px' }}
                disabled={assigning}
                value={selected.assigned_to?.id || ''}
                onChange={event => void handleAssignConversation(event.target.value)}>
                <option value="">Sem responsável</option>
                {assignees.map(assignee => (
                  <option key={assignee.id} value={assignee.id}>
                    {assignee.full_name || assignee.user_role}
                  </option>
                ))}
              </select>
              <span className={`badge ${selected.status === 'resolvido' ? 'badge-green' : 'badge-yellow'}`}>
                {selected.status}
              </span>
            </div>
          </div>

          {(selected.assigned_to?.full_name || assignmentError) && (
            <div
              className="px-5 py-2 text-xs border-b flex items-center gap-2"
              style={{ borderColor: 'var(--border-color)', color: assignmentError ? '#f87171' : 'var(--text-secondary)' }}>
              {!assignmentError && <User size={13} />}
              {assignmentError || `Responsável atual: ${selected.assigned_to?.full_name || 'Não atribuído'}`}
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-3">
            {messages.map((msg, index) => (
              <div
                key={`${msg.direction}-${msg.created_at}-${index}`}
                className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                <div>
                  <div className={msg.direction === 'outbound' ? 'chat-bubble-outbound' : 'chat-bubble-inbound'}>
                    {renderMessageContent(msg)}
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
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    Nenhuma mensagem ainda
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="p-4 border-t space-y-3" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-secondary)' }}>
            {quickReplies.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {quickReplies.map(reply => (
                  <button
                    key={reply.id}
                    type="button"
                    className="btn-secondary btn-sm"
                    onClick={() => applyQuickReply(reply.content)}>
                    <Sparkles size={13} />
                    {reply.shortcut}
                  </button>
                ))}
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,audio/*"
              className="hidden"
              onChange={event => handleSelectFile(event.target.files?.[0] || null)}
            />

            {selectedFile && (
              <div
                className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2"
                style={{ borderColor: 'var(--border-color)', background: 'var(--bg-card)' }}>
                <div className="flex items-center gap-2 min-w-0">
                  {selectedFile.type.startsWith('image/') ? (
                    <ImageIcon size={16} style={{ color: 'var(--text-secondary)' }} />
                  ) : (
                    <Volume2 size={16} style={{ color: 'var(--text-secondary)' }} />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm text-white truncate">{selectedFile.name}</p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {selectedFile.type.startsWith('image/')
                        ? 'Foto selecionada'
                        : 'Áudio selecionado'}
                      {selectedFile.type.startsWith('audio/') ? ' - envie o texto separado se quiser legenda.' : ''}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => handleSelectFile(null)}>
                  <X size={15} />
                </button>
              </div>
            )}

            <div className="flex items-center gap-3">
              <button
                type="button"
                className="btn-secondary p-2.5"
                disabled={sending}
                onClick={() => fileInputRef.current?.click()}>
                <Paperclip size={16} />
              </button>
              <input
                type="text"
                className="input flex-1"
                placeholder={
                  selectedFile?.type.startsWith('image/')
                    ? 'Digite a legenda da foto...'
                    : 'Digite uma mensagem... (ou anexe foto/áudio)'
                }
                value={message}
                onChange={event => setMessage(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    void handleSendMessage()
                  }
                }}
              />
              <button
                className="btn-primary p-2.5"
                disabled={(!message.trim() && !selectedFile) || sending}
                onClick={() => void handleSendMessage()}>
                {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              </button>
            </div>

            {sendError && <p className="text-xs text-red-400">{sendError}</p>}

            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              ⚠️ Mensagens livres só podem ser enviadas dentro da janela de 24h após a última interação do cliente.
              Fora da janela, use template aprovado da Meta para iniciar ou retomar a conversa.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <MessageSquare size={48} className="mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Selecione uma conversa
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
