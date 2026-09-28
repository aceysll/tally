import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import {
  getMyAccounts,
  createAccount,
  updateAccount,
  deleteAccount,
  joinAccountByCode,
  leaveAccount,
  removeMember
} from '../lib/api.js'

const CURRENCIES = [
  { symbol: '$', label: 'USD ($)' },
  { symbol: '₦', label: 'NGN (₦)' }
]

function normalizeCurrency(value) {
  return CURRENCIES.some((c) => c.symbol === value) ? value : '$'
}

function formatRate(currency, rate) {
  return `${currency}${Number(rate).toLocaleString()}/hr`
}

export default function Accounts() {
  const [myId, setMyId] = useState(null)
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const [name, setName] = useState('')
  const [rate, setRate] = useState('')
  const [currency, setCurrency] = useState('$')
  const [creating, setCreating] = useState(false)

  const [joinCode, setJoinCode] = useState('')
  const [joining, setJoining] = useState(false)

  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const [editRate, setEditRate] = useState('')
  const [editCurrency, setEditCurrency] = useState('$')
  const [savingEdit, setSavingEdit] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const {
        data: { user }
      } = await supabase.auth.getUser()
      setMyId(user.id)
      const accs = await getMyAccounts()
      setAccounts(accs)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function handleCreate(e) {
    e.preventDefault()
    if (!name.trim()) return
    setCreating(true)
    setError('')
    setNotice('')
    try {
      await createAccount({ name, hourly_rate: rate, currency })
      setName('')
      setRate('')
      setCurrency('$')
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setCreating(false)
    }
  }

  async function handleJoin(e) {
    e.preventDefault()
    if (!joinCode) return
    setJoining(true)
    setError('')
    setNotice('')
    try {
      const joined = await joinAccountByCode(joinCode)
      setJoinCode('')
      setNotice(`Joined "${joined?.name || 'account'}"`)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setJoining(false)
    }
  }

  function startEdit(account) {
    setEditingId(account.id)
    setEditName(account.name)
    setEditRate(String(account.hourly_rate))
    setEditCurrency(normalizeCurrency(account.currency))
    setError('')
    setNotice('')
  }

  function cancelEdit() {
    setEditingId(null)
  }

  async function handleSaveEdit(e) {
    e.preventDefault()
    if (!editName.trim()) return
    setSavingEdit(true)
    setError('')
    try {
      await updateAccount(editingId, {
        name: editName,
        hourly_rate: editRate,
        currency: editCurrency
      })
      setEditingId(null)
      setNotice('Account updated')
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setSavingEdit(false)
    }
  }

  async function handleDelete(account) {
    const sure = window.confirm(
      `Delete "${account.name}"? This also deletes every hour logged on it and removes all its members. This cannot be undone.`
    )
    if (!sure) return
    setError('')
    setNotice('')
    try {
      await deleteAccount(account.id)
      setNotice(`Deleted "${account.name}"`)
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleLeave(accountId) {
    try {
      await leaveAccount(accountId)
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleRemoveMember(accountId, profileId) {
    try {
      await removeMember(accountId, profileId)
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div>
      <h1 className="page-title">Accounts</h1>
      <p className="page-sub">Create an account you own, or join one with a friend's invite code.</p>

      <div className="card">
        <div className="section-title" style={{ margin: '0 0 12px' }}>Create an account you own</div>
        <form onSubmit={handleCreate}>
          <div className="form-row">
            <div className="field">
              <label>Account / platform name</label>
              <input
                type="text"
                placeholder="e.g. Outlier"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          </div>
          <div className="form-row">
            <div className="field">
              <label>Hourly rate</label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="15"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
              />
            </div>
            <div className="field">
              <label>Currency</label>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {CURRENCIES.map((c) => (
                  <option key={c.symbol} value={c.symbol}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn-primary" type="submit" disabled={creating || !name.trim()}>
              {creating ? 'Creating...' : 'Create account'}
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <div className="section-title" style={{ margin: '0 0 12px' }}>Join with an invite code</div>
        <form onSubmit={handleJoin} className="form-row" style={{ alignItems: 'flex-end' }}>
          <div className="field">
            <label>6-character code</label>
            <input
              type="text"
              placeholder="A1B2C3"
              maxLength={6}
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            />
          </div>
          <button className="btn-primary" type="submit" disabled={joining || !joinCode}>
            {joining ? 'Joining...' : 'Join'}
          </button>
        </form>
      </div>

      {notice && <p style={{ color: 'var(--mint)', fontSize: 13 }}>{notice}</p>}
      {error && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</p>}

      <div className="section-title">Your accounts</div>
      {loading ? (
        <p className="empty-state">Loading...</p>
      ) : accounts.length === 0 ? (
        <p className="empty-state">Nothing yet, create or join one above.</p>
      ) : (
        accounts.map((a) => {
          const isOwner = a.owner_id === myId
          const isEditing = editingId === a.id

          return (
            <div className="card" key={a.id}>
              {isEditing ? (
                <form onSubmit={handleSaveEdit}>
                  <div className="form-row">
                    <div className="field">
                      <label>Account / platform name</label>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="field">
                      <label>Hourly rate</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={editRate}
                        onChange={(e) => setEditRate(e.target.value)}
                      />
                    </div>
                    <div className="field">
                      <label>Currency</label>
                      <select value={editCurrency} onChange={(e) => setEditCurrency(e.target.value)}>
                        {CURRENCIES.map((c) => (
                          <option key={c.symbol} value={c.symbol}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="form-row" style={{ justifyContent: 'flex-end' }}>
                    <button className="btn-ghost" type="button" onClick={cancelEdit}>
                      Cancel
                    </button>
                    <button className="btn-primary" type="submit" disabled={savingEdit || !editName.trim()}>
                      {savingEdit ? 'Saving...' : 'Save changes'}
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <div className="breakdown-row" style={{ padding: 0, borderBottom: 'none', marginBottom: 10 }}>
                    <div>
                      <div className="entry-account">
                        {a.name}
                        {isOwner && <span className="entry-owner">you own this</span>}
                      </div>
                      <div className="entry-meta">{formatRate(a.currency, a.hourly_rate)}</div>
                    </div>
                    <div className="account-rate mono">code: {a.join_code}</div>
                  </div>

                  <div className="entry-meta" style={{ marginBottom: 6 }}>Members</div>
                  {a.account_members?.map((m) => (
                    <div className="breakdown-row" key={m.profile_id} style={{ padding: '6px 0' }}>
                      <div className="breakdown-sub" style={{ color: 'var(--text)' }}>
                        {m.profile_id === myId ? 'Me' : m.profiles?.display_name}
                      </div>
                      {isOwner && m.profile_id !== myId && (
                        <button className="btn-danger" onClick={() => handleRemoveMember(a.id, m.profile_id)}>
                          Remove
                        </button>
                      )}
                    </div>
                  ))}

                  {isOwner && (
                    <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                      <button className="btn-ghost" onClick={() => startEdit(a)}>
                        Edit
                      </button>
                      <button className="btn-danger" onClick={() => handleDelete(a)}>
                        Delete account
                      </button>
                    </div>
                  )}

                  {!isOwner && (
                    <div style={{ marginTop: 10 }}>
                      <button className="btn-ghost" onClick={() => handleLeave(a.id)}>
                        Leave this account
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}
