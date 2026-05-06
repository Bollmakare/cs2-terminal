import { useState } from 'react'
import { updateItem } from '../lib/api.js'
import { fmt } from '../lib/utils.js'
import { useToast } from './Toast.jsx'
import { useEscapeKey } from '../lib/hooks.js'

function todayInput() {
  return new Date().toISOString().split('T')[0]
}

function blankEntry(type) {
  return { id: crypto.randomUUID(), type, date: todayInput(), qty: '', price: '', source: '', text: '' }
}

export default function ItemLedgerModal({ item, onClose, onItemUpdate }) {
  const toast = useToast()
  useEscapeKey(onClose)
  const [entries, setEntries] = useState(() => [...(item.metadata?.ledger ?? [])].sort((a, b) => b.date.localeCompare(a.date)))
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)

  function setF(key, val) {
    setForm(prev => ({ ...prev, [key]: val }))
  }

  async function handleAdd(e) {
    e.preventDefault()
    if (!form) return
    setSaving(true)
    try {
      const entry = {
        id: form.id,
        type: form.type,
        date: form.date,
        ...(form.type === 'buy' ? {
          qty: form.qty !== '' ? parseFloat(form.qty) : null,
          price: form.price !== '' ? parseFloat(form.price) : null,
          source: form.source.trim() || null,
          text: form.text.trim() || null,
        } : {
          text: form.text.trim(),
        }),
      }
      const updated = [...entries, entry].sort((a, b) => b.date.localeCompare(a.date))
      const saved = await updateItem(item.id, { metadata: { ...item.metadata, ledger: updated } })
      setEntries(updated)
      onItemUpdate?.(saved)
      setForm(null)
      toast('Entry saved', 'success')
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    try {
      const updated = entries.filter(e => e.id !== id)
      const saved = await updateItem(item.id, { metadata: { ...item.metadata, ledger: updated } })
      setEntries(updated)
      onItemUpdate?.(saved)
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 540 }} onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>×</button>
        <div className="modal-title">Notebook</div>
        <div style={{ fontSize: 13, color: 'var(--mut)', marginBottom: 20, marginTop: -12 }}>{item.name}</div>

        {!form && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setForm(blankEntry('buy'))}>+ Log Purchase</button>
            <button className="btn btn-secondary btn-sm" onClick={() => setForm(blankEntry('note'))}>+ Add Note</button>
          </div>
        )}

        {form && (
          <form onSubmit={handleAdd} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 16px', marginBottom: 20 }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--mut)', fontWeight: 600, marginBottom: 12 }}>
              {form.type === 'buy' ? 'Log Purchase' : 'Add Note'}
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <div className="form-group" style={{ width: 140, marginBottom: 10 }}>
                <label className="form-label">Date</label>
                <input className="form-input" type="date" value={form.date} max={todayInput()} onChange={e => setF('date', e.target.value)} />
              </div>

              {form.type === 'buy' && <>
                <div className="form-group" style={{ width: 80, marginBottom: 10 }}>
                  <label className="form-label">Qty</label>
                  <input className="form-input mono" type="number" min="1" step="1" value={form.qty}
                    onChange={e => setF('qty', e.target.value)} placeholder="10" />
                </div>
                <div className="form-group" style={{ width: 100, marginBottom: 10 }}>
                  <label className="form-label">Price (€)</label>
                  <input className="form-input mono" type="number" min="0" step="0.01" value={form.price}
                    onChange={e => setF('price', e.target.value)} placeholder="8.00" />
                </div>
                <div className="form-group" style={{ flex: 1, minWidth: 120, marginBottom: 10 }}>
                  <label className="form-label">Source / Platform</label>
                  <input className="form-input" value={form.source}
                    onChange={e => setF('source', e.target.value)} placeholder="Steam Market, eBay, Systembolaget…" />
                </div>
              </>}
            </div>

            <div className="form-group" style={{ marginBottom: 10 }}>
              <label className="form-label">{form.type === 'buy' ? 'Notes (optional)' : 'Note'}</label>
              <textarea
                className="form-textarea"
                rows={2}
                value={form.text}
                onChange={e => setF('text', e.target.value)}
                required={form.type === 'note'}
                placeholder={form.type === 'buy'
                  ? 'e.g. paid €50 shipping, came with trade lock, part of a lot…'
                  : 'Anything worth remembering about this item…'}
              />
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setForm(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
                {saving ? <span className="loading-spin" /> : 'Save'}
              </button>
            </div>
          </form>
        )}

        {entries.length === 0 ? (
          <div className="empty-state" style={{ padding: '30px 0' }}>
            <div className="empty-state-icon">📓</div>
            <div className="empty-state-text">No entries yet.</div>
            <div className="empty-state-sub">Log a purchase or add a note above.</div>
          </div>
        ) : (
          <div style={{ maxHeight: 360, overflowY: 'auto', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8 }}>
            {entries.map((entry, idx) => (
              <div key={entry.id} style={{
                display: 'flex', alignItems: 'flex-start', padding: '10px 14px',
                borderBottom: idx < entries.length - 1 ? '1px solid var(--border)' : 'none',
              }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: entry.type === 'buy' ? 'var(--grn)' : 'var(--mut)', flexShrink: 0, marginRight: 12, marginTop: 5 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                    <span style={{ fontSize: 11, color: 'var(--mut)', fontFamily: 'JetBrains Mono' }}>
                      {new Date(entry.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                    <span className={`badge ${entry.type === 'buy' ? 'badge-auto' : 'badge-manual'}`} style={{ fontSize: 9 }}>
                      {entry.type === 'buy' ? 'BUY' : 'NOTE'}
                    </span>
                  </div>
                  {entry.type === 'buy' && (
                    <div style={{ fontSize: 13, fontFamily: 'JetBrains Mono', marginBottom: entry.text ? 3 : 0 }}>
                      {entry.qty != null ? `${entry.qty}×` : ''}
                      {entry.price != null ? ` ${fmt(entry.price)}` : ''}
                      {entry.source ? <span style={{ color: 'var(--mut)', fontFamily: 'inherit', fontSize: 12 }}> — {entry.source}</span> : ''}
                    </div>
                  )}
                  {entry.text && (
                    <div style={{ fontSize: 12, color: entry.type === 'note' ? 'var(--txt)' : 'var(--mut)', lineHeight: 1.5 }}>
                      {entry.text}
                    </div>
                  )}
                </div>
                <button className="btn-icon danger" title="Delete" onClick={() => handleDelete(entry.id)} style={{ flexShrink: 0, marginLeft: 8 }}>✕</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
