import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import ContactExtractionClient from './ContactExtractionClient'
import type { ExportableContact } from '@/lib/contact-exports'

export const metadata: Metadata = { title: 'Extração de Contatos' }

type CustomerTagRelation = {
  tag?: {
    name?: string | null
  } | null
}

type CustomerExtractionRow = {
  id: string
  name: string | null
  phone_normalized: string | null
  email: string | null
  city: string | null
  neighborhood: string | null
  status: string | null
  accepted_marketing: boolean | null
  contact_origin: string | null
  main_interest: string | null
  notes: string | null
  created_at: string | null
  last_contact: string | null
  customer_tags?: CustomerTagRelation[]
}

export default async function ClientesExtracaoPage() {
  const supabase = await createClient()

  const { data: customers, error } = await supabase
    .from('customers')
    .select(`
      id,
      name,
      phone_normalized,
      email,
      city,
      neighborhood,
      status,
      accepted_marketing,
      contact_origin,
      main_interest,
      notes,
      created_at,
      last_contact,
      customer_tags(tag:tags(name))
    `)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  const contacts: ExportableContact[] = ((customers || []) as CustomerExtractionRow[]).map(customer => ({
    id: customer.id,
    name: customer.name || 'Sem nome',
    phone: customer.phone_normalized || '',
    email: customer.email,
    city: customer.city,
    neighborhood: customer.neighborhood,
    status: customer.status,
    acceptedMarketing: Boolean(customer.accepted_marketing),
    contactOrigin: customer.contact_origin,
    mainInterest: customer.main_interest,
    notes: customer.notes,
    createdAt: customer.created_at,
    lastContact: customer.last_contact,
    tags: (customer.customer_tags || [])
      .map((item: CustomerTagRelation) => item.tag?.name)
      .filter((value: string | null | undefined): value is string => Boolean(value)),
  }))

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Link href="/clientes" className="btn-ghost btn-sm">
              <ArrowLeft size={15} />
              Voltar
            </Link>
          </div>
          <h1 className="page-title">Extração de Contatos</h1>
          <p className="page-subtitle">
            Exporte a base atual do CRM em CSV, JSON, VCF, XLS ou XLSX e gere PDF a partir da visualização filtrada.
          </p>
        </div>
      </div>

      <ContactExtractionClient initialContacts={contacts} />
    </div>
  )
}
