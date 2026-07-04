import Papa from 'papaparse'
import * as XLSX from 'xlsx'

export type ExportableContact = {
  id: string
  name: string
  phone: string
  email: string | null
  city: string | null
  neighborhood: string | null
  status: string | null
  acceptedMarketing: boolean
  contactOrigin: string | null
  mainInterest: string | null
  notes: string | null
  createdAt: string | null
  lastContact: string | null
  tags: string[]
}

type ExportRow = {
  Nome: string
  Telefone: string
  Email: string
  Cidade: string
  Bairro: string
  Status: string
  Marketing: string
  Origem: string
  Interesse: string
  Etiquetas: string
  UltimoContato: string
  Cadastro: string
  Observacoes: string
}

function formatDate(value: string | null) {
  if (!value) return ''
  return new Date(value).toLocaleString('pt-BR')
}

function formatTags(tags: string[]) {
  return tags.filter(Boolean).join('; ')
}

function toExportRow(contact: ExportableContact): ExportRow {
  return {
    Nome: contact.name,
    Telefone: contact.phone,
    Email: contact.email || '',
    Cidade: contact.city || '',
    Bairro: contact.neighborhood || '',
    Status: contact.status || '',
    Marketing: contact.acceptedMarketing ? 'Sim' : 'Nao',
    Origem: contact.contactOrigin || '',
    Interesse: contact.mainInterest || '',
    Etiquetas: formatTags(contact.tags),
    UltimoContato: formatDate(contact.lastContact),
    Cadastro: formatDate(contact.createdAt),
    Observacoes: contact.notes || '',
  }
}

export function contactsToCsv(contacts: ExportableContact[]) {
  return Papa.unparse(contacts.map(toExportRow))
}

export function contactsToJson(contacts: ExportableContact[]) {
  return JSON.stringify(contacts, null, 2)
}

export function contactsToVcf(contacts: ExportableContact[]) {
  return contacts.map(contact => {
    const lines = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      `FN:${escapeVcfValue(contact.name)}`,
      `TEL;TYPE=CELL:${escapeVcfValue(contact.phone)}`,
    ]

    if (contact.email) {
      lines.push(`EMAIL;TYPE=INTERNET:${escapeVcfValue(contact.email)}`)
    }

    if (contact.city || contact.neighborhood) {
      lines.push(`ADR;TYPE=HOME:;;${escapeVcfValue(contact.neighborhood || '')};${escapeVcfValue(contact.city || '')};;;Brasil`)
    }

    const noteParts = [
      contact.contactOrigin ? `Origem: ${contact.contactOrigin}` : '',
      contact.mainInterest ? `Interesse: ${contact.mainInterest}` : '',
      contact.tags.length > 0 ? `Etiquetas: ${formatTags(contact.tags)}` : '',
      contact.notes ? `Obs: ${contact.notes}` : '',
    ].filter(Boolean)

    if (noteParts.length > 0) {
      lines.push(`NOTE:${escapeVcfValue(noteParts.join(' | '))}`)
    }

    lines.push('END:VCARD')
    return lines.join('\r\n')
  }).join('\r\n')
}

export function buildContactsWorkbook(contacts: ExportableContact[]) {
  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.json_to_sheet(contacts.map(toExportRow))
  XLSX.utils.book_append_sheet(workbook, sheet, 'Contatos')
  return workbook
}

function escapeVcfValue(value: string) {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
}
