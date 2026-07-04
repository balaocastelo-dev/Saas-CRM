import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

function digitsOnly(phone: string): string {
  return phone.replace(/\D/g, '')
}

export function normalizeWhatsAppPhone(phone: string): string {
  const clean = digitsOnly(phone)

  if (!clean) return ''
  if (clean.startsWith('00')) return clean.slice(2)

  return clean
}

export function getWhatsAppPhoneCandidates(phone: string): string[] {
  const normalized = normalizeWhatsAppPhone(phone)

  if (!normalized) return []

  const candidates = new Set<string>([normalized])

  // Compatibilidade com dados antigos que prefixavam 55 em números já
  // internacionalizados, como o sandbox +1 da Meta.
  if (!normalized.startsWith('55') && normalized.length >= 10) {
    candidates.add(`55${normalized}`)
  }

  if (normalized.startsWith('55') && normalized.length > 11) {
    candidates.add(normalized.slice(2))
  }

  return Array.from(candidates)
}

export function formatPhone(phone: string): string {
  const clean = normalizeWhatsAppPhone(phone)

  if (clean.startsWith('55') && clean.length === 13) {
    const local = clean.slice(2)
    return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`
  }

  if (clean.startsWith('55') && clean.length === 12) {
    const local = clean.slice(2)
    return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`
  }

  if (clean.startsWith('1') && clean.length === 11) {
    return `+1 (${clean.slice(1, 4)}) ${clean.slice(4, 7)}-${clean.slice(7)}`
  }

  if (clean.length === 11) {
    return `(${clean.slice(0, 2)}) ${clean.slice(2, 7)}-${clean.slice(7)}`
  }
  if (clean.length === 10) {
    return `(${clean.slice(0, 2)}) ${clean.slice(2, 6)}-${clean.slice(6)}`
  }

  return clean ? `+${clean}` : phone
}

export function normalizePhone(phone: string): string {
  const clean = digitsOnly(phone)
  // Se já tem 55 na frente
  if (clean.startsWith('55') && clean.length >= 12) return clean
  // Adicionar código do Brasil
  return `55${clean}`
}

export function validateBrazilianPhone(phone: string): boolean {
  const normalized = normalizePhone(phone)
  // 55 + DDD (2 digits) + number (8 or 9 digits) = 12 or 13 digits
  return /^55\d{2}[6-9]\d{7,8}$/.test(normalized) || /^55\d{2}\d{8}$/.test(normalized)
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(date))
}

export function formatDateTime(date: string | Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date))
}

export function truncate(str: string, length: number): string {
  if (str.length <= length) return str
  return str.slice(0, length) + '...'
}

export function generateOrderNumber(): string {
  return `OS-${Date.now().toString().slice(-6)}`
}

export const STAGE_LABELS: Record<string, string> = {
  novo_lead: 'Novo Lead',
  em_atendimento: 'Em Atendimento',
  orcamento_enviado: 'Orçamento Enviado',
  negociacao: 'Negociação',
  aguardando_pagamento: 'Aguardando Pagamento',
  venda_concluida: 'Venda Concluída',
  perdido: 'Perdido',
}

export const PRODUCT_CATEGORY_LABELS: Record<string, string> = {
  notebooks: 'Notebooks',
  pcs_gamer: 'PCs Gamer',
  placas_video: 'Placas de Vídeo',
  monitores: 'Monitores',
  perifericos: 'Periféricos',
  assistencia: 'Assistência',
  licencas: 'Licenças',
  impressoras: 'Impressoras',
  outros: 'Outros',
}

export const PRODUCT_STATUS_LABELS: Record<string, string> = {
  ativo: 'Ativo',
  inativo: 'Inativo',
  sem_estoque: 'Sem estoque',
}

export const SERVICE_ORDER_STATUS_LABELS: Record<string, string> = {
  recebido: 'Recebido',
  em_analise: 'Em Análise',
  aguardando_aprovacao: 'Aguardando Aprovação',
  em_manutencao: 'Em Manutenção',
  aguardando_peca: 'Aguardando Peça',
  pronto: 'Pronto',
  entregue: 'Entregue',
  cancelado: 'Cancelado',
}

export const QUOTE_STATUS_LABELS: Record<string, string> = {
  rascunho: 'Rascunho',
  enviado: 'Enviado',
  aprovado: 'Aprovado',
  rejeitado: 'Rejeitado',
  expirado: 'Expirado',
}

export const MESSAGE_STATUS_LABELS: Record<string, string> = {
  pending: 'Pendente',
  sent: 'Enviada',
  delivered: 'Entregue',
  read: 'Lida',
  failed: 'Falhou',
}
