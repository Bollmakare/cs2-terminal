export function fmt(n) {
  if (n == null || isNaN(n)) return '€—'
  return '€' + Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function fmts(n) {
  if (n == null || isNaN(n)) return '€—'
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1_000_000) return sign + '€' + (abs / 1_000_000).toFixed(1) + 'M'
  if (abs >= 1_000) return sign + '€' + (abs / 1_000).toFixed(1) + 'k'
  return sign + '€' + abs.toFixed(0)
}

export function pct(n) {
  if (n == null || isNaN(n)) return '—%'
  return (n >= 0 ? '+' : '') + Number(n).toFixed(1) + '%'
}

export function sgn(n) {
  return n >= 0 ? 'pos' : 'neg'
}

export function ago(dateStr) {
  if (!dateStr) return 'never'
  const ms = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(ms / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

export function slp(ms) {
  return new Promise(r => setTimeout(r, ms))
}

export function effectiveValue(item) {
  if (item.last_price_fetched_at) return item.value ?? 0
  return item.value > 0 ? item.value : item.cost ?? 0
}

export function calcPnl(cost, value, qty = 1) {
  const invested = cost * qty
  const current = value * qty
  const abs = current - invested
  const pct = invested > 0 ? (abs / invested) * 100 : 0
  return { invested, current, abs, pct }
}

export function greetingTime() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

export function holdDuration(createdAt) {
  if (!createdAt) return null
  const days = Math.floor((Date.now() - new Date(createdAt)) / 86400000)
  if (days < 1) return '<1d'
  if (days < 30) return `${days}d`
  if (days < 365) return `${Math.floor(days / 30)}mo`
  const y = Math.floor(days / 365)
  const m = Math.floor((days % 365) / 30)
  return m > 0 ? `${y}y ${m}mo` : `${y}y`
}

export function annualizedReturn(cost, value, createdAt) {
  if (!cost || cost <= 0 || !value || value <= 0 || !createdAt) return null
  const days = (Date.now() - new Date(createdAt)) / 86400000
  if (days < 30) return null
  return (Math.pow(value / cost, 365 / days) - 1) * 100
}

export function csvEscape(v) {
  if (v == null) return ''
  const s = String(v)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return '"' + s.replace(/"/g, '""') + '"'
  return s
}

export function downloadCsv(rows, filename) {
  if (!rows.length) return
  const headers = Object.keys(rows[0])
  const lines = [headers.join(','), ...rows.map(r => headers.map(h => csvEscape(r[h])).join(','))]
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
