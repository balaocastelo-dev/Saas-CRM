import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  processCampaignById,
  processDueCampaigns,
  setCampaignStatus,
} from '@/lib/campaigns/processor'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const processCampaignSchema = z.object({
  campaignId: z.string().uuid().optional(),
  action: z.enum(['process', 'start', 'pause', 'resume']).default('process'),
})

function isAuthorizedCronRequest(request: NextRequest) {
  const expectedSecrets = [
    process.env.CAMPAIGN_PROCESSOR_SECRET?.trim() || '',
    process.env.CRON_SECRET?.trim() || '',
  ].filter(Boolean)

  if (expectedSecrets.length === 0) {
    return false
  }

  const authorizationHeader = request.headers.get('authorization')?.trim() || ''
  const headerSecret = request.headers.get('x-campaign-secret')?.trim()
  const querySecret = request.nextUrl.searchParams.get('secret')?.trim()
  const bearerSecret = authorizationHeader.startsWith('Bearer ')
    ? authorizationHeader.slice('Bearer '.length).trim()
    : ''

  return expectedSecrets.some(
    secret =>
      headerSecret === secret ||
      querySecret === secret ||
      bearerSecret === secret
  )
}

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  try {
    const supabaseAdmin = createAdminClient()
    const results = await processDueCampaigns(supabaseAdmin)

    return NextResponse.json({
      processedCampaigns: results.length,
      results,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro interno.' },
      { status: 500 }
    )
  }
}

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
    const { campaignId, action } = processCampaignSchema.parse(body)
    const supabaseAdmin = createAdminClient()

    if (action === 'pause') {
      if (!campaignId) {
        return NextResponse.json({ error: 'Informe a campanha para pausar.' }, { status: 400 })
      }

      await setCampaignStatus(supabaseAdmin, campaignId, 'paused')
      return NextResponse.json({ message: 'Campanha pausada com sucesso.' })
    }

    if (action === 'resume') {
      if (!campaignId) {
        return NextResponse.json({ error: 'Informe a campanha para retomar.' }, { status: 400 })
      }

      await setCampaignStatus(supabaseAdmin, campaignId, 'running')
      const result = await processCampaignById(supabaseAdmin, campaignId, { forceStart: true })
      return NextResponse.json({ result })
    }

    if (action === 'start') {
      if (!campaignId) {
        return NextResponse.json({ error: 'Informe a campanha para iniciar.' }, { status: 400 })
      }

      const result = await processCampaignById(supabaseAdmin, campaignId, { forceStart: true })
      return NextResponse.json({ result })
    }

    if (campaignId) {
      const result = await processCampaignById(supabaseAdmin, campaignId)
      return NextResponse.json({ result })
    }

    const results = await processDueCampaigns(supabaseAdmin)
    return NextResponse.json({
      processedCampaigns: results.length,
      results,
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
