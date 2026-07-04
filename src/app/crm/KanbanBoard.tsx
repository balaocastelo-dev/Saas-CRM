'use client'

import { useState } from 'react'
import Link from 'next/link'
import { formatCurrency, STAGE_LABELS } from '@/lib/utils'
import { User, DollarSign } from 'lucide-react'

const STAGES = [
  { key: 'novo_lead', color: '#3b82f6' },
  { key: 'em_atendimento', color: '#f59e0b' },
  { key: 'orcamento_enviado', color: '#a855f7' },
  { key: 'negociacao', color: '#f97316' },
  { key: 'aguardando_pagamento', color: '#06b6d4' },
  { key: 'venda_concluida', color: '#22c55e' },
  { key: 'perdido', color: '#6b7280' },
]

interface Opportunity {
  id: string
  title: string
  stage: string
  estimated_value?: number
  customer?: { name: string; phone_normalized: string }
  vendor?: { full_name: string }
  product_interest?: string
  created_at: string
}

export default function KanbanBoard({ opportunities }: { opportunities: Opportunity[] }) {
  const [opps, setOpps] = useState(opportunities)
  const [dragging, setDragging] = useState<string | null>(null)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const getByStage = (stage: string) => opps.filter(o => o.stage === stage)

  async function handleStageChange(opportunityId: string, stage: string) {
    const current = opps.find(o => o.id === opportunityId)
    if (!current || current.stage === stage) {
      return
    }

    const previousStage = current.stage
    setError('')
    setUpdatingId(opportunityId)
    setOpps(prev => prev.map(o => (o.id === opportunityId ? { ...o, stage } : o)))

    try {
      const response = await fetch(`/api/crm/opportunities/${opportunityId}/stage`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ stage }),
      })
      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload.error || 'Não foi possível atualizar a etapa.')
      }
    } catch (err) {
      setOpps(prev => prev.map(o => (o.id === opportunityId ? { ...o, stage: previousStage } : o)))
      setError(err instanceof Error ? err.message : 'Erro ao atualizar oportunidade.')
    } finally {
      setUpdatingId(null)
      setDragging(null)
    }
  }

  return (
    <div className="flex gap-4 overflow-x-auto p-6 h-full">
      {STAGES.map(({ key, color }) => {
        const cards = getByStage(key)
        const total = cards.reduce((sum, c) => sum + (c.estimated_value || 0), 0)

        return (
          <div key={key} className="kanban-column min-h-[400px]"
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
              e.preventDefault()
              if (!dragging) return
              void handleStageChange(dragging, key)
            }}>
            {/* Column header */}
            <div className="flex items-center justify-between px-1 mb-1">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
                <span className="text-xs font-semibold text-white">{STAGE_LABELS[key]}</span>
                <span className="badge badge-gray text-xs">{cards.length}</span>
              </div>
              {total > 0 && (
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {formatCurrency(total)}
                </span>
              )}
            </div>

            {/* Cards */}
            {cards.map(card => (
              <div key={card.id}
                className="kanban-card animate-fade-in"
                draggable
                onDragStart={() => setDragging(card.id)}
                style={{ opacity: updatingId === card.id ? 0.6 : 1 }}>
                <p className="text-sm font-medium text-white mb-2">{card.title}</p>

                {card.customer && (
                  <div className="flex items-center gap-1.5 mb-2">
                    <User size={12} style={{ color: 'var(--text-muted)' }} />
                    <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {card.customer.name}
                    </span>
                  </div>
                )}

                {card.product_interest && (
                  <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
                    {card.product_interest}
                  </p>
                )}

                <div className="flex items-center justify-between mt-3">
                  {card.estimated_value ? (
                    <div className="flex items-center gap-1">
                      <DollarSign size={12} style={{ color: '#22c55e' }} />
                      <span className="text-xs font-semibold" style={{ color: '#22c55e' }}>
                        {formatCurrency(card.estimated_value)}
                      </span>
                    </div>
                  ) : <span />}

                  <Link href={`/crm/${card.id}`}
                    className="text-xs hover:underline"
                    style={{ color: 'var(--brand-red)' }}>
                    Detalhes
                  </Link>
                </div>
              </div>
            ))}

            {/* Add button */}
            <Link href={`/crm/nova?stage=${key}`}
              className="flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs transition-all hover:bg-white/5"
              style={{ border: '1px dashed var(--border-hover)', color: 'var(--text-muted)' }}>
              + Adicionar
            </Link>
          </div>
        )
      })}
      {error && (
        <div className="fixed bottom-4 right-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}
    </div>
  )
}
