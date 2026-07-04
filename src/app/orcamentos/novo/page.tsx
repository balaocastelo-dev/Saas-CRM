import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import QuoteForm from '../QuoteForm'

export const metadata: Metadata = { title: 'Novo Orçamento' }

export default async function NovoOrcamentoPage() {
  const supabase = await createClient()

  const [
    { data: customers, error: customersError },
    { data: opportunities, error: opportunitiesError },
    { data: vendors, error: vendorsError },
    { data: products, error: productsError },
    {
      data: { user },
      error: userError,
    },
  ] = await Promise.all([
    supabase
      .from('customers')
      .select('id, name, phone_normalized')
      .order('name', { ascending: true }),
    supabase
      .from('opportunities')
      .select('id, customer_id, title, stage, estimated_value')
      .order('created_at', { ascending: false }),
    supabase
      .from('profiles')
      .select('id, full_name, user_role')
      .eq('is_active', true)
      .in('user_role', ['admin', 'vendedor'])
      .order('full_name', { ascending: true }),
    supabase
      .from('products')
      .select('id, name, sale_price, stock_quantity, status')
      .order('name', { ascending: true }),
    supabase.auth.getUser(),
  ])

  if (customersError) throw new Error(customersError.message)
  if (opportunitiesError) throw new Error(opportunitiesError.message)
  if (vendorsError) throw new Error(vendorsError.message)
  if (productsError) throw new Error(productsError.message)
  if (userError) throw new Error(userError.message)

  const defaultVendorId = (vendors || []).some(vendor => vendor.id === user?.id) ? user?.id || '' : ''

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Novo Orçamento</h1>
          <p className="page-subtitle">Monte itens, vínculos comerciais e condições com base no schema atual</p>
        </div>
      </div>

      <div className="page-content">
        <QuoteForm
          customers={customers || []}
          opportunities={opportunities || []}
          vendors={(vendors || []).map(vendor => ({
            id: vendor.id,
            full_name: vendor.full_name || vendor.user_role || 'Sem nome',
          }))}
          products={products || []}
          currentUserId={defaultVendorId}
        />
      </div>
    </div>
  )
}
