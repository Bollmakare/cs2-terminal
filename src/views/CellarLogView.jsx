import { useState, useEffect } from 'react'
import { getConsumedItems, deleteConsumedItem } from '../lib/api.js'
import { fmt } from '../lib/utils.js'
import { useToast } from '../components/Toast.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'

export default function CellarLogView() {
  const toast = useToast()
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [deleteTarget, setDeleteTarget] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      setEntries(await getConsumedItems())
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    try {
      await deleteConsumedItem(deleteTarget.id)
      setEntries(prev => prev.filter(e => e.id !== deleteTarget.id))
      toast('Entry removed', 'success')
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setDeleteTarget(null)
    }
  }

  const totalBottles = entries.reduce((s, e) => s + e.qty, 0)
  const totalValue = entries.reduce((s, e) => s + (e.value_at_consumption ?? 0) * e.qty, 0)
  const uniqueWines = new Set(entries.map(e => e.item_name)).size

  return (
    <div>
      <div className="view-header">
        <div className="view-title" style={{ color: 'var(--wine)' }}>Cellar Log</div>
      </div>

      {entries.length > 0 && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
          {[
            { label: 'Bottles Consumed', value: totalBottles },
            { label: 'Total Value Consumed', value: fmt(totalValue), color: 'var(--wine)' },
            { label: 'Unique Wines', value: uniqueWines },
          ].map(s => (
            <div key={s.label} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 18px' }}>
              <div style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--mut)', letterSpacing: '0.07em', marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontFamily: 'JetBrains Mono', fontSize: 22, fontWeight: 600, color: s.color ?? 'var(--txt)' }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="page-loading" style={{ height: 200 }}><span className="loading-spin" /> Loading…</div>
      ) : entries.length === 0 ? (
        <div className="empty-state" style={{ padding: '60px 0' }}>
          <div className="empty-state-icon">🍷</div>
          <div className="empty-state-text">Your cellar log is empty.</div>
          <div className="empty-state-sub">Open a bottle from the Wine Cellar — it will appear here forever.</div>
        </div>
      ) : (
        <div>
          {entries.map(entry => {
            const thumb = entry.metadata?.images?.[0]
            const vintage = entry.metadata?.vintage
            const producer = entry.metadata?.producer
            const appellation = entry.metadata?.appellation
            const region = entry.metadata?.region
            return (
              <div key={entry.id} style={{
                background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8,
                padding: '14px 16px', display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 8,
              }}>
                {thumb
                  ? <img src={thumb} alt="" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />
                  : <div style={{ width: 44, height: 44, background: 'var(--bg3)', borderRadius: 4, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🍷</div>
                }

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 2 }}>
                    <span style={{ fontWeight: 600, fontSize: 15 }}>{entry.item_name}</span>
                    {vintage && <span className="mono" style={{ fontSize: 13, color: 'var(--mut)' }}>{vintage}</span>}
                    {entry.qty > 1 && <span className="badge badge-manual">{entry.qty} bottles</span>}
                  </div>
                  {(producer || appellation || region) && (
                    <div style={{ fontSize: 12, color: 'var(--mut)', marginBottom: entry.notes ? 6 : 0 }}>
                      {[producer, appellation ?? region].filter(Boolean).join(' · ')}
                    </div>
                  )}
                  {entry.notes && (
                    <div style={{ fontSize: 13, color: 'var(--txt)', lineHeight: 1.5, fontStyle: 'italic' }}>
                      "{entry.notes}"
                    </div>
                  )}
                </div>

                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  {entry.value_at_consumption != null && (
                    <div style={{ fontFamily: 'JetBrains Mono', fontSize: 15, fontWeight: 600, color: 'var(--wine)', marginBottom: 2 }}>
                      {fmt(entry.value_at_consumption)}
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: 'var(--mut)' }}>
                    {new Date(entry.consumed_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </div>
                  <button className="btn-icon danger" title="Remove from log" onClick={() => setDeleteTarget(entry)} style={{ marginTop: 6 }}>✕</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Remove entry"
          message={`Remove "${deleteTarget.item_name}" from your cellar log? This cannot be undone.`}
          dangerous
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}
