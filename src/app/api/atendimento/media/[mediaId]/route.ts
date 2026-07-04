import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { downloadMedia } from '@/lib/whatsapp/client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ mediaId: string }> }
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  const { mediaId } = await params

  const result = await downloadMedia(mediaId)

  if (!result.success || !result.data) {
    return NextResponse.json(
      { error: result.error || 'Não foi possível carregar a mídia.' },
      { status: 400 }
    )
  }

  return new Response(result.data.body, {
    headers: {
      'content-type': result.data.mimeType,
      'cache-control': 'private, max-age=300',
      ...(result.data.fileName ? { 'content-disposition': `inline; filename="${result.data.fileName}"` } : {}),
    },
  })
}
