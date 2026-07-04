import { createClient } from '@/lib/supabase/server'
import type { Metadata } from 'next'
import KanbanBoard from './KanbanBoard'

export const metadata: Metadata = { title: 'CRM — Funil de Vendas' }

export default async function CRMPage() {
  const supabase = await createClient()

  const { data: opportunities } = await supabase
    .from('opportunities')
    .select(`
      *,
      customer:customers(name, phone_normalized),
      vendor:profiles!vendor_id(full_name)
    `)
    .order('created_at', { ascending: false })

  return (
    <div className="animate-fade-in h-full flex flex-col">
      <div className="page-header">
        <div>
          <h1 className="page-title">CRM — Funil de Vendas</h1>
          <p className="page-subtitle">{opportunities?.length || 0} oportunidades em acompanhamento</p>
        </div>
        <a href="/crm/nova" className="btn-primary">
          + Nova Oportunidade
        </a>
      </div>
      <div className="flex-1 overflow-hidden">
        <KanbanBoard opportunities={opportunities || []} />
      </div>
    </div>
  )
}
