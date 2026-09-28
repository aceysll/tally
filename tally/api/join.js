import { getAdminClient, requireUser } from './_lib.js'

export const config = { runtime: 'nodejs' }

export default async function handler(req, res) {
  const user = await requireUser(req, res)
  if (!user) return

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { code } = req.body || {}
  if (!code) return res.status(400).json({ error: 'code is required' })

  const supabase = getAdminClient()

  const { data: account, error } = await supabase
    .from('accounts')
    .select('id, name')
    .eq('join_code', code.toUpperCase())
    .single()

  if (error || !account) {
    return res.status(404).json({ error: 'That code does not match any account' })
  }

  const { error: memberError } = await supabase
    .from('account_members')
    .upsert(
      { account_id: account.id, profile_id: user.id },
      { onConflict: 'account_id,profile_id', ignoreDuplicates: true }
    )
  if (memberError) return res.status(500).json({ error: memberError.message })

  return res.status(200).json({ account })
}
