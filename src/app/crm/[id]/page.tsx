import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import OpportunityDetailsClient from './OpportunityDetailsClient'

export const metadata: Metadata = { title: 'Detalhes da Oportunidade' }

type Params = Promise<{ id: string }>

export default async function OpportunityDetailsPage({
  params,
}: {
  params: Params
}) {
  const { id } = await params
  const supabase = await createClient()

  const [
    { data: opportunity },
    { data: history },
    { data: quotes },
    { data: vendors },
  ] = await Promise.all([
    supabase
      .from('opportunities')
      .select(`
        id,
        title,
        stage,
        product_interest,
        estimated_value,
        next_action,
        next_action_date,
        origin,
        notes,
        lost_reason,
        closed_at,
        created_at,
        updated_at,
        customer_id,
        vendor_id,
        customer:customers(
          id,
          name,
          phone_normalized,
          email,
          city,
          main_interest,
          status
        ),
        vendor:profiles!vendor_id(
          id,
          full_name,
          email
        )
      `)
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('opportunity_history')
      .select(`
        id,
        action,
        old_stage,
        new_stage,
        notes,
        created_at,
        user:profiles!user_id(
          full_name
        )
      `)
      .eq('opportunity_id', id)
      .order('created_at', { ascending: false }),
    supabase
      .from('quotes')
      .select('id, quote_number, status, total, valid_until, created_at')
      .eq('opportunity_id', id)
      .order('created_at', { ascending: false }),
    supabase
      .from('profiles')
      .select('id, full_name, user_role')
      .eq('is_active', true)
      .in('user_role', ['admin', 'vendedor'])
      .order('full_name', { ascending: true }),
  ])

  if (!opportunity) {
    notFound()
  }

  const customer = Array.isArray(opportunity.customer) ? opportunity.customer[0] : opportunity.customer
  const vendor = Array.isArray(opportunity.vendor) ? opportunity.vendor[0] : opportunity.vendor
  const normalizedHistory = (history || []).map((item) => {
    const user = (Array.isArray(item.user) ? item.user[0] : item.user) as { full_name?: string } | null | undefined

    return {
      id: item.id,
      action: item.action,
      old_stage: item.old_stage,
      new_stage: item.new_stage,
      notes: item.notes,
      created_at: item.created_at,
      user_name: user?.full_name || 'Sistema',
    }
  })

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Detalhes da Oportunidade</h1>
          <p className="page-subtitle">Acompanhe e atualize os dados comerciais em tempo real</p>
        </div>
      </div>

      <div className="page-content">
        <OpportunityDetailsClient
          opportunity={{
            id: opportunity.id,
            title: opportunity.title,
            stage: opportunity.stage,
            product_interest: opportunity.product_interest,
            estimated_value: opportunity.estimated_value,
            next_action: opportunity.next_action,
            next_action_date: opportunity.next_action_date,
            origin: opportunity.origin,
            notes: opportunity.notes,
            lost_reason: opportunity.lost_reason,
            closed_at: opportunity.closed_at,
            created_at: opportunity.created_at,
            updated_at: opportunity.updated_at,
            customer_id: opportunity.customer_id,
            vendor_id: opportunity.vendor_id,
            customer: customer
              ? {
                  id: customer.id,
                  name: customer.name,
                  phone_normalized: customer.phone_normalized,
                  email: customer.email,
                  city: customer.city,
                  main_interest: customer.main_interest,
                  status: customer.status,
                }
              : null,
            vendor: vendor
              ? {
                  id: vendor.id,
                  full_name: vendor.full_name,
                  email: vendor.email,
                }
              : null,
          }}
          history={normalizedHistory}
          quotes={(quotes || []).map(quote => ({
            id: quote.id,
            quote_number: quote.quote_number,
            status: quote.status,
            total: quote.total,
            valid_until: quote.valid_until,
            created_at: quote.created_at,
          }))}
          vendors={(vendors || []).map(vendor => ({
            id: vendor.id,
            full_name: vendor.full_name || vendor.user_role || 'Sem nome',
          }))}
        />
      </div>
    </div>
  )
}
