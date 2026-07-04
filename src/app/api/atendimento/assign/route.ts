import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const assignConversationSchema = z.object({
  conversationId: z.string().uuid(),
  assignedTo: z.string().uuid().nullable(),
})

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
    }

    const body = await request.json()
    const { conversationId, assignedTo } = assignConversationSchema.parse(body)

    const supabaseAdmin = createAdminClient()

    if (assignedTo) {
      const { data: assignee } = await supabaseAdmin
        .from('profiles')
        .select('id, full_name, user_role')
        .eq('id', assignedTo)
        .eq('is_active', true)
        .in('user_role', ['admin', 'atendente', 'vendedor'])
        .maybeSingle()

      if (!assignee) {
        return NextResponse.json({ error: 'Responsável inválido.' }, { status: 400 })
      }
    }

    const { data: updatedConversation, error } = await supabaseAdmin
      .from('whatsapp_conversations')
      .update({
        assigned_to: assignedTo,
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversationId)
      .select('id, assigned_to:profiles!assigned_to(id, full_name)')
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({
      conversation: updatedConversation,
    })
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
