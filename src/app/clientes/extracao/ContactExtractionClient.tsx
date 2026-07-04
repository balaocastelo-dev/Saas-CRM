'use client'

import { useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import {
  Download,
  FileJson,
  FileSpreadsheet,
  FileText,
  Search,
  Smartphone,
} from 'lucide-react'
import {
  buildContactsWorkbook,
  contactsToCsv,
  contactsToJson,
  contactsToVcf,
  type ExportableContact,
} from '@/lib/contact-exports'
import { formatPhone } from '@/lib/utils'

type ContactExtractionClientProps = {
  initialContacts: ExportableContact[]
}

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function downloadBlob(content: BlobPart, type: string, filename: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function exportWorkbook(contacts: ExportableContact[], filename: string, bookType: XLSX.BookType) {
  const workbook = buildContactsWorkbook(contacts)
  const buffer = XLSX.write(workbook, { type: 'array', bookType })
  downloadBlob(buffer, 'application/octet-stream', filename)
}

function exportPdf(contacts: ExportableContact[]) {
  const rows = contacts.map(contact => `
    <tr>
      <td>${escapeHtml(contact.name)}</td>
      <td>${escapeHtml(formatPhone(contact.phone) || contact.phone)}</td>
      <td>${escapeHtml(contact.city || '')}</td>
      <td>${escapeHtml(contact.email || '')}</td>
      <td>${escapeHtml(contact.tags.join(', '))}</td>
    </tr>
  `).join('')

  const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=1200,height=900')

  if (!printWindow) {
    throw new Error('Nao foi possivel abrir a janela de impressao. Libere pop-ups e tente novamente.')
  }

  printWindow.document.write(`
    <!doctype html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <title>Contatos CRM</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 24px; color: #111827; }
          h1 { margin: 0 0 8px; font-size: 22px; }
          p { margin: 0 0 20px; color: #4b5563; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th, td { border: 1px solid #d1d5db; padding: 8px; text-align: left; vertical-align: top; }
          th { background: #f3f4f6; }
          @media print { body { margin: 12px; } }
        </style>
      </head>
      <body>
        <h1>Contatos exportados do CRM</h1>
        <p>Total: ${contacts.length} contato(s)</p>
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Telefone</th>
              <th>Cidade</th>
              <th>E-mail</th>
              <th>Etiquetas</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <script>
          window.onload = () => {
            window.print();
          };
        </script>
      </body>
    </html>
  `)
  printWindow.document.close()
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export default function ContactExtractionClient({ initialContacts }: ContactExtractionClientProps) {
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('todos')
  const [formatMessage, setFormatMessage] = useState('')
  const [formatError, setFormatError] = useState('')

  const filteredContacts = useMemo(() => {
    const normalizedQuery = normalizeText(query.trim())

    return initialContacts.filter(contact => {
      if (statusFilter !== 'todos' && (contact.status || 'ativo') !== statusFilter) {
        return false
      }

      if (!normalizedQuery) {
        return true
      }

      const searchable = normalizeText([
        contact.name,
        contact.phone,
        contact.email || '',
        contact.city || '',
        contact.tags.join(' '),
      ].join(' '))

      return searchable.includes(normalizedQuery)
    })
  }, [initialContacts, query, statusFilter])

  const totalWithTags = filteredContacts.filter(contact => contact.tags.length > 0).length
  const totalWithCity = filteredContacts.filter(contact => Boolean(contact.city)).length

  function runExport(action: () => void, successLabel: string) {
    try {
      setFormatError('')
      action()
      setFormatMessage(successLabel)
    } catch (error) {
      setFormatMessage('')
      setFormatError(error instanceof Error ? error.message : 'Falha ao exportar contatos.')
    }
  }

  return (
    <div className="page-content space-y-5">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="card p-5">
          <p className="text-xs uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>
            Contatos prontos
          </p>
          <p className="text-3xl font-bold text-white">{filteredContacts.length}</p>
          <p className="text-sm mt-2" style={{ color: 'var(--text-muted)' }}>
            Base filtrada para exportacao imediata.
          </p>
        </div>

        <div className="card p-5">
          <p className="text-xs uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>
            Com etiquetas
          </p>
          <p className="text-3xl font-bold text-white">{totalWithTags}</p>
          <p className="text-sm mt-2" style={{ color: 'var(--text-muted)' }}>
            Contatos com segmentacao pronta para campanha.
          </p>
        </div>

        <div className="card p-5">
          <p className="text-xs uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>
            Com cidade
          </p>
          <p className="text-3xl font-bold text-white">{totalWithCity}</p>
          <p className="text-sm mt-2" style={{ color: 'var(--text-muted)' }}>
            Registros com informacao geografica preenchida.
          </p>
        </div>
      </div>

      <div className="card p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Exportar contatos</h2>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
              Os arquivos sao gerados a partir da lista filtrada abaixo.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => runExport(
                () => downloadBlob(contactsToCsv(filteredContacts), 'text/csv;charset=utf-8;', 'contatos-crm.csv'),
                'CSV gerado com sucesso.'
              )}>
              <FileSpreadsheet size={15} />
              CSV
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => runExport(
                () => downloadBlob(contactsToJson(filteredContacts), 'application/json;charset=utf-8;', 'contatos-crm.json'),
                'JSON gerado com sucesso.'
              )}>
              <FileJson size={15} />
              JSON
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => runExport(
                () => downloadBlob(contactsToVcf(filteredContacts), 'text/vcard;charset=utf-8;', 'contatos-crm.vcf'),
                'VCF gerado com sucesso.'
              )}>
              <Smartphone size={15} />
              vCard
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => runExport(
                () => exportWorkbook(filteredContacts, 'contatos-crm.xlsx', 'xlsx'),
                'XLSX gerado com sucesso.'
              )}>
              <Download size={15} />
              XLSX
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => runExport(
                () => exportWorkbook(filteredContacts, 'contatos-crm.xls', 'xls'),
                'XLS gerado com sucesso.'
              )}>
              <Download size={15} />
              XLS
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => runExport(
                () => exportPdf(filteredContacts),
                'Visualizacao de PDF aberta para impressao.'
              )}>
              <FileText size={15} />
              PDF
            </button>
          </div>
        </div>

        {(formatMessage || formatError) && (
          <div
            className="mt-4 rounded-lg border px-3 py-2 text-sm"
            style={{
              borderColor: formatError ? 'rgba(248,113,113,0.35)' : 'rgba(74,222,128,0.35)',
              background: formatError ? 'rgba(127,29,29,0.18)' : 'rgba(20,83,45,0.18)',
              color: formatError ? '#fecaca' : '#bbf7d0',
            }}>
            {formatError || formatMessage}
          </div>
        )}
      </div>

      <div className="card p-5">
        <h2 className="text-lg font-semibold text-white">Origem dos dados</h2>
        <p className="text-sm mt-2 leading-6" style={{ color: 'var(--text-muted)' }}>
          Esta area exporta os contatos consolidados no CRM. O fluxo de abrir o WhatsApp Web por QR code e raspar a
          agenda diretamente dentro do SaaS nao e confiavel neste ambiente porque o WhatsApp Web bloqueia embed e a
          automacao no navegador disponivel aqui nao se manteve estavel.
        </p>
      </div>

      <div className="card p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Lista filtravel</h2>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
              Filtre por nome, telefone, e-mail, cidade ou etiqueta antes de exportar.
            </p>
          </div>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {filteredContacts.length} de {initialContacts.length} contato(s)
          </p>
        </div>

        <div className="flex flex-col gap-3 lg:flex-row">
          <label className="relative flex-1">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2"
              style={{ color: 'var(--text-muted)' }}
            />
            <input
              type="search"
              value={query}
              onChange={event => setQuery(event.target.value)}
              className="search-input w-full pl-10"
              placeholder="Buscar por nome, telefone, cidade, email ou etiqueta..."
            />
          </label>

          <select
            value={statusFilter}
            onChange={event => setStatusFilter(event.target.value)}
            className="select"
            style={{ width: 'auto' }}>
            <option value="todos">Todos os status</option>
            <option value="ativo">Ativo</option>
            <option value="inativo">Inativo</option>
            <option value="bloqueado">Bloqueado</option>
            <option value="opt-out">Opt-out</option>
          </select>
        </div>

        <div className="table-container mt-4">
          <table className="table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Telefone</th>
                <th>Cidade</th>
                <th>E-mail</th>
                <th>Etiquetas</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredContacts.length > 0 ? filteredContacts.map(contact => (
                <tr key={contact.id}>
                  <td className="font-medium text-white">{contact.name}</td>
                  <td>{formatPhone(contact.phone) || contact.phone || '—'}</td>
                  <td>{contact.city || '—'}</td>
                  <td>{contact.email || '—'}</td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {contact.tags.length > 0 ? contact.tags.map(tag => (
                        <span key={`${contact.id}-${tag}`} className="badge badge-gray">
                          {tag}
                        </span>
                      )) : '—'}
                    </div>
                  </td>
                  <td>{contact.status || 'ativo'}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={6}>
                    <div className="py-10 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                      Nenhum contato encontrado com os filtros atuais.
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
