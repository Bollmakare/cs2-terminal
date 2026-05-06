import { useState, useEffect } from 'react'
import { getWishlistItems, addWishlistItem, deleteWishlistItem } from '../lib/api.js'
import { fmt } from '../lib/utils.js'
import { useToast } from '../components/Toast.jsx'
import AddItemModal from '../components/AddItemModal.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import { addItem } from '../lib/api.js'

const VERT_LABELS = { cs2: 'CS2', pokemon: 'Pokémon', wine: 'Wine' }
const VERT_COLORS = { cs2: 'var(--cs)', pokemon: 'var(--pkm)', wine: 'var(--wine)' }

function blankForm() {
  return { vertical: 'cs2', name: '', target_price: '', notes: '' }
}

export default function WishlistView({ userId }) {
  const toast = useToast()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [convertItem, setConvertItem] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try { setItems(await getWishlistItems()) }
    catch (e) { toast(e.message, 'error') }
    finally { setLoading(false) }
  }

  function setF(k, v) { setForm(prev => ({ ...prev, [k]: v })) }

  async function handleAdd(e) {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)
    try {
      const created = await addWishlistItem({
        user_id: userId,
        vertical: form.vertical,
        name: form.name.trim(),
        target_price: form.target_price !== '' ? parseFloat(form.target_price) : null,
        notes: form.notes.trim() || null,
      })
      setItems(prev => [created, ...prev])
      setForm(null)
      toast('Added to wishlist', 'success')
    } catch (err) { toast(err.message, 'error') }
    finally { setSaving(false) }
  }

  async function handleConvertSave(payload) {
    const created = await addItem(payload)
    await deleteWishlistItem(convertItem.id)
    setItems(prev => prev.filter(i => i.id !== convertItem.id))
    toast(`${created.name} added to portfolio`, 'success')
  }

  async function handleDelete() {
    if (!deleteTarget) return
    try {
      await deleteWishlistItem(deleteTarget.id)
      setItems(prev => prev.filter(i => i.id !== deleteTarget.id))
      toast('Removed from wishlist', 'success')
    } catch (err) { toast(err.message, 'error') }
    finally { setDeleteTarget(null) }
  }

  const filtered = filter === 'all' ? items : items.filter(i => i.vertical === filter)

  return (
    <div>
      <div className="view-header">
        <div className="view-title">Wishlist</div>
        <div className="view-actions">
          {!form && (
            <button className="btn btn-primary btn-sm" onClick={() => setForm(blankForm())}>+ Add Item</button>
          )}
        </div>
      </div>

      {form && (
        <form onSubmit={handleAdd} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '16px', marginBottom: 20 }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--mut)', fontWeight: 600, marginBottom: 14 }}>New Wishlist Item</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div className="form-group" style={{ width: 130, marginBottom: 10 }}>
              <label className="form-label">Vertical</label>
              <select className="form-select" value={form.vertical} onChange={e => setF('vertical', e.target.value)}>
                <option value="cs2">CS2</option>
                <option value="pokemon">Pokémon</option>
                <option value="wine">Wine</option>
              </select>
            </div>
            <div className="form-group" style={{ flex: 2, minWidth: 180, marginBottom: 10 }}>
              <label className="form-label">Name</label>
              <input className="form-input" required value={form.name} onChange={e => setF('name', e.target.value)}
                placeholder={form.vertical === 'cs2' ? 'AK-47 | Redline (Field-Tested)' : form.vertical === 'pokemon' ? 'Charizard Base Set' : 'Château Pétrus 2018'} />
            </div>
            <div className="form-group" style={{ width: 120, marginBottom: 10 }}>
              <label className="form-label">Target Price (€)</label>
              <input className="form-input mono" type="number" step="0.01" min="0" value={form.target_price}
                onChange={e => setF('target_price', e.target.value)} placeholder="0.00" />
            </div>
            <div className="form-group" style={{ flex: 2, minWidth: 180, marginBottom: 10 }}>
              <label className="form-label">Notes</label>
              <input className="form-input" value={form.notes} onChange={e => setF('notes', e.target.value)}
                placeholder="Where to find it, why you want it…" />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setForm(null)}>Cancel</button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
              {saving ? <span className="loading-spin" /> : 'Add'}
            </button>
          </div>
        </form>
      )}

      {items.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {['all', 'cs2', 'pokemon', 'wine'].map(v => (
            <button key={v} className={`btn btn-sm ${filter === v ? 'btn-primary' : 'btn-secondary'}`}
              style={filter === v && v !== 'all' ? { background: VERT_COLORS[v], color: v === 'pokemon' ? '#000' : undefined } : {}}
              onClick={() => setFilter(v)}>
              {v === 'all' ? 'All' : VERT_LABELS[v]}
            </button>
          ))}
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--mut)', alignSelf: 'center' }}>
            {filtered.length} item{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      {loading ? (
        <div className="page-loading" style={{ height: 200 }}><span className="loading-spin" /> Loading…</div>
      ) : items.length === 0 ? (
        <div className="empty-state" style={{ padding: '60px 0' }}>
          <div className="empty-state-icon">🎯</div>
          <div className="empty-state-text">Your wishlist is empty.</div>
          <div className="empty-state-sub">Add items you're hunting for — skins, cards, bottles.</div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state" style={{ padding: '40px 0' }}>
          <div className="empty-state-text">No {filter} items on your wishlist.</div>
        </div>
      ) : (
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8 }}>
          {filtered.map((item, idx) => (
            <div key={item.id} style={{
              display: 'flex', alignItems: 'center', padding: '12px 16px', gap: 12,
              borderBottom: idx < filtered.length - 1 ? '1px solid var(--border)' : 'none',
            }}>
              <span className="badge" style={{ background: VERT_COLORS[item.vertical], color: item.vertical === 'pokemon' ? '#000' : '#0b0d12', fontSize: 9, flexShrink: 0 }}>
                {VERT_LABELS[item.vertical]}
              </span>
              <span style={{ flex: 1, fontWeight: 500 }}>{item.name}</span>
              {item.target_price != null && (
                <span style={{ fontFamily: 'JetBrains Mono', fontSize: 13, color: 'var(--grn)', flexShrink: 0 }}>
                  Target {fmt(item.target_price)}
                </span>
              )}
              {item.notes && (
                <span style={{ fontSize: 12, color: 'var(--mut)', flexShrink: 0, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.notes}
                </span>
              )}
              <button
                className="btn btn-secondary btn-sm"
                style={{ flexShrink: 0, fontSize: 11 }}
                onClick={() => setConvertItem(item)}
                title="Move to portfolio"
              >
                → Portfolio
              </button>
              <button className="btn-icon danger" onClick={() => setDeleteTarget(item)} style={{ flexShrink: 0 }}>✕</button>
            </div>
          ))}
        </div>
      )}

      {convertItem && (
        <AddItemModal
          vertical={convertItem.vertical}
          item={{ name: convertItem.name, cost: convertItem.target_price, qty: 1 }}
          userId={userId}
          onSave={handleConvertSave}
          onClose={() => setConvertItem(null)}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Remove from wishlist"
          message={`Remove "${deleteTarget.name}" from your wishlist?`}
          dangerous
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}
