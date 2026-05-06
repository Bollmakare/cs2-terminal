import { useState } from 'react'
import { fmt, effectiveValue } from '../lib/utils.js'
import { addConsumedItem, updateItem, deleteItem } from '../lib/api.js'
import { useToast } from './Toast.jsx'

function todayInput() {
  return new Date().toISOString().split('T')[0]
}

export default function ConsumeModal({ item, userId, onClose, onConsumed }) {
  const toast = useToast()
  const [qty, setQty] = useState('1')
  const [date, setDate] = useState(todayInput())
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const currentValue = effectiveValue(item)
  const maxQty = item.qty

  async function handleConsume(e) {
    e.preventDefault()
    const q = parseInt(qty, 10)
    if (!q || q < 1 || q > maxQty) return
    setSaving(true)
    try {
      await addConsumedItem({
        user_id: userId,
        item_name: item.name,
        vertical: item.vertical ?? 'wine',
        qty: q,
        value_at_consumption: currentValue,
        cost: item.cost,
        consumed_at: new Date(date + 'T12:00:00').toISOString(),
        notes: notes.trim() || null,
        metadata: {
          producer: item.metadata?.producer ?? null,
          vintage: item.metadata?.vintage ?? null,
          region: item.metadata?.region ?? null,
          appellation: item.metadata?.appellation ?? null,
          format: item.metadata?.format ?? null,
          images: item.metadata?.images ?? [],
        },
      })

      const remaining = maxQty - q
      if (remaining > 0) {
        await updateItem(item.id, { qty: remaining })
      } else {
        await deleteItem(item.id)
      }

      toast(`${q} bottle${q > 1 ? 's' : ''} moved to cellar log`, 'success')
      onConsumed(remaining)
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>×</button>
        <div className="modal-title" style={{ color: 'var(--wine)' }}>Open a Bottle</div>
        <div style={{ fontSize: 13, color: 'var(--mut)', marginBottom: 20, marginTop: -12 }}>
          {item.name}
          {item.metadata?.vintage ? ` · ${item.metadata.vintage}` : ''}
          {item.metadata?.producer ? ` · ${item.metadata.producer}` : ''}
        </div>

        <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: '12px 16px', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--mut)', letterSpacing: '0.07em' }}>Value at Opening</div>
            <div style={{ fontFamily: 'JetBrains Mono', fontSize: 22, fontWeight: 600, color: 'var(--wine)' }}>{fmt(currentValue)}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--mut)', letterSpacing: '0.07em' }}>In Cellar</div>
            <div style={{ fontFamily: 'JetBrains Mono', fontSize: 18 }}>{maxQty} bottle{maxQty !== 1 ? 's' : ''}</div>
          </div>
        </div>

        <form onSubmit={handleConsume}>
          <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
            <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
              <label className="form-label">Bottles to open</label>
              <input
                className="form-input mono"
                type="number"
                min="1"
                max={maxQty}
                required
                value={qty}
                onChange={e => setQty(e.target.value)}
              />
            </div>
            <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
              <label className="form-label">Date opened</label>
              <input
                className="form-input"
                type="date"
                value={date}
                max={todayInput()}
                onChange={e => setDate(e.target.value)}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Tasting notes (optional)</label>
            <textarea
              className="form-textarea"
              rows={3}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Occasion, who you shared it with, how it tasted…"
            />
          </div>

          {parseInt(qty) === maxQty && (
            <div style={{ fontSize: 12, color: 'var(--mut)', background: 'rgba(196,69,105,0.08)', border: '1px solid rgba(196,69,105,0.2)', borderRadius: 6, padding: '8px 12px', marginBottom: 12 }}>
              This is your last bottle — it will be removed from the cellar.
            </div>
          )}

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ background: 'var(--wine)' }} disabled={saving}>
              {saving ? <span className="loading-spin" /> : '🍷 Open'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
