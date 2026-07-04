import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import NovaOportunidadeForm from './NovaOportunidadeForm'

export const metadata: Metadata = { title: 'Nova Oportunidade' }

const STAGES = [
  'novo_lead',
  'em_atendimento',
  'orcamento_enviado',
  'negociacao',
  'aguardando_pagamento',
  'venda_concluida',
  'perdido',
] as const

type SearchParams = Promise<{
  stage?: string
  customerId?: string
}>

export default async function NovaOportunidadePage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const params = await searchParams
  const supabase = await createClient()

  const [
    { data: customers },
    { data: vendors },
    {
      data: { user },
    },
  ] = await Promise.all([
    supabase
      .from('customers')
      .select('id, name, phone_normalized, main_interest')
      .order('name', { ascending: true }),
    supabase
      .from('profiles')
      .select('id, full_name, user_role')
      .eq('is_active', true)
      .in('user_role', ['admin', 'vendedor'])
      .order('full_name', { ascending: true }),
    supabase.auth.getUser(),
  ])

  const initialStage = STAGES.includes((params.stage as (typeof STAGES)[number]) || 'novo_lead')
    ? ((params.stage as (typeof STAGES)[number]) || 'novo_lead')
    : 'novo_lead'
  const defaultVendorId = (vendors || []).some(vendor => vendor.id === user?.id) ? user?.id || '' : ''

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Nova Oportunidade</h1>
          <p className="page-subtitle">Cadastre uma nova oportunidade no funil comercial</p>
        </div>
      </div>

      <div className="page-content">
        <NovaOportunidadeForm
          customers={(customers || []).map(customer => ({
            id: customer.id,
            name: customer.name,
            phone_normalized: customer.phone_normalized,
            main_interest: customer.main_interest || '',
          }))}
          vendors={(vendors || []).map(vendor => ({
            id: vendor.id,
            full_name: vendor.full_name || vendor.user_role || 'Sem nome',
          }))}
          currentUserId={defaultVendorId}
          initialCustomerId={params.customerId || ''}
          initialStage={initialStage}
        />
      </div>
    </div>
  )
}
