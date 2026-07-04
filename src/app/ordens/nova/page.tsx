import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import OrderForm from '../OrderForm'

export const metadata: Metadata = { title: 'Nova OS' }

export default async function NovaOrdemPage() {
  const supabase = await createClient()

  const [{ data: customers, error: customersError }, { data: technicians, error: techniciansError }] = await Promise.all([
    supabase
      .from('customers')
      .select('id, name, phone_normalized, city')
      .order('name', { ascending: true }),
    supabase
      .from('profiles')
      .select('id, full_name, user_role')
      .eq('is_active', true)
      .in('user_role', ['admin', 'tecnico'])
      .order('full_name', { ascending: true }),
  ])

  if (customersError) throw new Error(customersError.message)
  if (techniciansError) throw new Error(techniciansError.message)

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Nova Ordem de Serviço</h1>
          <p className="page-subtitle">Registre uma OS alinhada ao cadastro atual de clientes e técnicos</p>
        </div>
      </div>

      <div className="page-content">
        <OrderForm
          customers={customers || []}
          technicians={(technicians || []).map(technician => ({
            id: technician.id,
            full_name: technician.full_name || technician.user_role || 'Sem nome',
          }))}
        />
      </div>
    </div>
  )
}
