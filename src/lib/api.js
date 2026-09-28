import { supabase } from './supabaseClient.js'

async function currentUser() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')
  return user
}

export async function getMyProfile() {
  const user = await currentUser()
  const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (error) throw error
  return data
}

export async function updateDisplayName(display_name) {
  const user = await currentUser()
  const { error } = await supabase.from('profiles').update({ display_name }).eq('id', user.id)
  if (error) throw error
}

// Accounts I own or belong to, each with its member list.
export async function getMyAccounts() {
  const { data, error } = await supabase
    .from('accounts')
    .select(`
      *,
      owner:profiles!accounts_owner_id_fkey(id, display_name),
      account_members(profile_id, profiles(id, display_name))
    `)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data
}

export async function createAccount({ name, hourly_rate, currency }) {
  const user = await currentUser()
  const { data, error } = await supabase
    .from('accounts')
    .insert({ name, hourly_rate: Number(hourly_rate) || 0, currency: currency || '$', owner_id: user.id })
    .select()
    .single()
  if (error) throw error

  const { error: memberError } = await supabase
    .from('account_members')
    .insert({ account_id: data.id, profile_id: user.id })
  if (memberError) throw memberError

  return data
}

export async function joinAccountByCode(code) {
  const { data, error } = await supabase.rpc('join_account_by_code', { p_code: code })
  if (error) throw error
  return data
}

export async function leaveAccount(accountId) {
  const user = await currentUser()
  const { error } = await supabase
    .from('account_members')
    .delete()
    .eq('account_id', accountId)
    .eq('profile_id', user.id)
  if (error) throw error
}

export async function removeMember(accountId, profileId) {
  const { error } = await supabase
    .from('account_members')
    .delete()
    .eq('account_id', accountId)
    .eq('profile_id', profileId)
  if (error) throw error
}

export async function getEntries({ accountIds, start, end } = {}) {
  let query = supabase
    .from('entries')
    .select(`
      *,
      accounts(id, name, hourly_rate, currency, owner_id),
      worked_by_profile:profiles!entries_worked_by_fkey(id, display_name),
      created_by_profile:profiles!entries_created_by_fkey(id, display_name)
    `)
    .order('entry_date', { ascending: false })

  if (accountIds?.length) query = query.in('account_id', accountIds)
  if (start) query = query.gte('entry_date', start)
  if (end) query = query.lte('entry_date', end)

  const { data, error } = await query
  if (error) throw error
  return data
}

export async function createEntry({ account_id, worked_by, entry_date, hours, paid, note }) {
  const user = await currentUser()
  const { data, error } = await supabase
    .from('entries')
    .insert({
      account_id,
      worked_by: worked_by || user.id,
      created_by: user.id,
      entry_date,
      hours: Number(hours),
      paid: Boolean(paid),
      note: note || null
    })
    .select(`
      *,
      accounts(id, name, hourly_rate, currency, owner_id),
      worked_by_profile:profiles!entries_worked_by_fkey(id, display_name),
      created_by_profile:profiles!entries_created_by_fkey(id, display_name)
    `)
    .single()
  if (error) throw error
  return data
}

export async function togglePaid(id, paid) {
  const { data, error } = await supabase.from('entries').update({ paid }).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function deleteEntry(id) {
  const { error } = await supabase.from('entries').delete().eq('id', id)
  if (error) throw error
}
