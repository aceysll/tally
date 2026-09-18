import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { getMyAccounts, getEntries } from '../lib/api.js'

function startOfWeekISO() {
  const d = new Date()
  const day = d.getDay()
  const diff = day === 0 ? 6 : day - 1 // Monday as start
  d.setDate(d.getDate() - diff)
  return d.toISOString().slice(0, 10)
}

function startOfMonthISO() {
  const d = new Date()
  d.setDate(1)
  return d.toISOString().slice(0, 10)
}

const RANGES = [
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'all', label: 'All time' }
]

export default function Dashboard() {
  const [myId, setMyId] = useState(null)
  const [range, setRange] = useState('week')
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let start
    if (range === 'week') start = startOfWeekISO()
    if (range === 'month') start = startOfMonthISO()

    setLoading(true)
    Promise.all([supabase.auth.getUser(), getMyAccounts()])
      .then(async ([{ data: { user } }, accs]) => {
        setMyId(user.id)
        const accountIds = accs.map((a) => a.id)
        const ents = await getEntries(accountIds.length ? { accountIds, start } : { start })
        setEntries(ents)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [range])

  const { totalHours, totalEarnings, totalUnpaid, byAccount, byPerson } = useMemo(() => {
    let totalHours = 0
    let totalEarnings = 0
    let totalUnpaid = 0
    const byAccount = {}
    const byPerson = {}

    for (const entry of entries) {
      const acc = entry.accounts
      if (!acc) continue
      const earnings = entry.hours * acc.hourly_rate

      totalHours += entry.hours
      totalEarnings += earnings
      if (!entry.paid) totalUnpaid += earnings

      if (!byAccount[acc.id]) {
        byAccount[acc.id] = { name: acc.name, currency: acc.currency, hours: 0, earnings: 0, unpaid: 0, people: {} }
      }
      byAccount[acc.id].hours += entry.hours
      byAccount[acc.id].earnings += earnings
      if (!entry.paid) byAccount[acc.id].unpaid += earnings

      const personKey = entry.worked_by
      const personName = entry.worked_by_profile?.display_name || 'Someone'
      if (!byAccount[acc.id].people[personKey]) {
        byAccount[acc.id].people[personKey] = { name: personName, hours: 0, earnings: 0, unpaid: 0 }
      }
      byAccount[acc.id].people[personKey].hours += entry.hours
      byAccount[acc.id].people[personKey].earnings += earnings
      if (!entry.paid) byAccount[acc.id].people[personKey].unpaid += earnings

      if (!byPerson[personKey]) {
        byPerson[personKey] = { name: personName, hours: 0, earnings: 0, unpaid: 0, currency: acc.currency }
      }
      byPerson[personKey].hours += entry.hours
      byPerson[personKey].earnings += earnings
      if (!entry.paid) byPerson[personKey].unpaid += earnings
    }

    return { totalHours, totalEarnings, totalUnpaid, byAccount, byPerson }
  }, [entries])

  const accountRows = Object.values(byAccount).sort((a, b) => b.earnings - a.earnings)
  const personRows = Object.entries(byPerson).sort((a, b) => b[1].earnings - a[1].earnings)

  return (
    <div>
      <h1 className="page-title">Dashboard</h1>
      <p className="page-sub">Hours and earnings across every account you're part of.</p>

      <div className="range-tabs">
        {RANGES.map((r) => (
          <button key={r.key} className={range === r.key ? 'active' : ''} onClick={() => setRange(r.key)}>
            {r.label}
          </button>
        ))}
      </div>

      {error && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</p>}

      {loading ? (
        <p className="empty-state">Loading...</p>
      ) : entries.length === 0 ? (
        <p className="empty-state">No entries in this range yet.</p>
      ) : (
        <>
          <div className="stat-grid">
            <div className="stat-card">
              <div className="label">Total hours</div>
              <div className="value">{totalHours.toFixed(1)}h</div>
            </div>
            <div className="stat-card">
              <div className="label">Total earnings</div>
              <div className="value">{totalEarnings.toFixed(2)}</div>
            </div>
            <div className="stat-card unpaid">
              <div className="label">Unpaid</div>
              <div className="value">{totalUnpaid.toFixed(2)}</div>
            </div>
          </div>

          <div className="section-title">By account</div>
          {accountRows.map((acc) => (
            <div className="card" style={{ padding: 0, marginBottom: 14 }} key={acc.name}>
              <div className="breakdown-row" style={{ borderBottom: '1px solid var(--border)' }}>
                <div>
                  <div className="breakdown-name">{acc.name}</div>
                  <div className="breakdown-sub">{acc.hours.toFixed(1)}h total</div>
                </div>
                <div className="breakdown-value">
                  <div className="earnings">
                    {acc.currency}
                    {acc.earnings.toFixed(2)}
                  </div>
                  {acc.unpaid > 0 && (
                    <div className="hours" style={{ color: 'var(--amber)' }}>
                      {acc.currency}
                      {acc.unpaid.toFixed(2)} unpaid
                    </div>
                  )}
                </div>
              </div>
              {Object.values(acc.people).map((p) => (
                <div className="breakdown-row" key={p.name} style={{ paddingLeft: 24 }}>
                  <div>
                    <div className="breakdown-sub" style={{ fontSize: 13, color: 'var(--text)' }}>
                      {p.name}
                    </div>
                    <div className="breakdown-sub">{p.hours.toFixed(1)}h</div>
                  </div>
                  <div className="breakdown-value">
                    <div className="earnings" style={{ fontSize: 13 }}>
                      {acc.currency}
                      {p.earnings.toFixed(2)}
                    </div>
                    {p.unpaid > 0 && (
                      <div className="hours" style={{ color: 'var(--amber)' }}>
                        {acc.currency}
                        {p.unpaid.toFixed(2)} owed
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ))}

          {personRows.length > 1 && (
          <>
          <div className="section-title">By person, across accounts</div>
          <div className="card" style={{ padding: 0 }}>
            {personRows.map(([id, row]) => (
              <div className="breakdown-row" key={id}>
                <div>
                  <div className="breakdown-name">{id === myId ? 'Me' : row.name}</div>
                  <div className="breakdown-sub">{row.hours.toFixed(1)}h logged</div>
                </div>
                <div className="breakdown-value">
                  <div className="earnings">
                    {row.currency}
                    {row.earnings.toFixed(2)}
                  </div>
                  {row.unpaid > 0 && (
                    <div className="hours" style={{ color: 'var(--amber)' }}>
                      {row.currency}
                      {row.unpaid.toFixed(2)} owed
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          </>
          )}
        </>
      )}
    </div>
  )
}
