import { supabase } from './supabaseClient.js'

async function authedFetch(url, options = {}) {
  const {
    data: { session }
  } = await supabase.auth.getSession()
  const token = session?.access_token

  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || 'Request failed')
  return body
}

export function getMyProfile() {
  return authedFetch('/api/profile').then((r) => r.profile)
}

export function updateDisplayName(display_name) {
  return authedFetch('/api/profile', { method: 'PATCH', body: JSON.stringify({ display_name }) })
}

export function getMyAccounts() {
  return authedFetch('/api/accounts').then((r) => r.accounts)
}

export function createAccount(payload) {
  return authedFetch('/api/accounts', { method: 'POST', body: JSON.stringify(payload) }).then(
    (r) => r.account
  )
}

export function joinAccountByCode(code) {
  return authedFetch('/api/join', { method: 'POST', body: JSON.stringify({ code }) }).then(
    (r) => r.account
  )
}

export function leaveAccount(accountId) {
  return authedFetch('/api/leave', {
    method: 'POST',
    body: JSON.stringify({ account_id: accountId })
  })
}

export function removeMember(accountId, profileId) {
  return authedFetch('/api/leave', {
    method: 'POST',
    body: JSON.stringify({ account_id: accountId, profile_id: profileId })
  })
}

export function getEntries({ start, end } = {}) {
  const params = new URLSearchParams()
  if (start) params.set('start', start)
  if (end) params.set('end', end)
  const qs = params.toString()
  return authedFetch(`/api/entries${qs ? `?${qs}` : ''}`).then((r) => r.entries)
}

export function createEntry(payload) {
  return authedFetch('/api/entries', { method: 'POST', body: JSON.stringify(payload) }).then(
    (r) => r.entry
  )
}

export function togglePaid(id, paid) {
  return authedFetch('/api/entries', { method: 'PATCH', body: JSON.stringify({ id, paid }) }).then(
    (r) => r.entry
  )
}

export function deleteEntry(id) {
  return authedFetch('/api/entries', { method: 'DELETE', body: JSON.stringify({ id }) })
}
