import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function maskSecret(value: string) {
  if (!value) return ''
  if (value.length <= 8) return '********'
  return `${value.slice(0, 4)}****${value.slice(-4)}`
}

export async function GET() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || ''
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN || ''
  const appSecret = process.env.WHATSAPP_APP_SECRET || ''

  return NextResponse.json({
    whatsapp: {
      configured: Boolean(accessToken && process.env.WHATSAPP_PHONE_NUMBER_ID),
      accessTokenConfigured: Boolean(accessToken),
      accessTokenPreview: maskSecret(accessToken),
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
      businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '',
      verifyTokenConfigured: Boolean(process.env.WHATSAPP_VERIFY_TOKEN),
      verifyTokenPreview: maskSecret(process.env.WHATSAPP_VERIFY_TOKEN || ''),
      appSecretConfigured: Boolean(appSecret),
      appSecretPreview: maskSecret(appSecret),
      webhookUrl: appUrl ? `${appUrl}/api/webhooks/whatsapp` : '',
    },
  })
}
