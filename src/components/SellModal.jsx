import { useState } from 'react'
import { fmt, fmts, effectiveValue } from '../lib/utils.js'
import { addSoldItem, updateItem, deleteItem } from '../lib/api.js'
import { useToast } from './Toast.jsx'

function todayInput() {
  return new Date().toISOString().split('T')[0]
}

export default function SellModal({ item, userId, onClose, onSold }) {
  const toast = useToast()
  const [salePrice, setSalePrice] = useState('')
  const [qty, setQty] = useState('1')
  const [date, setDate] = useState(todayInput())
  const [platform, setPlatform] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const maxQty = item.qty
  const costPerUnit = item.cost ?? 0
  const marketPerUnit = effectiveValue(item)
  const salePriceNum = parseFloat(salePrice) || 0
  const qtyNum = parseInt(qty, 10) || 1

  const realizedPnl = salePriceNum > 0 ? (salePriceNum - costPerUnit) * qtyNum : null
  const realizedPct = salePriceNum > 0 && costPerUnit > 0 ? ((salePriceNum - costPerUnit) / costPerUnit) * 100 : null
  const vsMarketPct = salePriceNum > 0 && marketPerUnit > 0 ? ((salePriceNum - marketPerUnit) / marketPerUnit) * 100 : null

  const vLabel = item.vertical === 'cs2' ? 'Skin' : 'Card'
  const platformPlaceholder = item.vertical === 'cs2' ? 'Steam Market, Skinport, Buff…' : 'Cardmarket, TCGPlayer, eBay…'

  async function handleSell(e) {
    e.preventDefault()
    const sp = parseFloat(salePrice)
    if (isNaN(sp) || sp <= 0) return
    const q = parseInt(qty, 10)
    if (!q || q < 1 || q > maxQty) return
    setSaving(true)
    try {
      await addSoldItem({
        user_id: userId,
        item_name: item.name,
        vertical: item.vertical,
        qty: q,
        sale_price: sp,
        cost: costPerUnit,
        value_at_sale: marketPerUnit || null,
        sold_at: new Date(date + 'T12:00:00').toISOString(),
        notes: [platform.trim(), notes.trim()].filter(Boolean).join(' — ') || null,
        metadata: item.vertical === 'cs2' ? {
          wear: item.metadata?.wear ?? null,
          float: item.metadata?.float ?? null,
          stattrak: item.metadata?.stattrak ?? false,
          images: item.metadata?.images ?? [],
          price_sources: item.metadata?.price_sources ?? {},
        } : {
          set_name: item.metadata?.set_name ?? null,
          card_number: item.metadata?.card_number ?? null,
          rarity: item.metadata?.rarity ?? null,
          grade: item.metadata?.grade ?? null,
          cert_number: item.metadata?.cert_number ?? null,
          language: item.metadata?.language ?? null,
          item_type: item.metadata?.item_type ?? 'card',
          images: item.metadata?.images ?? [],
          price_sources: item.metadata?.price_sources ?? {},
        },
      })

      const remaining = maxQty - q
      if (remaining > 0) {
        await updateItem(item.id, { qty: remaining })
      } else {
        await deleteItem(item.id)
      }

      toast(`${q} ${vLabel.toLowerCase()}${q > 1 ? 's' : ''} recorded as sold`, 'success')
      onSold(remaining)
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const pnlColor = realizedPnl == null ? 'var(--mut)' : realizedPnl >= 0 ? 'var(--grn)' : 'var(--red)'
  const vColor = item.vertical === 'cs2' ? 'var(--cs)' : 'var(--pkm)'

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>×</button>
        <div className="modal-title" style={{ color: vColor }}>Record Sale</div>
        <div style={{ fontSize: 13, color: 'var(--mut)', marginBottom: 20, marginTop: -12 }}>
          {item.name}
          {item.metadata?.wear ? ` · ${item.metadata.wear}` : ''}
          {item.metadata?.grade && item.metadata.grade !== 'Ungraded' ? ` · ${item.metadata.grade}` : ''}
        </div>

        {/* Cost / Market snapshot */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
          <div style={{ flex: 1, background: 'var(--bg3)', borderRadius: 6, padding: '10px 12px' }}>
            <div style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--mut)', letterSpacing: '0.07em' }}>Paid</div>
            <div style={{ fontFamily: 'JetBrains Mono', fontSize: 16, fontWeight: 600 }}>{fmt(costPerUnit)}</div>
          </div>
          <div style={{ flex: 1, background: 'var(--bg3)', borderRadius: 6, padding: '10px 12px' }}>
            <div style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--mut)', letterSpacing: '0.07em' }}>Market</div>
            <div style={{ fontFamily: 'JetBrains Mono', fontSize: 16, fontWeight: 600, color: vColor }}>{fmt(marketPerUnit)}</div>
          </div>
          <div style={{ flex: 1, background: 'var(--bg3)', borderRadius: 6, padding: '10px 12px' }}>
            <div style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--mut)', letterSpacing: '0.07em' }}>Realized P&L</div>
            <div style={{ fontFamily: 'JetBrains Mono', fontSize: 16, fontWeight: 600, color: pnlColor }}>
              {realizedPnl != null ? fmts(realizedPnl) : '—'}
            </div>
            {realizedPct != null && (
              <div style={{ fontSize: 11, color: pnlColor }}>
                {realizedPct >= 0 ? '+' : ''}{realizedPct.toFixed(1)}%
                {vsMarketPct != null && (
                  <span style={{ color: 'var(--mut)', marginLeft: 4 }}>
                    ({vsMarketPct >= 0 ? '+' : ''}{vsMarketPct.toFixed(1)}% vs mkt)
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        <form onSubmit={handleSell}>
          <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
            <div className="form-group" style={{ flex: 2, marginBottom: 0 }}>
              <label className="form-label">Sale Price (€)</label>
              <input
                className="form-input mono"
                type="number"
                step="0.01"
                min="0.01"
                required
                autoFocus
                value={salePrice}
                onChange={e => setSalePrice(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
              <label className="form-label">Qty</label>
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
            <div className="form-group" style={{ flex: 2, marginBottom: 0 }}>
              <label className="form-label">Date</label>
              <input
                className="form-input"
                type="date"
                value={date}
                max={todayInput()}
                onChange={e => setDate(e.target.value)}
              />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 12 }}>
            <label className="form-label">Platform</label>
            <input
              className="form-input"
              value={platform}
              onChange={e => setPlatform(e.target.value)}
              placeholder={platformPlaceholder}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Notes (optional)</label>
            <textarea
              className="form-textarea"
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Who you sold to, trade details, anything worth remembering…"
            />
          </div>

          {parseInt(qty) === maxQty && (
            <div style={{ fontSize: 12, color: 'var(--mut)', background: 'rgba(255,107,53,0.08)', border: '1px solid rgba(255,107,53,0.2)', borderRadius: 6, padding: '8px 12px', marginBottom: 12 }}>
              This is your last copy — it will be removed from your portfolio.
            </div>
          )}

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ background: vColor, color: item.vertical === 'pokemon' ? '#000' : undefined }} disabled={saving}>
              {saving ? <span className="loading-spin" /> : '💰 Record Sale'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
