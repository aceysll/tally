import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { getEntries } from '../lib/api.js'
import { toISO, payWeek, formatShort } from '../lib/dates.js'

function money(currency, amount) {
  return `${currency}${Number(amount).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`
}

const RANGES = [
  { key: 'week', label: 'Pay week' },
  { key: 'month', label: 'Month' },
  { key: 'all', label: 'All time' },
  { key: 'custom', label: 'Custom' }
]

function describePeriod(range, offset, customStart, customEnd) {
  if (range === 'week') {
    const { start, end, payDay } = payWeek(offset)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return {
      start: toISO(start),
      end: toISO(end),
      title: `${formatShort(start)} to ${formatShort(end)}`,
      sub: `${payDay >= today ? 'Pays' : 'Paid'} ${formatShort(payDay)}`
    }
  }

  if (range === 'month') {
    const now = new Date()
    const first = new Date(now.getFullYear(), now.getMonth() + offset, 1)
    const last = new Date(first.getFullYear(), first.getMonth() + 1, 0)
    return {
      start: toISO(first),
      end: toISO(last),
      title: first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
      sub: ''
    }
  }

  if (range === 'custom') {
    return { start: customStart || undefined, end: customEnd || undefined, title: 'Custom range', sub: '' }
  }

  return { start: undefined, end: undefined, title: 'All time', sub: '' }
}

export default function Dashboard() {
  const [myId, setMyId] = useState(null)
  const [range, setRange] = useState('week')
  const [offset, setOffset] = useState(0)
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const period = useMemo(
    () => describePeriod(range, offset, customStart, customEnd),
    [range, offset, customStart, customEnd]
  )
  const badRange = range === 'custom' && customStart && customEnd && customStart > customEnd

  useEffect(() => {
    if (badRange) {
      setEntries([])
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError('')

    const params = {}
    if (period.start) params.start = period.start
    if (period.end) params.end = period.end

    supabase.auth
      .getUser()
      .then(async ({ data: { user } }) => {
        const ents = await getEntries(params)
        if (cancelled) return
        setMyId(user.id)
        setEntries(ents)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [period.start, period.end, badRange])

  const { totalHours, totals, byAccount, byPerson } = useMemo(() => {
    let totalHours = 0
    const totals = {} // currency -> { earnings, unpaid }
    const byAccount = {}
    const byPerson = {}

    function bump(bucket, currency, earnings, paid) {
      if (!bucket[currency]) bucket[currency] = { earnings: 0, unpaid: 0 }
      bucket[currency].earnings += earnings
      if (!paid) bucket[currency].unpaid += earnings
    }

    for (const entry of entries) {
      const acc = entry.accounts
      if (!acc) continue
      const hours = Number(entry.hours)
      const earnings = hours * Number(acc.hourly_rate)

      totalHours += hours
      bump(totals, acc.currency, earnings, entry.paid)

      if (!byAccount[acc.id]) {
        byAccount[acc.id] = {
          name: acc.name,
          currency: acc.currency,
          hours: 0,
          earnings: 0,
          unpaid: 0,
          people: {}
        }
      }
      const accRow = byAccount[acc.id]
      accRow.hours += hours
      accRow.earnings += earnings
      if (!entry.paid) accRow.unpaid += earnings

      const personKey = entry.worked_by
      const personName = entry.worked_by_profile?.display_name || 'Someone'

      if (!accRow.people[personKey]) {
        accRow.people[personKey] = { name: personName, hours: 0, earnings: 0, unpaid: 0 }
      }
      accRow.people[personKey].hours += hours
      accRow.people[personKey].earnings += earnings
      if (!entry.paid) accRow.people[personKey].unpaid += earnings

      if (!byPerson[personKey]) {
        byPerson[personKey] = { name: personName, hours: 0, money: {} }
      }
      byPerson[personKey].hours += hours
      bump(byPerson[personKey].money, acc.currency, earnings, entry.paid)
    }

    return { totalHours, totals, byAccount, byPerson }
  }, [entries])

  const currencyKeys = Object.keys(totals)
  const multi = currencyKeys.length > 1
  const accountRows = Object.values(byAccount)
  const personRows = Object.entries(byPerson)
  const anyUnpaid = currencyKeys.some((c) => totals[c].unpaid > 0)
  const stepping = range === 'week' || range === 'month'

  return (
    <div>
      <h1 className="page-title">Dashboard</h1>
      <p className="page-sub">Hours and earnings across every account you're part of.</p>

      <div className="range-tabs" style={{ flexWrap: 'wrap' }}>
        {RANGES.map((r) => (
          <button
            key={r.key}
            className={range === r.key ? 'active' : ''}
            onClick={() => {
              setRange(r.key)
              setOffset(0)
            }}
          >
            {r.label}
          </button>
        ))}
      </div>

      {stepping && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            marginBottom: 20
          }}
        >
          <button className="btn-ghost" onClick={() => setOffset(offset - 1)}>
            ‹ Earlier
          </button>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontWeight: 600, fontSize: 15 }}>{period.title}</div>
            {period.sub && (
              <div className="mono" style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>
                {period.sub}
              </div>
            )}
          </div>
          <button className="btn-ghost" disabled={offset >= 0} onClick={() => setOffset(offset + 1)}>
            Later ›
          </button>
        </div>
      )}

      {range === 'custom' && (
        <div className="form-row" style={{ marginBottom: 20 }}>
          <div className="field">
            <label>From</label>
            <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
          </div>
          <div className="field">
            <label>To</label>
            <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
          </div>
        </div>
      )}

      {badRange && (
        <p style={{ color: 'var(--danger)', fontSize: 13 }}>The "From" date is after the "To" date.</p>
      )}
      {error && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</p>}

      {loading ? (
        <p className="empty-state">Loading...</p>
      ) : entries.length === 0 ? (
        <p className="empty-state">No entries in this period.</p>
      ) : (
        <>
          <div className="stat-grid">
            <div className="stat-card">
              <div className="label">Total hours</div>
              <div className="value">{totalHours.toFixed(1)}h</div>
            </div>
            <div className="stat-card">
              <div className="label">Total earnings</div>
              {currencyKeys.map((c) => (
                <div className="value" key={c} style={multi ? { fontSize: 18 } : undefined}>
                  {money(c, totals[c].earnings)}
                </div>
              ))}
            </div>
            <div className="stat-card unpaid">
              <div className="label">Unpaid</div>
              {anyUnpaid ? (
                currencyKeys
                  .filter((c) => totals[c].unpaid > 0)
                  .map((c) => (
                    <div className="value" key={c} style={multi ? { fontSize: 18 } : undefined}>
                      {money(c, totals[c].unpaid)}
                    </div>
                  ))
              ) : (
                <div className="value">{money(currencyKeys[0] || '$', 0)}</div>
              )}
            </div>
          </div>

          <div className="section-title">By account</div>
          {accountRows.map((acc) => (
            <div className="card" style={{ padding: 0, marginBottom: 14 }} key={acc.name + acc.currency}>
              <div className="breakdown-row" style={{ borderBottom: '1px solid var(--border)' }}>
                <div>
                  <div className="breakdown-name">{acc.name}</div>
                  <div className="breakdown-sub">{acc.hours.toFixed(1)}h total</div>
                </div>
                <div className="breakdown-value">
                  <div className="earnings">{money(acc.currency, acc.earnings)}</div>
                  {acc.unpaid > 0 && (
                    <div className="hours" style={{ color: 'var(--amber)' }}>
                      {money(acc.currency, acc.unpaid)} unpaid
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
                      {money(acc.currency, p.earnings)}
                    </div>
                    {p.unpaid > 0 && (
                      <div className="hours" style={{ color: 'var(--amber)' }}>
                        {money(acc.currency, p.unpaid)} owed
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
                      {Object.entries(row.money).map(([c, m]) => (
                        <div key={c}>
                          <div className="earnings">{money(c, m.earnings)}</div>
                          {m.unpaid > 0 && (
                            <div className="hours" style={{ color: 'var(--amber)' }}>
                              {money(c, m.unpaid)} owed
                            </div>
                          )}
                        </div>
                      ))}
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
