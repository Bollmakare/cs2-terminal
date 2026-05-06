import { useState, useEffect, useMemo } from 'react'
import { getSoldItems, deleteSoldItem } from '../lib/api.js'
import { fmt, fmts, pct } from '../lib/utils.js'
import { useToast } from '../components/Toast.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'

const WEAR_COLOR = { FN: 'badge-fn', MW: 'badge-mw', FT: 'badge-ft', WW: 'badge-ww', BS: 'badge-bs' }

export default function SoldView() {
  const toast = useToast()
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [deleteTarget, setDeleteTarget] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      setEntries(await getSoldItems())
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    try {
      await deleteSoldItem(deleteTarget.id)
      setEntries(prev => prev.filter(e => e.id !== deleteTarget.id))
      toast('Entry removed', 'success')
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setDeleteTarget(null)
    }
  }

  const filtered = useMemo(() =>
    filter === 'all' ? entries : entries.filter(e => e.vertical === filter),
    [entries, filter]
  )

  const stats = useMemo(() => {
    const totalRevenue = entries.reduce((s, e) => s + e.sale_price * e.qty, 0)
    const totalCost = entries.reduce((s, e) => s + (e.cost ?? 0) * e.qty, 0)
    const totalPnl = totalRevenue - totalCost
    const totalQty = entries.reduce((s, e) => s + e.qty, 0)
    const best = entries.reduce((b, e) => {
      if (!e.cost || e.cost === 0) return b
      const p = ((e.sale_price - e.cost) / e.cost) * 100
      return (!b || p > b._pct) ? { ...e, _pct: p } : b
    }, null)
    return { totalRevenue, totalCost, totalPnl, totalQty, best }
  }, [entries])

  return (
    <div>
      <div className="view-header">
        <div className="view-title">Sold Items</div>
      </div>

      {entries.length > 0 && (
        <>
          <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
            {[
              { label: 'Items Sold', value: stats.totalQty },
              { label: 'Total Revenue', value: fmt(stats.totalRevenue) },
              { label: 'Realized P&L', value: fmts(stats.totalPnl), color: stats.totalPnl >= 0 ? 'var(--grn)' : 'var(--red)' },
              ...(stats.best ? [{ label: 'Best Sale', value: stats.best.item_name.split('|')[1]?.trim() ?? stats.best.item_name, sub: `+${stats.best._pct.toFixed(1)}%` }] : []),
            ].map(s => (
              <div key={s.label} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 18px', minWidth: 120 }}>
                <div style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--mut)', letterSpacing: '0.07em', marginBottom: 4 }}>{s.label}</div>
                <div style={{ fontFamily: 'JetBrains Mono', fontSize: 20, fontWeight: 600, color: s.color ?? 'var(--txt)' }}>{s.value}</div>
                {s.sub && <div style={{ fontSize: 11, color: 'var(--grn)' }}>{s.sub}</div>}
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            {['all', 'cs2', 'pokemon'].map(v => (
              <button
                key={v}
                className={`btn btn-sm ${filter === v ? 'btn-primary' : 'btn-secondary'}`}
                style={filter === v && v === 'cs2' ? { background: 'var(--cs)' } : filter === v && v === 'pokemon' ? { background: 'var(--pkm)', color: '#000' } : {}}
                onClick={() => setFilter(v)}
              >
                {v === 'all' ? 'All' : v === 'cs2' ? 'CS2' : 'Pokémon'}
              </button>
            ))}
          </div>
        </>
      )}

      {loading ? (
        <div className="page-loading" style={{ height: 200 }}><span className="loading-spin" /> Loading…</div>
      ) : entries.length === 0 ? (
        <div className="empty-state" style={{ padding: '60px 0' }}>
          <div className="empty-state-icon">💰</div>
          <div className="empty-state-text">No sales recorded yet.</div>
          <div className="empty-state-sub">When you sell a skin or card, it will appear here — forever.</div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state" style={{ padding: '40px 0' }}>
          <div className="empty-state-text">No {filter} sales yet.</div>
        </div>
      ) : (
        <div>
          {filtered.map(entry => {
            const thumb = entry.metadata?.images?.[0]
            const realizedPnl = entry.cost != null ? (entry.sale_price - entry.cost) * entry.qty : null
            const realizedPct = entry.cost && entry.cost > 0 ? ((entry.sale_price - entry.cost) / entry.cost) * 100 : null
            const vsMarketPct = entry.value_at_sale && entry.value_at_sale > 0
              ? ((entry.sale_price - entry.value_at_sale) / entry.value_at_sale) * 100
              : null
            const pnlColor = realizedPnl == null ? 'var(--mut)' : realizedPnl >= 0 ? 'var(--grn)' : 'var(--red)'
            const vColor = entry.vertical === 'cs2' ? 'var(--cs)' : 'var(--pkm)'

            return (
              <div key={entry.id} style={{
                background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8,
                padding: '14px 16px', display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 8,
              }}>
                {thumb
                  ? <img src={thumb} alt="" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />
                  : <div style={{ width: 44, height: 44, background: 'var(--bg3)', borderRadius: 4, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: vColor }}>
                      {entry.vertical === 'cs2' ? '🔫' : '🃏'}
                    </div>
                }

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
                    <span style={{ fontWeight: 600, fontSize: 15 }}>{entry.item_name}</span>
                    <span className="badge" style={{ background: vColor, color: entry.vertical === 'pokemon' ? '#000' : '#0b0d12', fontSize: 9 }}>
                      {entry.vertical === 'cs2' ? 'CS2' : 'PKM'}
                    </span>
                    {entry.qty > 1 && <span className="badge badge-manual">×{entry.qty}</span>}
                    {entry.metadata?.wear && (
                      <span className={`badge ${WEAR_COLOR[entry.metadata.wear] ?? ''}`}>{entry.metadata.wear}</span>
                    )}
                    {entry.metadata?.grade && entry.metadata.grade !== 'Ungraded' && (
                      <span className="badge badge-auto" style={{ fontSize: 9 }}>{entry.metadata.grade}</span>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 4 }}>
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--mut)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Sold for</div>
                      <div style={{ fontFamily: 'JetBrains Mono', fontSize: 14, fontWeight: 600, color: vColor }}>{fmt(entry.sale_price)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--mut)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Paid</div>
                      <div style={{ fontFamily: 'JetBrains Mono', fontSize: 14 }}>{entry.cost != null ? fmt(entry.cost) : '—'}</div>
                    </div>
                    {realizedPnl != null && (
                      <div>
                        <div style={{ fontSize: 10, color: 'var(--mut)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Realized</div>
                        <div style={{ fontFamily: 'JetBrains Mono', fontSize: 14, fontWeight: 600, color: pnlColor }}>
                          {fmts(realizedPnl)}
                          {realizedPct != null && <span style={{ fontSize: 11, marginLeft: 4 }}>({realizedPct >= 0 ? '+' : ''}{realizedPct.toFixed(1)}%)</span>}
                        </div>
                      </div>
                    )}
                    {vsMarketPct != null && (
                      <div>
                        <div style={{ fontSize: 10, color: 'var(--mut)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>vs Market</div>
                        <div style={{ fontFamily: 'JetBrains Mono', fontSize: 14, color: vsMarketPct >= 0 ? 'var(--grn)' : 'var(--red)' }}>
                          {vsMarketPct >= 0 ? '+' : ''}{vsMarketPct.toFixed(1)}%
                        </div>
                      </div>
                    )}
                  </div>

                  {entry.notes && (
                    <div style={{ fontSize: 12, color: 'var(--mut)', marginTop: 6 }}>{entry.notes}</div>
                  )}
                </div>

                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 11, color: 'var(--mut)' }}>
                    {new Date(entry.sold_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </div>
                  <button className="btn-icon danger" title="Remove from log" onClick={() => setDeleteTarget(entry)} style={{ marginTop: 8 }}>✕</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Remove entry"
          message={`Remove "${deleteTarget.item_name}" from your sold history? This cannot be undone.`}
          dangerous
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}
