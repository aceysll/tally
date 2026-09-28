import { getAdminClient, requireUser } from './_lib.js'

export const config = { runtime: 'nodejs' }

async function myAccountIds(supabase, userId) {
  const { data, error } = await supabase
    .from('account_members')
    .select('account_id')
    .eq('profile_id', userId)
  if (error) throw error
  return data.map((r) => r.account_id)
}

async function ownedAccountIds(supabase, userId) {
  const { data, error } = await supabase.from('accounts').select('id').eq('owner_id', userId)
  if (error) throw error
  return new Set(data.map((r) => r.id))
}

const ENTRY_SELECT = `
  *,
  accounts(id, name, hourly_rate, currency, owner_id),
  worked_by_profile:profiles!entries_worked_by_fkey(id, display_name),
  created_by_profile:profiles!entries_created_by_fkey(id, display_name)
`

export default async function handler(req, res) {
  const user = await requireUser(req, res)
  if (!user) return
  const supabase = getAdminClient()

  if (req.method === 'GET') {
    const { start, end } = req.query || {}
    const accountIds = await myAccountIds(supabase, user.id)
    if (accountIds.length === 0) return res.status(200).json({ entries: [] })

    let query = supabase
      .from('entries')
      .select(ENTRY_SELECT)
      .in('account_id', accountIds)
      .order('entry_date', { ascending: false })
    if (start) query = query.gte('entry_date', start)
    if (end) query = query.lte('entry_date', end)

    const { data, error } = await query
    if (error) return res.status(500).json({ error: error.message })

    // Privacy filter: you only see an entry if you logged it, it's
    // attributed to you, or you own the account it's logged against.
    const owned = await ownedAccountIds(supabase, user.id)
    const visible = data.filter(
      (e) => e.worked_by === user.id || e.created_by === user.id || owned.has(e.account_id)
    )
    return res.status(200).json({ entries: visible })
  }

  if (req.method === 'POST') {
    const { account_id, worked_by, entry_date, hours, paid, note } = req.body || {}
    if (!account_id || !entry_date || hours === undefined) {
      return res.status(400).json({ error: 'account_id, entry_date and hours are required' })
    }

    const accountIds = await myAccountIds(supabase, user.id)
    if (!accountIds.includes(account_id)) {
      return res.status(403).json({ error: 'You are not a member of that account' })
    }

    const targetWorkedBy = worked_by || user.id
    const { data: memberCheck, error: memberErr } = await supabase
      .from('account_members')
      .select('profile_id')
      .eq('account_id', account_id)
      .eq('profile_id', targetWorkedBy)
      .maybeSingle()
    if (memberErr) return res.status(500).json({ error: memberErr.message })
    if (!memberCheck) return res.status(400).json({ error: 'That person is not a member of this account' })

    const { data, error } = await supabase
      .from('entries')
      .insert({
        account_id,
        worked_by: targetWorkedBy,
        created_by: user.id,
        entry_date,
        hours: Number(hours),
        paid: Boolean(paid),
        note: note || null
      })
      .select(ENTRY_SELECT)
      .single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(201).json({ entry: data })
  }

  if (req.method === 'PATCH') {
    const { id, paid } = req.body || {}
    if (!id || paid === undefined) return res.status(400).json({ error: 'id and paid are required' })

    const { data: entry, error: fetchErr } = await supabase
      .from('entries')
      .select('id, worked_by, created_by, account_id, accounts(owner_id)')
      .eq('id', id)
      .single()
    if (fetchErr || !entry) return res.status(404).json({ error: 'Entry not found' })

    const allowed =
      entry.worked_by === user.id || entry.created_by === user.id || entry.accounts?.owner_id === user.id
    if (!allowed) return res.status(403).json({ error: 'Not allowed to update this entry' })

    const { data, error } = await supabase
      .from('entries')
      .update({ paid: Boolean(paid) })
      .eq('id', id)
      .select()
      .single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ entry: data })
  }

  if (req.method === 'DELETE') {
    const { id } = req.body || {}
    if (!id) return res.status(400).json({ error: 'id is required' })

    const { data: entry, error: fetchErr } = await supabase
      .from('entries')
      .select('id, created_by, account_id, accounts(owner_id)')
      .eq('id', id)
      .single()
    if (fetchErr || !entry) return res.status(404).json({ error: 'Entry not found' })

    const allowed = entry.created_by === user.id || entry.accounts?.owner_id === user.id
    if (!allowed) return res.status(403).json({ error: 'Not allowed to delete this entry' })

    const { error } = await supabase.from('entries').delete().eq('id', id)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }

  res.setHeader('Allow', 'GET, POST, PATCH, DELETE')
  return res.status(405).json({ error: 'Method not allowed' })
}
