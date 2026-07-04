export function getSupabaseUrl() {
  const value =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    ''

  if (!value) {
    throw new Error('URL do Supabase nÃ£o configurado.')
  }

  return value
}

export function getSupabasePublishableKey() {
  const value =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    ''

  if (!value) {
    throw new Error('Chave publicÃ¡vel do Supabase nÃ£o configurada.')
  }

  return value
}

export function getSupabaseServiceRoleKey() {
  const value =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    ''

  if (!value) {
    throw new Error('Chave secreta do Supabase nÃ£o configurada.')
  }

  return value
}

export function getSupabaseJwksUrl() {
  return process.env.SUPABASE_JWKS_URL || ''
}
