export type RawImportRow = Record<string, unknown>

export type CustomerImportPayload = {
  name: string
  phone: string
  phone_normalized: string
  email: string | null
  cpf_cnpj: string | null
  city: string | null
  neighborhood: string | null
  contact_origin: string | null
  main_interest: string | null
  notes: string | null
  accepted_marketing: boolean
  status: 'ativo' | 'inativo' | 'bloqueado' | 'opt-out'
}

export type CustomerPreviewRow = {
  rowNumber: number
  displayName: string
  displayPhone: string
  displayEmail: string
  headersFound: string[]
  payload: CustomerImportPayload | null
  tags: string[]
  errors: string[]
}

const FIELD_ALIASES: Record<string, string[]> = {
  name: ['name', 'nome', 'cliente', 'razao social', 'razao_social', 'full_name'],
  phone: ['phone', 'telefone', 'celular', 'whatsapp', 'fone', 'telefone_whatsapp'],
  email: ['email', 'e-mail', 'mail'],
  cpf_cnpj: ['cpf', 'cnpj', 'cpf_cnpj', 'documento', 'document'],
  city: ['city', 'cidade', 'municipio', 'município'],
  neighborhood: ['neighborhood', 'bairro', 'district'],
  contact_origin: ['contact_origin', 'origem', 'origem_contato', 'origem do contato'],
  main_interest: ['main_interest', 'interesse', 'interesse_principal', 'interesse principal'],
  notes: ['notes', 'nota', 'notas', 'observacoes', 'observações', 'obs'],
  accepted_marketing: ['accepted_marketing', 'aceita_marketing', 'marketing', 'consentimento_marketing'],
  status: ['status', 'situacao', 'situação'],
  tags: ['tags', 'tag', 'etiquetas', 'marcadores', 'segmentos'],
}

function normalizeHeader(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function normalizeTextValue(value: unknown) {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function getFieldValue(row: RawImportRow, fieldName: keyof typeof FIELD_ALIASES) {
  const aliases = FIELD_ALIASES[fieldName]
  const entries = Object.entries(row)

  for (const [key, value] of entries) {
    if (aliases.includes(normalizeHeader(key))) {
      return { header: key, value: normalizeTextValue(value) }
    }
  }

  return { header: '', value: '' }
}

function normalizePhone(phone: string) {
  const clean = phone.replace(/\D/g, '')

  if (!clean) return ''
  if (clean.startsWith('55') && clean.length >= 12) return clean

  return `55${clean}`
}

function isValidPhone(phone: string) {
  return /^55\d{10,11}$/.test(phone)
}

function normalizeStatus(status: string): CustomerImportPayload['status'] {
  const normalized = normalizeHeader(status)

  if (!normalized || normalized === 'ativo' || normalized === 'active') return 'ativo'
  if (normalized === 'inativo' || normalized === 'inactive') return 'inativo'
  if (normalized === 'bloqueado' || normalized === 'blocked') return 'bloqueado'
  if (normalized === 'opt out' || normalized === 'optout') return 'opt-out'

  return 'ativo'
}

function normalizeBoolean(value: string) {
  const normalized = normalizeHeader(value)

  if (!normalized) return false

  return ['1', 'sim', 'yes', 'true', 'aceito', 'aceita', 'ok'].includes(normalized)
}

function normalizeNullable(value: string) {
  const normalized = value.trim()
  return normalized ? normalized : null
}

function splitTags(value: string) {
  if (!value.trim()) return []

  return value
    .split(/[;,|]/)
    .map(tag => tag.trim())
    .filter(Boolean)
}

export function buildCustomerPreviewRows(rows: RawImportRow[]) {
  return rows.map<CustomerPreviewRow>((row, index) => {
    const nameField = getFieldValue(row, 'name')
    const phoneField = getFieldValue(row, 'phone')
    const emailField = getFieldValue(row, 'email')
    const cpfField = getFieldValue(row, 'cpf_cnpj')
    const cityField = getFieldValue(row, 'city')
    const neighborhoodField = getFieldValue(row, 'neighborhood')
    const originField = getFieldValue(row, 'contact_origin')
    const interestField = getFieldValue(row, 'main_interest')
    const notesField = getFieldValue(row, 'notes')
    const marketingField = getFieldValue(row, 'accepted_marketing')
    const statusField = getFieldValue(row, 'status')
    const tagsField = getFieldValue(row, 'tags')

    const errors: string[] = []
    const name = nameField.value.trim()
    const phone = phoneField.value.trim()
    const phoneNormalized = normalizePhone(phone)
    const email = emailField.value.trim().toLowerCase()

    if (!name) errors.push('Nome obrigatorio.')
    if (!phone) errors.push('Telefone obrigatorio.')
    if (phone && !isValidPhone(phoneNormalized)) {
      errors.push('Telefone invalido. Use DDD + numero.')
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push('E-mail invalido.')
    }

    const payload: CustomerImportPayload | null = errors.length > 0
      ? null
      : {
          name,
          phone: phone.replace(/\D/g, ''),
          phone_normalized: phoneNormalized,
          email: normalizeNullable(email),
          cpf_cnpj: normalizeNullable(cpfField.value),
          city: normalizeNullable(cityField.value),
          neighborhood: normalizeNullable(neighborhoodField.value),
          contact_origin: normalizeNullable(originField.value),
          main_interest: normalizeNullable(interestField.value),
          notes: normalizeNullable(notesField.value),
          accepted_marketing: normalizeBoolean(marketingField.value),
          status: normalizeStatus(statusField.value),
        }

    const headersFound = [
      nameField.header,
      phoneField.header,
      emailField.header,
      cpfField.header,
      cityField.header,
      neighborhoodField.header,
      originField.header,
      interestField.header,
      notesField.header,
      marketingField.header,
      statusField.header,
      tagsField.header,
    ].filter(Boolean)

    return {
      rowNumber: index + 2,
      displayName: name || '(sem nome)',
      displayPhone: phone || '-',
      displayEmail: email || '-',
      headersFound,
      payload,
      tags: splitTags(tagsField.value),
      errors,
    }
  })
}
