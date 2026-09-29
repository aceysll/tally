import { getAdminClient, requireUser } from './_lib.js'

export const config = { runtime: 'nodejs' }

// Lets an account owner mark every unpaid entry for one person, within a
// date range, as paid in one go. This is for payday: "I just paid Gbotex
// for this pay week" rather than ticking each entry one at a time.
export default async function handler(req, res) {
  const user = await requireUser(req, res)
  if (!user) return

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { account_id, worked_by, start, end } = req.body || {}
  if (!account_id || !worked_by) {
    return res.status(400).json({ error: 'account_id and worked_by are required' })
  }

  const supabase = getAdminClient()

  const { data: account, error: accErr } = await supabase
    .from('accounts')
    .select('owner_id')
    .eq('id', account_id)
    .single()
  if (accErr || !account) return res.status(404).json({ error: 'Account not found' })
  if (account.owner_id !== user.id) {
    return res.status(403).json({ error: 'Only the account owner can mark a period as paid' })
  }

  let query = supabase
    .from('entries')
    .update({ paid: true })
    .eq('account_id', account_id)
    .eq('worked_by', worked_by)
    .eq('paid', false)
  if (start) query = query.gte('entry_date', start)
  if (end) query = query.lte('entry_date', end)

  const { data, error } = await query.select('id')
  if (error) return res.status(500).json({ error: error.message })

  return res.status(200).json({ updated: data.length })
}
