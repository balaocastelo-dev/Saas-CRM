'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, Save, Wrench } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  SERVICE_ORDER_STATUS_LABELS,
  formatCurrency,
  formatPhone,
} from '@/lib/utils'

interface CustomerOption {
  id: string
  name: string
  phone_normalized: string | null
  city: string | null
}

interface TechnicianOption {
  id: string
  full_name: string
}

interface OrderRecord {
  id: string
  customer_id: string | null
  technician_id: string | null
  equipment: string
  brand: string | null
  model: string | null
  reported_issue: string
  diagnosis: string | null
  service_performed: string | null
  parts_used: string[] | null
  total_value: number
  status: string
  deadline: string | null
  notes: string | null
  photos: string[] | null
  whatsapp_notifications: boolean
  order_number?: number | null
}

interface OrderFormProps {
  customers: CustomerOption[]
  technicians: TechnicianOption[]
  order?: OrderRecord
}

const STATUS_OPTIONS = Object.entries(SERVICE_ORDER_STATUS_LABELS)

function normalizeDecimalInput(value: string) {
  return value.replace(/\./g, '').replace(',', '.').trim()
}

export default function OrderForm({
  customers,
  technicians,
  order,
}: OrderFormProps) {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [form, setForm] = useState({
    customerId: order?.customer_id || '',
    technicianId: order?.technician_id || '',
    equipment: order?.equipment || '',
    brand: order?.brand || '',
    model: order?.model || '',
    reportedIssue: order?.reported_issue || '',
    diagnosis: order?.diagnosis || '',
    servicePerformed: order?.service_performed || '',
    partsUsed: Array.isArray(order?.parts_used) ? order?.parts_used.join('\n') : '',
    totalValue:
      order?.total_value !== null && order?.total_value !== undefined
        ? String(order.total_value)
        : '',
    status: order?.status || 'recebido',
    deadline: order?.deadline || '',
    notes: order?.notes || '',
    photos: Array.isArray(order?.photos) ? order?.photos.join('\n') : '',
    whatsappNotifications: order?.whatsapp_notifications ?? true,
  })

  const selectedCustomer = useMemo(
    () => customers.find(customer => customer.id === form.customerId) || null,
    [customers, form.customerId]
  )
  const selectedTechnician = useMemo(
    () => technicians.find(technician => technician.id === form.technicianId) || null,
    [form.technicianId, technicians]
  )

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')

    if (!form.equipment.trim()) {
      setError('Informe o equipamento.')
      setLoading(false)
      return
    }

    if (!form.reportedIssue.trim()) {
      setError('Descreva o defeito relatado.')
      setLoading(false)
      return
    }

    const normalizedValue = normalizeDecimalInput(form.totalValue)
    const totalValue = normalizedValue ? Number(normalizedValue) : 0

    if (normalizedValue && Number.isNaN(totalValue)) {
      setError('Informe um valor total válido.')
      setLoading(false)
      return
    }

    const payload = {
      customer_id: form.customerId || null,
      technician_id: form.technicianId || null,
      equipment: form.equipment.trim(),
      brand: form.brand.trim() || null,
      model: form.model.trim() || null,
      reported_issue: form.reportedIssue.trim(),
      diagnosis: form.diagnosis.trim() || null,
      service_performed: form.servicePerformed.trim() || null,
      parts_used: form.partsUsed
        .split('\n')
        .map(item => item.trim())
        .filter(Boolean),
      total_value: totalValue,
      status: form.status,
      deadline: form.deadline || null,
      notes: form.notes.trim() || null,
      photos: form.photos
        .split('\n')
        .map(item => item.trim())
        .filter(Boolean),
      whatsapp_notifications: form.whatsappNotifications,
    }

    try {
      if (order?.id) {
        const { error: updateError } = await supabase
          .from('service_orders')
          .update(payload)
          .eq('id', order.id)

        if (updateError) throw updateError

        setSuccess('Ordem de serviço atualizada com sucesso.')
        router.refresh()
      } else {
        const { data: createdOrder, error: insertError } = await supabase
          .from('service_orders')
          .insert(payload)
          .select('id')
          .single()

        if (insertError || !createdOrder) {
          throw insertError || new Error('Não foi possível criar a ordem de serviço.')
        }

        router.push(`/ordens/${createdOrder.id}`)
        router.refresh()
      }
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Erro ao salvar ordem de serviço.'
      )
      setLoading(false)
      return
    }

    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit} className="w-full" style={{ maxWidth: '1120px' }}>
      <div className="mb-4 flex items-center gap-3">
        <Link href="/ordens" className="btn-ghost btn-sm">
          <ArrowLeft size={16} />
          Voltar para ordens
        </Link>
        {order?.order_number && (
          <span className="badge badge-blue">
            OS #{order.order_number}
          </span>
        )}
      </div>

      {error && (
        <div
          className="mb-4 rounded-lg border p-3 text-sm"
          style={{
            background: 'rgba(239,68,68,0.1)',
            borderColor: 'rgba(239,68,68,0.2)',
            color: '#f87171',
          }}
        >
          {error}
        </div>
      )}

      {success && (
        <div
          className="mb-4 rounded-lg border p-3 text-sm"
          style={{
            background: 'rgba(34,197,94,0.1)',
            borderColor: 'rgba(34,197,94,0.2)',
            color: '#86efac',
          }}
        >
          {success}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-4">
          <div className="card p-6">
            <h2 className="mb-4 font-semibold text-white">Cliente e equipamento</h2>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="form-group md:col-span-2">
                <label htmlFor="customerId" className="label">Cliente</label>
                <select
                  id="customerId"
                  className="select"
                  value={form.customerId}
                  onChange={event => setForm(prev => ({ ...prev, customerId: event.target.value }))}
                >
                  <option value="">Selecione um cliente</option>
                  {customers.map(customer => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                      {customer.phone_normalized ? ` - ${formatPhone(customer.phone_normalized)}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="equipment" className="label">Equipamento *</label>
                <input
                  id="equipment"
                  className="input"
                  value={form.equipment}
                  onChange={event => setForm(prev => ({ ...prev, equipment: event.target.value }))}
                  placeholder="Ex.: Notebook, impressora, PC gamer"
                />
              </div>

              <div className="form-group">
                <label htmlFor="technicianId" className="label">Técnico responsável</label>
                <select
                  id="technicianId"
                  className="select"
                  value={form.technicianId}
                  onChange={event => setForm(prev => ({ ...prev, technicianId: event.target.value }))}
                >
                  <option value="">Não atribuído</option>
                  {technicians.map(technician => (
                    <option key={technician.id} value={technician.id}>
                      {technician.full_name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="brand" className="label">Marca</label>
                <input
                  id="brand"
                  className="input"
                  value={form.brand}
                  onChange={event => setForm(prev => ({ ...prev, brand: event.target.value }))}
                  placeholder="Dell, HP, Lenovo..."
                />
              </div>

              <div className="form-group">
                <label htmlFor="model" className="label">Modelo</label>
                <input
                  id="model"
                  className="input"
                  value={form.model}
                  onChange={event => setForm(prev => ({ ...prev, model: event.target.value }))}
                  placeholder="Inspiron 15, LaserJet..."
                />
              </div>

              <div className="form-group md:col-span-2">
                <label htmlFor="reportedIssue" className="label">Defeito relatado *</label>
                <textarea
                  id="reportedIssue"
                  className="input"
                  rows={4}
                  value={form.reportedIssue}
                  onChange={event => setForm(prev => ({ ...prev, reportedIssue: event.target.value }))}
                  style={{ resize: 'vertical' }}
                  placeholder="Descreva o sintoma informado pelo cliente..."
                />
              </div>
            </div>
          </div>

          <div className="card p-6">
            <h2 className="mb-4 font-semibold text-white">Diagnóstico e execução</h2>

            <div className="grid gap-4">
              <div className="form-group">
                <label htmlFor="diagnosis" className="label">Diagnóstico</label>
                <textarea
                  id="diagnosis"
                  className="input"
                  rows={4}
                  value={form.diagnosis}
                  onChange={event => setForm(prev => ({ ...prev, diagnosis: event.target.value }))}
                  style={{ resize: 'vertical' }}
                  placeholder="Resultado da análise técnica..."
                />
              </div>

              <div className="form-group">
                <label htmlFor="servicePerformed" className="label">Serviço executado</label>
                <textarea
                  id="servicePerformed"
                  className="input"
                  rows={4}
                  value={form.servicePerformed}
                  onChange={event => setForm(prev => ({ ...prev, servicePerformed: event.target.value }))}
                  style={{ resize: 'vertical' }}
                  placeholder="Troca de componente, formatação, limpeza..."
                />
              </div>

              <div className="form-group">
                <label htmlFor="partsUsed" className="label">Peças utilizadas</label>
                <textarea
                  id="partsUsed"
                  className="input"
                  rows={5}
                  value={form.partsUsed}
                  onChange={event => setForm(prev => ({ ...prev, partsUsed: event.target.value }))}
                  style={{ resize: 'vertical' }}
                  placeholder="Uma peça por linha"
                />
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  O schema atual armazena `parts_used` como array JSON.
                </span>
              </div>
            </div>
          </div>

          <div className="card p-6">
            <h2 className="mb-4 font-semibold text-white">Status e atendimento</h2>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="form-group">
                <label htmlFor="status" className="label">Status</label>
                <select
                  id="status"
                  className="select"
                  value={form.status}
                  onChange={event => setForm(prev => ({ ...prev, status: event.target.value }))}
                >
                  {STATUS_OPTIONS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="deadline" className="label">Prazo</label>
                <input
                  id="deadline"
                  type="date"
                  className="input"
                  value={form.deadline}
                  onChange={event => setForm(prev => ({ ...prev, deadline: event.target.value }))}
                />
              </div>

              <div className="form-group">
                <label htmlFor="totalValue" className="label">Valor total</label>
                <input
                  id="totalValue"
                  className="input"
                  inputMode="decimal"
                  value={form.totalValue}
                  onChange={event => setForm(prev => ({ ...prev, totalValue: event.target.value }))}
                  placeholder="Ex.: 450,00"
                />
              </div>

              <div className="form-group">
                <label className="label">Notificações WhatsApp</label>
                <label className="flex cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={form.whatsappNotifications}
                    onChange={event =>
                      setForm(prev => ({ ...prev, whatsappNotifications: event.target.checked }))
                    }
                  />
                  <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    Avisar cliente sobre atualizações da OS
                  </span>
                </label>
              </div>

              <div className="form-group md:col-span-2">
                <label htmlFor="notes" className="label">Observações internas</label>
                <textarea
                  id="notes"
                  className="input"
                  rows={4}
                  value={form.notes}
                  onChange={event => setForm(prev => ({ ...prev, notes: event.target.value }))}
                  style={{ resize: 'vertical' }}
                  placeholder="Acessórios deixados, termos combinados, pendências..."
                />
              </div>

              <div className="form-group md:col-span-2">
                <label htmlFor="photos" className="label">URLs de fotos</label>
                <textarea
                  id="photos"
                  className="input"
                  rows={4}
                  value={form.photos}
                  onChange={event => setForm(prev => ({ ...prev, photos: event.target.value }))}
                  style={{ resize: 'vertical' }}
                  placeholder="Uma URL por linha"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="card p-6">
            <div className="mb-4 flex items-center gap-2">
              <Wrench size={18} style={{ color: 'var(--brand-red)' }} />
              <h2 className="font-semibold text-white">Resumo</h2>
            </div>

            <div className="flex flex-col gap-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span style={{ color: 'var(--text-secondary)' }}>Cliente</span>
                <span className="text-right text-white">{selectedCustomer?.name || 'Não vinculado'}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span style={{ color: 'var(--text-secondary)' }}>Contato</span>
                <span className="text-right text-white">
                  {selectedCustomer?.phone_normalized ? formatPhone(selectedCustomer.phone_normalized) : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span style={{ color: 'var(--text-secondary)' }}>Técnico</span>
                <span className="text-right text-white">{selectedTechnician?.full_name || 'Não atribuído'}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span style={{ color: 'var(--text-secondary)' }}>Status</span>
                <span className="text-right text-white">
                  {SERVICE_ORDER_STATUS_LABELS[form.status] || form.status}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span style={{ color: 'var(--text-secondary)' }}>Valor</span>
                <span className="text-right text-white">
                  {formatCurrency(Number(normalizeDecimalInput(form.totalValue) || 0))}
                </span>
              </div>
            </div>
          </div>

          <div className="card p-6">
            <h2 className="mb-2 font-semibold text-white">Ação</h2>
            <p className="mb-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
              Salva diretamente na tabela `service_orders`.
            </p>
            <div className="flex flex-col gap-3">
              <Link href="/ordens" className="btn-secondary w-full justify-center">
                Cancelar
              </Link>
              <button type="submit" className="btn-primary w-full justify-center" disabled={loading}>
                {loading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                {order?.id ? 'Salvar alterações' : 'Criar OS'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </form>
  )
}
