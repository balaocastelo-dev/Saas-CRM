import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getWhatsAppExtractionManager } from '@/lib/whatsapp-web/extraction-manager'
import {
  isRemoteWhatsAppExtractionEnabled,
  startRemoteExtractionSync,
} from '@/lib/whatsapp-web/remote-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function requireUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Não autenticado.')
  }

  return user
}

export async function POST() {
  try {
    await requireUser()

    const payload = isRemoteWhatsAppExtractionEnabled()
      ? await startRemoteExtractionSync()
      : getWhatsAppExtractionManager().startSync()

    return NextResponse.json(payload, {
      status: 202,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro interno.' },
      { status: 400 }
    )
  }
}
