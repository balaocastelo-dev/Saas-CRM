import { createClient } from '@/lib/supabase/server'
import { Download, Phone, Plus, Search, Upload } from 'lucide-react'
import Link from 'next/link'
import type { Metadata } from 'next'
import { formatPhone } from '@/lib/utils'

export const metadata: Metadata = { title: 'Clientes' }

type CustomerTagItem = {
  tag?: Array<{
    name?: string | null
    color?: string | null
  }> | null
}

type CustomerTagValue = {
  name?: string | null
  color?: string | null
}

type CustomerListItem = {
  id: string
  name: string
  phone_normalized: string
  email: string | null
  city: string | null
  status: string
  accepted_marketing: boolean
  created_at: string
  customer_tags?: CustomerTagItem[]
}

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; tag?: string; page?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()

  const page = parseInt(params.page || '1')
  const pageSize = 20
  const offset = (page - 1) * pageSize

  let query = supabase
    .from('customers')
    .select(`
      id, name, phone_normalized, email, city, status, accepted_marketing,
      created_at, last_contact,
      assigned_vendor:profiles!assigned_vendor_id(full_name),
      customer_tags(tag:tags(name, color))
    `, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + pageSize - 1)

  if (params.q) {
    query = query.or(`name.ilike.%${params.q}%,phone_normalized.ilike.%${params.q}%,email.ilike.%${params.q}%`)
  }

  if (params.status) {
    query = query.eq('status', params.status)
  }

  const { data: customers, count } = await query

  const totalPages = Math.ceil((count || 0) / pageSize)

  const statusColors: Record<string, string> = {
    ativo: 'badge-green',
    inativo: 'badge-gray',
    bloqueado: 'badge-red',
    'opt-out': 'badge-yellow',
  }

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Clientes</h1>
          <p className="page-subtitle">{count?.toLocaleString('pt-BR') || 0} clientes cadastrados</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/clientes/extracao" className="btn-secondary">
            <Download size={15} />
            Extração de Contatos
          </Link>
          <Link href="/clientes/importar" className="btn-secondary">
            <Upload size={15} />
            Importar CSV/Excel
          </Link>
          <Link href="/clientes/novo" className="btn-primary">
            <Plus size={15} />
            Novo Cliente
          </Link>
        </div>
      </div>

      <div className="page-content">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <form className="relative flex-1 min-w-48 max-w-sm">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2"
              style={{ color: 'var(--text-muted)' }} />
            <input
              name="q"
              type="search"
              defaultValue={params.q}
              className="search-input w-full"
              placeholder="Buscar por nome, telefone ou e-mail..." />
          </form>

          <select name="status" defaultValue={params.status}
            className="select" style={{ width: 'auto' }}>
            <option value="">Todos os status</option>
            <option value="ativo">Ativo</option>
            <option value="inativo">Inativo</option>
            <option value="bloqueado">Bloqueado</option>
            <option value="opt-out">Opt-out</option>
          </select>
        </div>

        {/* Table */}
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Telefone</th>
                <th>Cidade</th>
                <th>Tags</th>
                <th>Marketing</th>
                <th>Status</th>
                <th>Cadastro</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {customers && customers.length > 0 ? (customers as CustomerListItem[]).map((customer) => {
                const tagItems: CustomerTagValue[] = (customer.customer_tags || []).flatMap(item => item.tag || [])

                return (
                <tr key={customer.id}>
                  <td>
                    <div className="flex items-center gap-3">
                      <div className="avatar w-8 h-8 text-xs">
                        {customer.name?.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-white">{customer.name}</p>
                        {customer.email && (
                          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{customer.email}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="flex items-center gap-1.5">
                      <Phone size={13} style={{ color: 'var(--text-muted)' }} />
                      <span className="text-sm">{formatPhone(customer.phone_normalized)}</span>
                    </div>
                  </td>
                  <td>
                    <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                      {customer.city || '—'}
                    </span>
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {tagItems.slice(0, 2).map((ct) => (
                        <span key={`${customer.id}-${ct.name || 'tag'}`}
                          className="badge text-xs"
                          style={{
                            background: `${ct.color || '#6b7280'}20`,
                            color: ct.color || undefined,
                            border: `1px solid ${(ct.color || '#6b7280')}30`
                          }}>
                          {ct.name}
                        </span>
                      ))}
                      {tagItems.length > 2 && (
                        <span className="badge badge-gray">+{tagItems.length - 2}</span>
                      )}
                    </div>
                  </td>
                  <td>
                    <span className={`badge ${customer.accepted_marketing ? 'badge-green' : 'badge-gray'}`}>
                      {customer.accepted_marketing ? '✓ Sim' : '✗ Não'}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${statusColors[customer.status] || 'badge-gray'}`}>
                      {customer.status}
                    </span>
                  </td>
                  <td>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {new Date(customer.created_at).toLocaleDateString('pt-BR')}
                    </span>
                  </td>
                  <td>
                    <Link href={`/clientes/${customer.id}`} className="btn-ghost btn-sm">
                      Ver
                    </Link>
                  </td>
                </tr>
                )
              }) : (
                <tr>
                  <td colSpan={8}>
                    <div className="text-center py-12">
                      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                        {params.q ? 'Nenhum cliente encontrado com essa busca.' : 'Nenhum cliente cadastrado.'}
                      </p>
                      <Link href="/clientes/novo" className="btn-primary mt-3 inline-flex">
                        <Plus size={15} /> Adicionar cliente
                      </Link>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Página {page} de {totalPages}
            </p>
            <div className="flex gap-2">
              {page > 1 && (
                <Link href={`?page=${page - 1}${params.q ? `&q=${params.q}` : ''}`}
                  className="btn-secondary btn-sm">Anterior</Link>
              )}
              {page < totalPages && (
                <Link href={`?page=${page + 1}${params.q ? `&q=${params.q}` : ''}`}
                  className="btn-secondary btn-sm">Próxima</Link>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
