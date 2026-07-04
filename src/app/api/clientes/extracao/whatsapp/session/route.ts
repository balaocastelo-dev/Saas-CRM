import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getWhatsAppExtractionManager } from '@/lib/whatsapp-web/extraction-manager'
import {
  getRemoteExtractionSnapshot,
  isRemoteWhatsAppExtractionEnabled,
  logoutRemoteExtractionSession,
  startRemoteExtractionSession,
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

export async function GET() {
  try {
    await requireUser()

    if (isRemoteWhatsAppExtractionEnabled()) {
      return NextResponse.json(await getRemoteExtractionSnapshot())
    }

    return NextResponse.json(getWhatsAppExtractionManager().getSnapshot())
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro interno.' },
      { status: 401 }
    )
  }
}

export async function POST() {
  try {
    await requireUser()

    const payload = isRemoteWhatsAppExtractionEnabled()
      ? await startRemoteExtractionSession()
      : getWhatsAppExtractionManager().startSession()

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

export async function DELETE() {
  try {
    await requireUser()

    if (isRemoteWhatsAppExtractionEnabled()) {
      return NextResponse.json(await logoutRemoteExtractionSession())
    }

    return NextResponse.json(await getWhatsAppExtractionManager().logout())
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro interno.' },
      { status: 400 }
    )
  }
}
