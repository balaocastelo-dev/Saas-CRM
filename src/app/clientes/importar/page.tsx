'use client'

import { ChangeEvent, useMemo, useState } from 'react'
import Link from 'next/link'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  RefreshCw,
  Upload,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { buildCustomerPreviewRows, type CustomerPreviewRow, type RawImportRow } from '@/lib/customers-import'
import { formatPhone } from '@/lib/utils'

type DuplicateStrategy = 'update' | 'skip'
type PreviewStatus = 'novo' | 'duplicado' | 'invalido'

type PreviewRow = CustomerPreviewRow & {
  status: PreviewStatus
  duplicateId?: string
  duplicateName?: string
}

type ImportSummary = {
  created: number
  updated: number
  skipped: number
  failed: number
  messages: string[]
}

type ExistingCustomer = {
  id: string
  name: string
  phone_normalized: string
  email: string | null
}

function chunkArray<T>(items: T[], size: number) {
  const result: T[][] = []

  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size))
  }

  return result
}

function uniqueValues(values: string[]) {
  return [...new Set(values.map(value => value.trim()).filter(Boolean))]
}

async function parseFile(file: File) {
  const fileName = file.name.toLowerCase()

  if (fileName.endsWith('.csv')) {
    return new Promise<RawImportRow[]>((resolve, reject) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete(results: { data: RawImportRow[]; errors: Array<{ message?: string }> }) {
          if (results.errors.length > 0) {
            reject(new Error(results.errors[0]?.message || 'Nao foi possivel ler o CSV.'))
            return
          }

          resolve(results.data)
        },
        error(error: Error) {
          reject(error)
        },
      })
    })
  }

  if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
    const buffer = await file.arrayBuffer()
    const workbook = XLSX.read(buffer, { type: 'array' })
    const firstSheetName = workbook.SheetNames[0]
    const sheet = workbook.Sheets[firstSheetName]

    return XLSX.utils.sheet_to_json<RawImportRow>(sheet, {
      defval: '',
    })
  }

  throw new Error('Formato nao suportado. Use CSV, XLSX ou XLS.')
}

async function fetchExistingCustomers(
  supabase: ReturnType<typeof createClient>,
  rows: CustomerPreviewRow[]
) {
  const phones = uniqueValues(
    rows
      .map(row => row.payload?.phone_normalized || '')
      .filter(Boolean)
  )
  const emails = uniqueValues(
    rows
      .map(row => row.payload?.email || '')
      .filter(Boolean)
  )

  const existing: ExistingCustomer[] = []

  for (const phoneChunk of chunkArray(phones, 200)) {
    const { data, error } = await supabase
      .from('customers')
      .select('id, name, phone_normalized, email')
      .in('phone_normalized', phoneChunk)

    if (error) throw error
    existing.push(...(data || []))
  }

  for (const emailChunk of chunkArray(emails, 200)) {
    const { data, error } = await supabase
      .from('customers')
      .select('id, name, phone_normalized, email')
      .in('email', emailChunk)

    if (error) throw error

    for (const item of data || []) {
      if (!existing.some(customer => customer.id === item.id)) {
        existing.push(item)
      }
    }
  }

  return existing
}

async function ensureTags(
  supabase: ReturnType<typeof createClient>,
  tagNames: string[]
) {
  const names = uniqueValues(tagNames)

  if (names.length === 0) {
    return new Map<string, string>()
  }

  const { data: existingTags, error: existingError } = await supabase
    .from('tags')
    .select('id, name')
    .in('name', names)

  if (existingError) throw existingError

  const existingMap = new Map((existingTags || []).map(tag => [tag.name, tag.id]))
  const missingNames = names.filter(name => !existingMap.has(name))

  if (missingNames.length > 0) {
    const { error: insertError } = await supabase
      .from('tags')
      .insert(missingNames.map(name => ({ name })))

    if (insertError) throw insertError
  }

  const { data: refreshedTags, error: refreshedError } = await supabase
    .from('tags')
    .select('id, name')
    .in('name', names)

  if (refreshedError) throw refreshedError

  return new Map((refreshedTags || []).map(tag => [tag.name, tag.id]))
}

export default function ImportarClientesPage() {
  const supabase = useMemo(() => createClient(), [])
  const [fileName, setFileName] = useState('')
  const [headers, setHeaders] = useState<string[]>([])
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([])
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')
  const [summary, setSummary] = useState<ImportSummary | null>(null)
  const [duplicateStrategy, setDuplicateStrategy] = useState<DuplicateStrategy>('update')
  const [progress, setProgress] = useState('')

  const totals = previewRows.reduce(
    (accumulator, row) => {
      accumulator.total += 1
      accumulator[row.status] += 1
      return accumulator
    },
    { total: 0, novo: 0, duplicado: 0, invalido: 0 }
  )

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]

    if (!file) return

    setLoadingPreview(true)
    setImporting(false)
    setError('')
    setSummary(null)
    setProgress('')
    setPreviewRows([])
    setFileName(file.name)

    try {
      const rows = await parseFile(file)

      if (rows.length === 0) {
        throw new Error('O arquivo esta vazio ou nao possui linhas com dados.')
      }

      setHeaders(Object.keys(rows[0] || {}))

      const basePreview = buildCustomerPreviewRows(rows)
      const existingCustomers = await fetchExistingCustomers(supabase, basePreview)

      const existingByPhone = new Map(existingCustomers.map(customer => [customer.phone_normalized, customer]))
      const existingByEmail = new Map(
        existingCustomers
          .filter(customer => customer.email)
          .map(customer => [customer.email as string, customer])
      )
      const seenPhones = new Set<string>()

      const enrichedPreview = basePreview.map<PreviewRow>(row => {
        const errors = [...row.errors]
        const phone = row.payload?.phone_normalized

        if (phone) {
          if (seenPhones.has(phone)) {
            errors.push('Telefone duplicado dentro do arquivo.')
          } else {
            seenPhones.add(phone)
          }
        }

        const duplicate =
          (phone ? existingByPhone.get(phone) : undefined) ||
          (row.payload?.email ? existingByEmail.get(row.payload.email) : undefined)

        const status: PreviewStatus =
          errors.length > 0 || !row.payload
            ? 'invalido'
            : duplicate
              ? 'duplicado'
              : 'novo'

        return {
          ...row,
          errors,
          status,
          duplicateId: duplicate?.id,
          duplicateName: duplicate?.name,
        }
      })

      setPreviewRows(enrichedPreview)
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Falha ao gerar preview.')
    } finally {
      setLoadingPreview(false)
      event.target.value = ''
    }
  }

  async function handleImport() {
    if (previewRows.length === 0) return

    setImporting(true)
    setError('')
    setSummary(null)

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      const rowsToProcess = previewRows.filter(row => {
        if (!row.payload || row.status === 'invalido') return false
        if (row.status === 'duplicado' && duplicateStrategy === 'skip') return false
        return true
      })

      const tagMap = await ensureTags(
        supabase,
        rowsToProcess.flatMap(row => row.tags)
      )

      const result: ImportSummary = {
        created: 0,
        updated: 0,
        skipped: previewRows.filter(row => row.status === 'invalido').length,
        failed: 0,
        messages: [],
      }

      if (duplicateStrategy === 'skip') {
        result.skipped += previewRows.filter(row => row.status === 'duplicado').length
      }

      for (const [index, row] of rowsToProcess.entries()) {
        if (!row.payload) continue

        setProgress(`Importando ${index + 1} de ${rowsToProcess.length}...`)

        try {
          let customerId = row.duplicateId

          if (row.status === 'duplicado' && row.duplicateId) {
            const { data, error: updateError } = await supabase
              .from('customers')
              .update(row.payload)
              .eq('id', row.duplicateId)
              .select('id')
              .single()

            if (updateError) throw updateError

            customerId = data.id
            result.updated += 1
          } else {
            const { data, error: insertError } = await supabase
              .from('customers')
              .insert({
                ...row.payload,
                created_by: user?.id,
              })
              .select('id')
              .single()

            if (insertError) throw insertError

            customerId = data.id
            result.created += 1
          }

          const tagIds = row.tags
            .map(tagName => tagMap.get(tagName))
            .filter((tagId): tagId is string => Boolean(tagId))

          if (customerId && tagIds.length > 0) {
            const { error: tagError } = await supabase
              .from('customer_tags')
              .upsert(
                tagIds.map(tagId => ({
                  customer_id: customerId,
                  tag_id: tagId,
                })),
                {
                  onConflict: 'customer_id,tag_id',
                  ignoreDuplicates: true,
                }
              )

            if (tagError) throw tagError
          }
        } catch (rowError) {
          result.failed += 1
          result.messages.push(
            `Linha ${row.rowNumber}: ${rowError instanceof Error ? rowError.message : 'Falha inesperada.'}`
          )
        }
      }

      setSummary(result)
      setProgress('')
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Falha ao importar clientes.')
      setProgress('')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div className="flex items-center gap-3">
          <Link href="/clientes" className="btn-ghost btn-sm p-2">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="page-title">Importar Clientes</h1>
            <p className="page-subtitle">Preview e importacao real via CSV, XLSX ou XLS</p>
          </div>
        </div>

        <label className="btn-primary cursor-pointer">
          <Upload size={15} />
          Selecionar arquivo
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            className="sr-only"
            onChange={handleFileChange}
          />
        </label>
      </div>

      <div className="page-content">
        <div className="grid lg:grid-cols-3 gap-4 mb-6">
          <div className="metric-card">
            <p className="metric-value">{totals.total}</p>
            <p className="metric-label">Linhas no preview</p>
          </div>
          <div className="metric-card">
            <p className="metric-value" style={{ color: '#4ade80' }}>{totals.novo}</p>
            <p className="metric-label">Novos clientes</p>
          </div>
          <div className="metric-card">
            <p className="metric-value" style={{ color: '#fbbf24' }}>{totals.duplicado}</p>
            <p className="metric-label">Duplicados detectados</p>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 flex flex-col gap-4">
            <div className="card p-6">
              <div className="flex items-center gap-2 mb-4">
                <FileSpreadsheet size={18} style={{ color: 'var(--brand-red)' }} />
                <h2 className="font-semibold text-white">Arquivo e preview</h2>
              </div>

              <div className="flex flex-col gap-3">
                <div className="p-4 rounded-lg border"
                  style={{ borderColor: 'var(--border-color)', background: 'rgba(255,255,255,0.03)' }}>
                  <p className="text-sm text-white font-medium">
                    {fileName || 'Nenhum arquivo selecionado'}
                  </p>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                    Colunas reconhecidas automaticamente: nome, telefone, email, cidade, bairro, origem, interesse, status, tags e observacoes.
                  </p>
                </div>

                {headers.length > 0 && (
                  <div>
                    <p className="text-xs uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
                      Cabecalhos detectados
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {headers.map(header => (
                        <span key={header} className="badge badge-gray">{header}</span>
                      ))}
                    </div>
                  </div>
                )}

                {loadingPreview && (
                  <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                    <Loader2 size={16} className="animate-spin" />
                    Gerando preview do arquivo...
                  </div>
                )}

                {!loadingPreview && previewRows.length > 0 && (
                  <div className="table-container">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Linha</th>
                          <th>Cliente</th>
                          <th>Telefone</th>
                          <th>Tags</th>
                          <th>Status</th>
                          <th>Detalhes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.map(row => (
                          <tr key={`${row.rowNumber}-${row.displayPhone}`}>
                            <td>
                              <span className="text-sm">#{row.rowNumber}</span>
                            </td>
                            <td>
                              <div>
                                <p className="text-sm font-medium text-white">{row.displayName}</p>
                                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{row.displayEmail}</p>
                              </div>
                            </td>
                            <td>
                              <span className="text-sm">
                                {row.payload ? formatPhone(row.payload.phone_normalized) : row.displayPhone}
                              </span>
                            </td>
                            <td>
                              <div className="flex flex-wrap gap-1">
                                {row.tags.length > 0 ? (
                                  row.tags.slice(0, 3).map(tag => (
                                    <span key={tag} className="badge badge-gray">{tag}</span>
                                  ))
                                ) : (
                                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Sem tags</span>
                                )}
                              </div>
                            </td>
                            <td>
                              <span className={`badge ${
                                row.status === 'novo'
                                  ? 'badge-green'
                                  : row.status === 'duplicado'
                                    ? 'badge-yellow'
                                    : 'badge-red'
                              }`}>
                                {row.status}
                              </span>
                            </td>
                            <td>
                              {row.errors.length > 0 ? (
                                <span className="text-xs text-red-400">{row.errors.join(' ')}</span>
                              ) : row.status === 'duplicado' ? (
                                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                  Ja existe: {row.duplicateName}
                                </span>
                              ) : (
                                <span className="text-xs text-green-400">Pronto para importar</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="card p-6">
              <h2 className="font-semibold text-white mb-4">Configuracao</h2>

              <div className="form-group mb-4">
                <label className="label">Quando encontrar duplicados</label>
                <select
                  className="select"
                  value={duplicateStrategy}
                  onChange={event => setDuplicateStrategy(event.target.value as DuplicateStrategy)}
                >
                  <option value="update">Atualizar cliente existente</option>
                  <option value="skip">Pular duplicados</option>
                </select>
              </div>

              <button
                type="button"
                className="btn-primary w-full"
                disabled={previewRows.length === 0 || importing || loadingPreview}
                onClick={handleImport}
              >
                {importing ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={16} />}
                Importar agora
              </button>

              {progress && (
                <p className="text-xs mt-3" style={{ color: 'var(--text-muted)' }}>
                  {progress}
                </p>
              )}
            </div>

            {error && (
              <div className="card p-4 border"
                style={{ borderColor: 'rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.08)' }}>
                <div className="flex items-start gap-2 text-sm" style={{ color: '#fca5a5' }}>
                  <AlertCircle size={16} className="mt-0.5" />
                  <span>{error}</span>
                </div>
              </div>
            )}

            {summary && (
              <div className="card p-6">
                <div className="flex items-center gap-2 mb-4">
                  <CheckCircle2 size={18} style={{ color: '#4ade80' }} />
                  <h2 className="font-semibold text-white">Resultado da importacao</h2>
                </div>

                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Criados</span>
                    <span className="text-sm text-white font-medium">{summary.created}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Atualizados</span>
                    <span className="text-sm text-white font-medium">{summary.updated}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Pulados</span>
                    <span className="text-sm text-white font-medium">{summary.skipped}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Falhas</span>
                    <span className="text-sm text-white font-medium">{summary.failed}</span>
                  </div>
                </div>

                {summary.messages.length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
                      Erros
                    </p>
                    <div className="flex flex-col gap-2">
                      {summary.messages.slice(0, 8).map(message => (
                        <p key={message} className="text-xs text-red-400">{message}</p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="card p-6">
              <h2 className="font-semibold text-white mb-4">Formato esperado</h2>
              <div className="flex flex-col gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                <p>Campos obrigatorios: nome e telefone.</p>
                <p>Tags podem vir separadas por virgula, ponto e virgula ou barra vertical.</p>
                <p>O preview marca linhas invalidas antes de gravar no Supabase.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
