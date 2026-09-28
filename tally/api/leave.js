import { getAdminClient, requireUser } from './_lib.js'

export const config = { runtime: 'nodejs' }

export default async function handler(req, res) {
  const user = await requireUser(req, res)
  if (!user) return

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { account_id, profile_id } = req.body || {}
  if (!account_id) return res.status(400).json({ error: 'account_id is required' })

  const targetId = profile_id || user.id
  const supabase = getAdminClient()

  if (targetId !== user.id) {
    const { data: account, error } = await supabase
      .from('accounts')
      .select('owner_id')
      .eq('id', account_id)
      .single()
    if (error || !account) return res.status(404).json({ error: 'Account not found' })
    if (account.owner_id !== user.id) {
      return res.status(403).json({ error: 'Only the account owner can remove another member' })
    }
  }

  const { error: delError } = await supabase
    .from('account_members')
    .delete()
    .eq('account_id', account_id)
    .eq('profile_id', targetId)
  if (delError) return res.status(500).json({ error: delError.message })

  return res.status(200).json({ ok: true })
}
