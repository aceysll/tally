import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { getEntries, markPeriodPaid } from '../lib/api.js'
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
  const [notice, setNotice] = useState('')
  const [markingKey, setMarkingKey] = useState(null)

  const period = useMemo(
    () => describePeriod(range, offset, customStart, customEnd),
    [range, offset, customStart, customEnd]
  )
  const badRange = range === 'custom' && customStart && customEnd && customStart > customEnd

  async function load() {
    if (badRange) {
      setEntries([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    try {
      const {
        data: { user }
      } = await supabase.auth.getUser()
      setMyId(user.id)
      const params = {}
      if (period.start) params.start = period.start
      if (period.end) params.end = period.end
      const ents = await getEntries(params)
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
  }, [period.start, period.end, badRange])

  const { mineHours, mine, owedToOthers, byAccount, byPerson } = useMemo(() => {
    let mineHours = 0
    const mine = {} // currency -> { earnings, unpaid }
    const owedToOthers = {} // currency -> { earnings, unpaid }
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
      const isMine = entry.worked_by === myId

      if (isMine) {
        mineHours += hours
        bump(mine, acc.currency, earnings, entry.paid)
      } else {
        bump(owedToOthers, acc.currency, earnings, entry.paid)
      }

      if (!byAccount[acc.id]) {
        byAccount[acc.id] = {
          id: acc.id,
          name: acc.name,
          currency: acc.currency,
          ownerId: acc.owner_id,
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

    return { mineHours, mine, owedToOthers, byAccount, byPerson }
  }, [entries, myId])

  async function handleMarkPaid(accountId, profileId) {
    const key = `${accountId}:${profileId}`
    setMarkingKey(key)
    setError('')
    setNotice('')
    try {
      const result = await markPeriodPaid(accountId, profileId, period.start, period.end)
      setNotice(`Marked ${result.updated} ${result.updated === 1 ? 'entry' : 'entries'} as paid`)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setMarkingKey(null)
    }
  }

  const mineCurrencies = Object.keys(mine)
  const oweCurrencies = Object.keys(owedToOthers)
  const anyOwed = oweCurrencies.some((c) => owedToOthers[c].unpaid > 0)
  const accountRows = Object.values(byAccount)
  const personRows = Object.entries(byPerson)
  const stepping = range === 'week' || range === 'month'

  return (
    <div>
      <h1 className="page-title">Dashboard</h1>
      <p className="page-sub">Your own hours and earnings, separate from what you owe out to others.</p>

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
      {notice && <p style={{ color: 'var(--mint)', fontSize: 13 }}>{notice}</p>}
      {error && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</p>}

      {loading ? (
        <p className="empty-state">Loading...</p>
      ) : entries.length === 0 ? (
        <p className="empty-state">No entries in this period.</p>
      ) : (
        <>
          <div className="stat-grid">
            <div className="stat-card primary">
              <div className="label">Your balance (unpaid to you)</div>
              {mineCurrencies.filter((c) => mine[c].unpaid > 0).length === 0 ? (
                <div className="value">{money(mineCurrencies[0] || '$', 0)}</div>
              ) : (
                mineCurrencies
                  .filter((c) => mine[c].unpaid > 0)
                  .map((c) => (
                    <div className="value" key={c}>
                      {money(c, mine[c].unpaid)}
                    </div>
                  ))
              )}
            </div>

            <div className="stat-card">
              <div className="label">Total earned this period</div>
              {mineCurrencies.length === 0 ? (
                <div className="value">{money('$', 0)}</div>
              ) : (
                mineCurrencies.map((c) => (
                  <div className="value" key={c} style={mineCurrencies.length > 1 ? { fontSize: 18 } : undefined}>
                    {money(c, mine[c].earnings)}
                  </div>
                ))
              )}
            </div>

            <div className="stat-card">
              <div className="label">Hours logged</div>
              <div className="value">{mineHours.toFixed(1)}h</div>
            </div>

            {anyOwed && (
              <div className="stat-card unpaid">
                <div className="label">You owe others (unpaid)</div>
                {oweCurrencies
                  .filter((c) => owedToOthers[c].unpaid > 0)
                  .map((c) => (
                    <div className="value" key={c} style={{ fontSize: 18 }}>
                      {money(c, owedToOthers[c].unpaid)}
                    </div>
                  ))}
              </div>
            )}
          </div>

          <div className="section-title">By account</div>
          {accountRows.map((acc) => {
            const isOwner = acc.ownerId === myId
            return (
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
                {Object.entries(acc.people).map(([profileId, p]) => {
                  const isSelf = profileId === myId
                  const key = `${acc.id}:${profileId}`
                  const marking = markingKey === key
                  return (
                    <div className="breakdown-row" key={profileId} style={{ paddingLeft: 24 }}>
                      <div>
                        <div className="breakdown-sub" style={{ fontSize: 13, color: 'var(--text)' }}>
                          {isSelf ? 'Me' : p.name}
                        </div>
                        <div className="breakdown-sub">{p.hours.toFixed(1)}h</div>
                      </div>
                      <div className="breakdown-value" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div>
                          <div className="earnings" style={{ fontSize: 13 }}>
                            {money(acc.currency, p.earnings)}
                          </div>
                          {p.unpaid > 0 && (
                            <div className="hours" style={{ color: 'var(--amber)' }}>
                              {money(acc.currency, p.unpaid)} {isSelf ? 'owed' : 'you owe'}
                            </div>
                          )}
                        </div>
                        {isOwner && p.unpaid > 0 && range !== 'all' && (
                          <button
                            className="btn-ghost"
                            style={{ fontSize: 11, padding: '4px 8px' }}
                            disabled={marking}
                            onClick={() => handleMarkPaid(acc.id, profileId)}
                          >
                            {marking ? '...' : 'Mark paid'}
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}

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
                              {money(c, m.unpaid)} {id === myId ? 'owed' : 'owed by you'}
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
