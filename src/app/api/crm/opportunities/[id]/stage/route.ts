import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const stageSchema = z.object({
  stage: z.enum([
    'novo_lead',
    'em_atendimento',
    'orcamento_enviado',
    'negociacao',
    'aguardando_pagamento',
    'venda_concluida',
    'perdido',
  ]),
})

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
    }

    const { id } = await context.params
    const body = await request.json()
    const { stage } = stageSchema.parse(body)

    const { data: currentOpportunity, error: fetchError } = await supabase
      .from('opportunities')
      .select('id, stage')
      .eq('id', id)
      .maybeSingle()

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 400 })
    }

    if (!currentOpportunity) {
      return NextResponse.json({ error: 'Oportunidade não encontrada.' }, { status: 404 })
    }

    if (currentOpportunity.stage === stage) {
      return NextResponse.json({ stage })
    }

    const closingStage = stage === 'venda_concluida' || stage === 'perdido'
    const { data: updatedOpportunity, error: updateError } = await supabase
      .from('opportunities')
      .update({
        stage,
        closed_at: closingStage ? new Date().toISOString() : null,
      })
      .eq('id', id)
      .select('id, stage, closed_at')
      .single()

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 })
    }

    await supabase.from('opportunity_history').insert({
      opportunity_id: id,
      user_id: user.id,
      action: 'stage_changed',
      old_stage: currentOpportunity.stage,
      new_stage: stage,
    })

    return NextResponse.json({ opportunity: updatedOpportunity })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dados inválidos.', details: error.flatten() },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro interno.' },
      { status: 500 }
    )
  }
}
