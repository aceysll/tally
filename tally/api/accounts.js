import { getAdminClient, requireUser } from './_lib.js'

export const config = { runtime: 'nodejs' }

export default async function handler(req, res) {
  const user = await requireUser(req, res)
  if (!user) return
  const supabase = getAdminClient()

  if (req.method === 'GET') {
    const { data: memberRows, error: memberErr } = await supabase
      .from('account_members')
      .select('account_id')
      .eq('profile_id', user.id)
    if (memberErr) return res.status(500).json({ error: memberErr.message })

    const accountIds = memberRows.map((r) => r.account_id)
    if (accountIds.length === 0) return res.status(200).json({ accounts: [] })

    const { data: accounts, error } = await supabase
      .from('accounts')
      .select('*, account_members(profile_id, profiles(id, display_name))')
      .in('id', accountIds)
      .order('created_at', { ascending: true })
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ accounts })
  }

  if (req.method === 'POST') {
    const { name, hourly_rate, currency } = req.body || {}
    if (!name) return res.status(400).json({ error: 'name is required' })

    const { data: account, error } = await supabase
      .from('accounts')
      .insert({
        name,
        hourly_rate: Number(hourly_rate) || 0,
        currency: currency || '$',
        owner_id: user.id
      })
      .select()
      .single()
    if (error) return res.status(500).json({ error: error.message })

    const { error: memberError } = await supabase
      .from('account_members')
      .insert({ account_id: account.id, profile_id: user.id })
    if (memberError) return res.status(500).json({ error: memberError.message })

    return res.status(201).json({ account })
  }

  res.setHeader('Allow', 'GET, POST')
  return res.status(405).json({ error: 'Method not allowed' })
}
