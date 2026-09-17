import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { getMyAccounts, getEntries, createEntry, togglePaid, deleteEntry } from '../lib/api.js'

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function fromNowISO(daysAgo) {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  return d.toISOString().slice(0, 10)
}

function formatDateLabel(iso) {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

export default function Log() {
  const [myId, setMyId] = useState(null)
  const [accounts, setAccounts] = useState([])
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [accountId, setAccountId] = useState('')
  const [workedBy, setWorkedBy] = useState('')
  const [date, setDate] = useState(todayISO())
  const [hours, setHours] = useState('')
  const [paid, setPaid] = useState(false)
  const [note, setNote] = useState('')

  async function load() {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      setMyId(user.id)

      const accs = await getMyAccounts()
      setAccounts(accs)
      if (accs.length && !accountId) {
        setAccountId(accs[0].id)
        setWorkedBy(user.id)
      }

      const accountIds = accs.map((a) => a.id)
      const ents = await getEntries({ accountIds, start: fromNowISO(13) })
      setEntries(ents)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selectedAccount = accounts.find((a) => a.id === accountId)
  const members = selectedAccount?.account_members || []

  async function handleSubmit(e) {
    e.preventDefault()
    if (!accountId || !hours) return
    setSaving(true)
    setError('')
    try {
      await createEntry({ account_id: accountId, worked_by: workedBy, entry_date: date, hours, paid, note })
      setHours('')
      setNote('')
      setPaid(false)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleTogglePaid(entry) {
    try {
      await togglePaid(entry.id, !entry.paid)
      setEntries((prev) => prev.map((e) => (e.id === entry.id ? { ...e, paid: !e.paid } : e)))
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleDelete(id) {
    try {
      await deleteEntry(id)
      setEntries((prev) => prev.filter((e) => e.id !== id))
    } catch (err) {
      setError(err.message)
    }
  }

  const grouped = useMemo(() => {
    return entries.reduce((acc, entry) => {
      acc[entry.entry_date] = acc[entry.entry_date] || []
      acc[entry.entry_date].push(entry)
      return acc
    }, {})
  }, [entries])
  const dates = Object.keys(grouped).sort((a, b) => (a < b ? 1 : -1))

  return (
    <div>
      <h1 className="page-title">Log hours</h1>
      <p className="page-sub">Quick entry, last 14 days across every account you're in.</p>

      {accounts.length === 0 && !loading ? (
        <div className="card">
          <p style={{ margin: 0, color: 'var(--text-dim)' }}>
            You're not on any accounts yet. Create one or join with a code on the Accounts page.
          </p>
        </div>
      ) : (
        <form className="card" onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="field">
              <label>Account</label>
              <select
                value={accountId}
                onChange={(e) => {
                  setAccountId(e.target.value)
                  setWorkedBy(myId)
                }}
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Hours worked by</label>
              <select value={workedBy} onChange={(e) => setWorkedBy(e.target.value)}>
                {members.map((m) => (
                  <option key={m.profile_id} value={m.profile_id}>
                    {m.profile_id === myId ? 'Me' : m.profiles?.display_name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="field">
              <label>Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="field">
              <label>Hours</label>
              <input
                type="number"
                step="0.25"
                min="0"
                placeholder="2.5"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
              />
            </div>
          </div>
          <div className="form-row">
            <div className="field" style={{ flex: 3 }}>
              <label>Note (optional)</label>
              <input
                type="text"
                placeholder="e.g. covering the Friday shift"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </div>
          <div className="form-row" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
            <label className="checkbox-row">
              <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} />
              Already paid
            </label>
            <button className="btn-primary" type="submit" disabled={saving || !accountId || !hours}>
              {saving ? 'Saving...' : 'Add entry'}
            </button>
          </div>
          {error && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</p>}
        </form>
      )}

      {loading ? (
        <p className="empty-state">Loading...</p>
      ) : dates.length === 0 ? (
        <p className="empty-state">No entries in the last 14 days yet.</p>
      ) : (
        dates.map((d) => (
          <div className="entry-group" key={d}>
            <div className="entry-group-date">{formatDateLabel(d)}</div>
            {grouped[d].map((entry) => (
              <div className="entry-row" key={entry.id}>
                <div>
                  <div className="entry-account">
                    {entry.accounts?.name}
                    {entry.worked_by !== myId && (
                      <span className="entry-owner">{entry.worked_by_profile?.display_name}</span>
                    )}
                  </div>
                  {entry.note && <div className="entry-meta">{entry.note}</div>}
                </div>
                <div className="entry-hours mono">
                  {entry.hours}h · {entry.accounts?.currency}
                  {(entry.hours * entry.accounts?.hourly_rate).toFixed(2)}
                </div>
                <button
                  className={`entry-paid-toggle ${entry.paid ? 'paid' : ''}`}
                  onClick={() => handleTogglePaid(entry)}
                >
                  {entry.paid ? 'Paid' : 'Unpaid'}
                </button>
                <button className="btn-danger" onClick={() => handleDelete(entry.id)}>
                  ✕
                </button>
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  )
}
