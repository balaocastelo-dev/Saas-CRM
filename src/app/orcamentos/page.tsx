import { createClient } from '@/lib/supabase/server'
import { Plus, FileText, CheckCircle, Clock, XCircle } from 'lucide-react'
import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Orçamentos' }

const statusBadge: Record<string, string> = {
  rascunho: 'badge-gray',
  enviado: 'badge-blue',
  aprovado: 'badge-green',
  rejeitado: 'badge-red',
  expirado: 'badge-yellow',
}

export default async function OrcamentosPage() {
  const supabase = await createClient()
  const { data: quotes } = await supabase
    .from('quotes')
    .select(`*, customer:customers(name), vendor:profiles!vendor_id(full_name)`)
    .order('created_at', { ascending: false })

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Orçamentos</h1>
          <p className="page-subtitle">Crie e gerencie orçamentos para seus clientes</p>
        </div>
        <Link href="/orcamentos/novo" className="btn-primary">
          <Plus size={15} /> Novo Orçamento
        </Link>
      </div>

      <div className="page-content">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Total', value: quotes?.length || 0, color: '#3b82f6' },
            { label: 'Pendentes', value: quotes?.filter(q => q.status === 'enviado').length || 0, color: '#f59e0b' },
            { label: 'Aprovados', value: quotes?.filter(q => q.status === 'aprovado').length || 0, color: '#22c55e' },
            { label: 'Valor total', value: `R$ ${(quotes?.filter(q=>q.status==='aprovado').reduce((s,q)=>s+(q.total||0),0)||0).toFixed(0)}`, color: '#DC2626' },
          ].map(stat => (
            <div key={stat.label} className="metric-card">
              <p className="metric-value" style={{ color: stat.color }}>{stat.value}</p>
              <p className="metric-label">{stat.label}</p>
            </div>
          ))}
        </div>

        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Nº</th>
                <th>Cliente</th>
                <th>Vendedor</th>
                <th>Status</th>
                <th>Validade</th>
                <th>Total</th>
                <th>WhatsApp</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {quotes && quotes.length > 0 ? quotes.map((quote: any) => (
                <tr key={quote.id}>
                  <td>
                    <span className="font-mono text-sm font-bold" style={{ color: 'var(--brand-red)' }}>
                      #{quote.quote_number}
                    </span>
                  </td>
                  <td><span className="text-sm font-medium">{quote.customer?.name || '—'}</span></td>
                  <td><span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{quote.vendor?.full_name || '—'}</span></td>
                  <td><span className={`badge ${statusBadge[quote.status] || 'badge-gray'}`}>{quote.status}</span></td>
                  <td>
                    <span className="text-sm">
                      {quote.valid_until ? new Date(quote.valid_until).toLocaleDateString('pt-BR') : '—'}
                    </span>
                  </td>
                  <td>
                    <span className="text-sm font-semibold text-white">
                      R$ {(quote.total || 0).toFixed(2)}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${quote.sent_via_whatsapp ? 'badge-green' : 'badge-gray'}`}>
                      {quote.sent_via_whatsapp ? 'Enviado' : 'Não enviado'}
                    </span>
                  </td>
                  <td>
                    <Link href={`/orcamentos/${quote.id}`} className="btn-ghost btn-sm">Ver</Link>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={8}>
                    <div className="text-center py-12">
                      <FileText size={32} className="mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
                      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Nenhum orçamento criado</p>
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
