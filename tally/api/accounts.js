import { getAdminClient, requireUser } from './_lib.js'

export const config = { runtime: 'nodejs' }

// Add more symbols here later if another currency is needed.
const ALLOWED_CURRENCIES = ['$', '₦']

function cleanCurrency(value) {
  return ALLOWED_CURRENCIES.includes(value) ? value : '$'
}

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
    if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' })

    const { data: account, error } = await supabase
      .from('accounts')
      .insert({
        name: name.trim(),
        hourly_rate: Math.max(Number(hourly_rate) || 0, 0),
        currency: cleanCurrency(currency),
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

  if (req.method === 'PATCH') {
    const { id, name, hourly_rate, currency } = req.body || {}
    if (!id) return res.status(400).json({ error: 'id is required' })

    const { data: existing, error: fetchErr } = await supabase
      .from('accounts')
      .select('id, owner_id')
      .eq('id', id)
      .single()
    if (fetchErr || !existing) return res.status(404).json({ error: 'Account not found' })
    if (existing.owner_id !== user.id) {
      return res.status(403).json({ error: 'Only the account owner can edit it' })
    }

    const updates = {}
    if (name !== undefined) {
      if (!name.trim()) return res.status(400).json({ error: 'name cannot be empty' })
      updates.name = name.trim()
    }
    if (hourly_rate !== undefined) updates.hourly_rate = Math.max(Number(hourly_rate) || 0, 0)
    if (currency !== undefined) updates.currency = cleanCurrency(currency)

    const { data: account, error } = await supabase
      .from('accounts')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ account })
  }

  if (req.method === 'DELETE') {
    const id = (req.body && req.body.id) || (req.query && req.query.id)
    if (!id) return res.status(400).json({ error: 'id is required' })

    const { data: existing, error: fetchErr } = await supabase
      .from('accounts')
      .select('id, owner_id')
      .eq('id', id)
      .single()
    if (fetchErr || !existing) return res.status(404).json({ error: 'Account not found' })
    if (existing.owner_id !== user.id) {
      return res.status(403).json({ error: 'Only the account owner can delete it' })
    }

    // Members and entries are removed automatically (on delete cascade).
    const { error } = await supabase.from('accounts').delete().eq('id', id)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }

  res.setHeader('Allow', 'GET, POST, PATCH, DELETE')
  return res.status(405).json({ error: 'Method not allowed' })
}
