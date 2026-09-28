// Pay cycle: the work week runs Tuesday to Monday, and pay lands on the
// Wednesday after the week ends.
export const WEEK_START_DAY = 2 // 0 = Sunday, 1 = Monday, 2 = Tuesday
export const PAY_DELAY_DAYS = 2 // days after the week's last day

// Local-date formatting. toISOString() uses UTC, which gives the wrong
// day for the first hour after midnight in Nigeria (UTC+1).
export function toISO(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function todayISO() {
  return toISO(new Date())
}

export function isoDaysAgo(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return toISO(d)
}

// offset 0 = the pay week containing today, -1 = the one before, and so on.
export function payWeek(offset = 0) {
  const today = new Date()
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const diff = (start.getDay() - WEEK_START_DAY + 7) % 7
  start.setDate(start.getDate() - diff + offset * 7)

  const end = new Date(start)
  end.setDate(start.getDate() + 6)

  const payDay = new Date(end)
  payDay.setDate(end.getDate() + PAY_DELAY_DAYS)

  return { start, end, payDay }
}

export function formatShort(d) {
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}
