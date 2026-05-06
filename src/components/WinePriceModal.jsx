import { useState, useEffect } from 'react'
import { useEscapeKey } from '../lib/hooks.js'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts'
import { getItemPriceHistory, addPriceHistory, deletePriceHistory, updateItem } from '../lib/api.js'
import { fmt } from '../lib/utils.js'
import { useToast } from './Toast.jsx'

function isoToDateInput(isoStr) {
  return isoStr ? new Date(isoStr).toISOString().split('T')[0] : ''
}

function todayInput() {
  return new Date().toISOString().split('T')[0]
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 12px' }}>
      <div style={{ fontSize: 11, color: 'var(--mut)', marginBottom: 3 }}>{label}</div>
      <div style={{ fontFamily: 'JetBrains Mono', fontSize: 14, color: 'var(--wine)' }}>{fmt(payload[0].value)}</div>
    </div>
  )
}

export default function WinePriceModal({ item, userId, onClose, onItemUpdate }) {
  const toast = useToast()
  useEscapeKey(onClose)
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)

  // Log form state
  const [price, setPrice] = useState('')
  const [date, setDate] = useState(todayInput())
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadHistory()
  }, [item.id])

  async function loadHistory() {
    setLoading(true)
    try {
      const rows = await getItemPriceHistory(item.id)
      const wine = rows.filter(r => r.source === 'manual-wine')
      setEntries(wine)
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  // Returns the item's value updated to the latest price entry
  function latestPrice(updatedEntries) {
    if (!updatedEntries.length) return null
    const sorted = [...updatedEntries].sort(
      (a, b) => new Date(b.recorded_at) - new Date(a.recorded_at)
    )
    return sorted[0].price
  }

  async function handleLog(e) {
    e.preventDefault()
    const p = parseFloat(price)
    if (isNaN(p) || p <= 0) return
    setSaving(true)
    try {
      await addPriceHistory({
        item_id: item.id,
        price: p,
        source: 'manual-wine',
        user_id: userId,
        recorded_at: new Date(date + 'T12:00:00').toISOString(),
      })

      // Re-fetch, then sync item.value to latest
      const rows = await getItemPriceHistory(item.id)
      const wine = rows.filter(r => r.source === 'manual-wine')
      setEntries(wine)

      const latest = latestPrice(wine)
      if (latest != null) {
        const updated = await updateItem(item.id, { value: latest })
        onItemUpdate?.(updated)
      }

      setPrice('')
      toast(`Logged ${fmt(p)} for ${new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`, 'success')
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(entry) {
    try {
      await deletePriceHistory(entry.id)
      const remaining = entries.filter(e => e.id !== entry.id)
      setEntries(remaining)

      // Update item.value to the new latest (or 0 if no entries left)
      const latest = latestPrice(remaining)
      const updated = await updateItem(item.id, { value: latest ?? 0 })
      onItemUpdate?.(updated)

      toast('Entry removed', 'success')
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  // Chart data — one point per calendar date, latest price per day
  const chartData = (() => {
    if (!entries.length) return []
    const byDate = {}
    for (const e of entries) {
      const d = new Date(e.recorded_at).toISOString().split('T')[0]
      byDate[d] = e.price
    }
    return Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([d, p]) => ({
        date: new Date(d).toLocaleDateString('en-GB', { month: 'short', day: 'numeric', year: '2-digit' }),
        price: p,
      }))
  })()

  const sortedEntries = [...entries].sort(
    (a, b) => new Date(b.recorded_at) - new Date(a.recorded_at)
  )

  const firstPrice = entries.length ? [...entries].sort((a, b) => new Date(a.recorded_at) - new Date(b.recorded_at))[0].price : null
  const lastPrice = latestPrice(entries)
  const pnl = firstPrice && lastPrice ? ((lastPrice - firstPrice) / firstPrice) * 100 : null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 600 }} onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>×</button>
        <div className="modal-title" style={{ color: 'var(--wine)' }}>
          Price History
        </div>
        <div style={{ fontSize: 13, color: 'var(--mut)', marginBottom: 16, marginTop: -12 }}>
          {item.name}
          {item.metadata?.vintage ? ` · ${item.metadata.vintage}` : ''}
          {item.metadata?.producer ? ` · ${item.metadata.producer}` : ''}
        </div>

        {/* ── Log New Price ────────────────────────────────────────────────── */}
        <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 16px', marginBottom: 20 }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--mut)', marginBottom: 10, fontWeight: 600 }}>
            Log Price
          </div>
          <form onSubmit={handleLog} style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
              <label className="form-label">Price (€)</label>
              <input
                className="form-input mono"
                type="number"
                step="0.01"
                min="0.01"
                required
                value={price}
                onChange={e => setPrice(e.target.value)}
                placeholder="0.00"
                autoFocus
              />
            </div>
            <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
              <label className="form-label">Date</label>
              <input
                className="form-input"
                type="date"
                value={date}
                max={todayInput()}
                onChange={e => setDate(e.target.value)}
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary"
              style={{ background: 'var(--wine)', flexShrink: 0 }}
              disabled={saving}
            >
              {saving ? <span className="loading-spin" /> : 'Log'}
            </button>
          </form>
          <div style={{ fontSize: 11, color: 'var(--mut)', marginTop: 8 }}>
            You can backfill historical prices by setting an earlier date. The most recent entry always becomes the current portfolio value.
          </div>
        </div>

        {loading ? (
          <div className="page-loading" style={{ height: 100 }}>
            <span className="loading-spin" /> Loading history…
          </div>
        ) : entries.length === 0 ? (
          <div className="empty-state" style={{ padding: '30px 0' }}>
            <div className="empty-state-icon">📈</div>
            <div className="empty-state-text">No price history yet.</div>
            <div className="empty-state-sub">Log your first entry above to start tracking.</div>
          </div>
        ) : (
          <>
            {/* ── Summary stats ──────────────────────────────────────────── */}
            <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
              <div style={{ flex: 1, background: 'var(--bg3)', borderRadius: 6, padding: '10px 14px' }}>
                <div style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--mut)', letterSpacing: '0.07em' }}>Current</div>
                <div style={{ fontFamily: 'JetBrains Mono', fontSize: 18, fontWeight: 600, color: 'var(--wine)' }}>{fmt(lastPrice)}</div>
              </div>
              <div style={{ flex: 1, background: 'var(--bg3)', borderRadius: 6, padding: '10px 14px' }}>
                <div style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--mut)', letterSpacing: '0.07em' }}>First logged</div>
                <div style={{ fontFamily: 'JetBrains Mono', fontSize: 18, fontWeight: 600 }}>{fmt(firstPrice)}</div>
              </div>
              {pnl != null && (
                <div style={{ flex: 1, background: 'var(--bg3)', borderRadius: 6, padding: '10px 14px' }}>
                  <div style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--mut)', letterSpacing: '0.07em' }}>All-time</div>
                  <div style={{ fontFamily: 'JetBrains Mono', fontSize: 18, fontWeight: 600, color: pnl >= 0 ? 'var(--grn)' : 'var(--red)' }}>
                    {pnl >= 0 ? '+' : ''}{pnl.toFixed(1)}%
                  </div>
                </div>
              )}
            </div>

            {/* ── Chart ──────────────────────────────────────────────────── */}
            {chartData.length >= 2 && (
              <div style={{ marginBottom: 20 }}>
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10, fill: 'var(--mut)', fontFamily: 'JetBrains Mono' }}
                      axisLine={false} tickLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: 'var(--mut)', fontFamily: 'JetBrains Mono' }}
                      axisLine={false} tickLine={false}
                      tickFormatter={v => `€${v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v}`}
                      width={54}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Line
                      type="monotone"
                      dataKey="price"
                      stroke="var(--wine)"
                      strokeWidth={2}
                      dot={{ fill: 'var(--wine)', r: 3 }}
                      activeDot={{ r: 5, fill: 'var(--wine)' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* ── Timeline list ───────────────────────────────────────────── */}
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--mut)', fontWeight: 600, marginBottom: 8 }}>
              All Entries
            </div>
            <div style={{ maxHeight: 240, overflowY: 'auto', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8 }}>
              {sortedEntries.map((entry, idx) => {
                const isLatest = idx === 0
                const prevPrice = idx < sortedEntries.length - 1 ? sortedEntries[idx + 1].price : null
                const change = prevPrice != null ? ((entry.price - prevPrice) / prevPrice) * 100 : null
                return (
                  <div
                    key={entry.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '9px 14px',
                      borderBottom: idx < sortedEntries.length - 1 ? '1px solid var(--border)' : 'none',
                      background: isLatest ? 'rgba(196,69,105,0.05)' : 'transparent',
                    }}
                  >
                    {/* Timeline dot */}
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: isLatest ? 'var(--wine)' : 'var(--mut)', flexShrink: 0, marginRight: 12 }} />

                    {/* Date */}
                    <span style={{ fontSize: 12, color: 'var(--mut)', width: 90, flexShrink: 0, fontFamily: 'JetBrains Mono' }}>
                      {new Date(entry.recorded_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>

                    {/* Price */}
                    <span style={{ fontFamily: 'JetBrains Mono', fontSize: 14, fontWeight: isLatest ? 600 : 400, color: isLatest ? 'var(--wine)' : 'var(--txt)', flex: 1 }}>
                      {fmt(entry.price)}
                    </span>

                    {/* Change vs previous */}
                    {change != null && (
                      <span style={{
                        fontFamily: 'JetBrains Mono',
                        fontSize: 12,
                        color: change >= 0 ? 'var(--grn)' : 'var(--red)',
                        marginRight: 12,
                        width: 60,
                        textAlign: 'right',
                      }}>
                        {change >= 0 ? '+' : ''}{change.toFixed(1)}%
                      </span>
                    )}

                    {/* Latest badge */}
                    {isLatest && (
                      <span className="badge badge-auto" style={{ marginRight: 8, flexShrink: 0 }}>Current</span>
                    )}

                    {/* Delete */}
                    <button
                      className="btn-icon danger"
                      title="Delete entry"
                      onClick={() => handleDelete(entry)}
                      style={{ flexShrink: 0 }}
                    >
                      ✕
                    </button>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
