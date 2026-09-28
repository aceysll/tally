import { createClient } from '@supabase/supabase-js'

export function getAdminClient() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}

// Verifies the caller's Supabase session from the Authorization header.
// Every API route calls this first, nothing proceeds without a valid user.
export async function requireUser(req, res) {
  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (!token) {
    res.status(401).json({ error: 'Missing authorization token' })
    return null
  }

  const supabase = getAdminClient()
  const { data, error } = await supabase.auth.getUser(token)

  if (error || !data?.user) {
    res.status(401).json({ error: 'Invalid or expired session' })
    return null
  }

  return data.user
}
