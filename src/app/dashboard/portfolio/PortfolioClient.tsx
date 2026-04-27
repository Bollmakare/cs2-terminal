'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

type Holding = {
  id: string
  item_name: string
  item_condition: string | null
  item_category: string | null
  is_stattrak: boolean
  quantity: number
  cost_basis: number
  last_price: number | null
  float_value: number | null
  pattern_id: number | null
  group_label: string | null
  steam_asset_id: string | null
  acquired_at: string
}

function abbrevCondition(c: string | null): string {
  if (!c) return '—'
  return c
    .replace('Factory New', 'FN').replace('Minimal Wear', 'MW')
    .replace('Field-Tested', 'FT').replace('Well-Worn', 'WW').replace('Battle-Scarred', 'BS')
}

function floatColor(f: number): string {
  if (f < 0.07) return '#00ff88'
  if (f < 0.15) return '#88ff44'
  if (f < 0.38) return '#ffcc00'
  if (f < 0.45) return '#ff8800'
  return '#ff4444'
}

// Inline editable label for storage units
function EditableLabel({ id, initial, onSave }: { id: string; initial: string; onSave: (id: string, val: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(initial)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setValue(initial) }, [initial])
  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  async function save() {
    setSaving(true)
    await onSave(id, value.trim() || initial)
    setSaving(false)
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={value}
        onChange={e => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setValue(initial); setEditing(false) } }}
        style={{
          background: '#0d1a0d', border: '1px solid #00ff88', color: '#00ff88',
          fontFamily: 'monospace', fontSize: '0.8rem', padding: '0.1rem 0.4rem',
          outline: 'none', width: 180,
        }}
      />
    )
  }

  return (
    <span
      onClick={() => setEditing(true)}
      title="Click to rename"
      style={{ color: '#00ff88', cursor: 'text', borderBottom: '1px dashed #00ff8855' }}
    >
      {saving ? '...' : value}
      <span style={{ color: '#333', fontSize: '0.6rem', marginLeft: 4 }}>✎</span>
    </span>
  )
}

export function PortfolioClient(props: Record<string, unknown>) {
  const portfolioId = props.portfolioId as string
  const [holdings, setHoldings] = useState<Holding[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<'name' | 'value' | 'pnl' | 'float'>('value')
  const [priceMsg, setPriceMsg] = useState('')
  const [showStorageUnits, setShowStorageUnits] = useState(false)

  const loadHoldings = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('holdings')
      .select('id, item_name, item_condition, item_category, is_stattrak, quantity, cost_basis, last_price, float_value, pattern_id, group_label, steam_asset_id, acquired_at')
      .eq('portfolio_id', portfolioId)
      .order('created_at', { ascending: false })
    setHoldings(data ?? [])
    return data ?? []
  }, [portfolioId])

  const refreshPrices = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true)
    try {
      const r = await fetch('/api/holdings/refresh-prices', { method: 'POST' })
      const j = await r.json()
      if (j.updated > 0) {
        setPriceMsg(`✓ ${j.updated} prices updated`)
        await loadHoldings()
      } else {
        setPriceMsg(j.message ?? 'No prices found')
      }
    } catch {
      setPriceMsg('Price refresh failed')
    } finally {
      if (!silent) setRefreshing(false)
    }
  }, [loadHoldings])

  useEffect(() => {
    setLoading(true)
    loadHoldings().then(data => {
      setLoading(false)
      if (data.length > 0 && data.every(h => h.last_price === null)) {
        refreshPrices(true)
      }
    })
  }, [loadHoldings, refreshPrices])

  // Rename a storage unit label directly in Supabase
  const renameStorageUnit = useCallback(async (id: string, label: string) => {
    const supabase = createClient()
    await supabase.from('holdings').update({ group_label: label }).eq('id', id)
    setHoldings(prev => prev.map(h => h.id === id ? { ...h, group_label: label } : h))
  }, [])

  // Split holdings into regular items and storage units
  const storageUnits = holdings.filter(h => h.item_category === 'storage_unit')
  const regularHoldings = holdings.filter(h => h.item_category !== 'storage_unit')

  const filtered = regularHoldings
    .filter(h => h.item_name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sortKey === 'value') return ((b.last_price || 0) * b.quantity) - ((a.last_price || 0) * a.quantity)
      if (sortKey === 'pnl') {
        const pA = ((a.last_price || 0) - Number(a.cost_basis)) * a.quantity
        const pB = ((b.last_price || 0) - Number(b.cost_basis)) * b.quantity
        return pB - pA
      }
      if (sortKey === 'float') return (a.float_value ?? 1) - (b.float_value ?? 1)
      return a.item_name.localeCompare(b.item_name)
    })

  const totalValue = regularHoldings.reduce((s, h) => s + (h.last_price || 0) * h.quantity, 0)
  const totalCost = regularHoldings.reduce((s, h) => s + Number(h.cost_basis) * h.quantity, 0)
  const totalPnl = totalValue - totalCost
  const hasFloats = regularHoldings.some(h => h.float_value !== null)

  const mono = { fontFamily: 'monospace' } as React.CSSProperties
  const hCell: React.CSSProperties = { textAlign: 'left' as const, padding: '0.4rem 0.6rem', color: '#444', fontSize: '0.67rem', textTransform: 'uppercase' as const, cursor: 'pointer', whiteSpace: 'nowrap' as const }
  const cell: React.CSSProperties = { padding: '0.4rem 0.6rem', fontSize: '0.79rem' }

  if (loading) return <div style={{ ...mono, padding: '3rem', textAlign: 'center', color: '#00ff88' }}>Loading holdings...</div>

  if (holdings.length === 0) {
    return (
      <div style={{ ...mono, padding: '3rem', textAlign: 'center', color: '#444' }}>
        <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>📦</div>
        <div style={{ color: '#666', marginBottom: '0.5rem' }}>No holdings yet.</div>
        <a href="/dashboard/inventory" style={{ color: '#00ff88', textDecoration: 'none' }}>→ Import your inventory</a>
      </div>
    )
  }

  return (
    <div style={{ ...mono, padding: '1rem', overflowY: 'auto' }}>

      {/* Summary bar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', padding: '0.75rem 1rem', background: '#0a0a0a', border: '1px solid #1a1a1a', marginBottom: '0.75rem', alignItems: 'center' }}>
        {[
          { label: 'Holdings', value: String(regularHoldings.length), color: '#fff' },
          { label: 'Total Value', value: totalValue > 0 ? `$${totalValue.toFixed(2)}` : '—', color: '#00ff88' },
          { label: 'Cost Basis', value: totalCost > 0 ? `$${totalCost.toFixed(2)}` : '—', color: '#ccc' },
          { label: 'P&L', value: totalCost > 0 ? `${totalPnl >= 0 ? '+' : ''}$${Math.abs(totalPnl).toFixed(2)}` : '—', color: totalPnl >= 0 ? '#00ff88' : '#ff4444' },
          ...(storageUnits.length > 0 ? [{ label: 'Storage Units', value: String(storageUnits.length), color: '#888' }] : []),
        ].map(({ label, value, color }) => (
          <div key={label}>
            <div style={{ color: '#333', fontSize: '0.65rem', textTransform: 'uppercase', marginBottom: '0.15rem' }}>{label}</div>
            <div style={{ color, fontSize: '1.05rem', fontWeight: 700 }}>{value}</div>
          </div>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {priceMsg && <span style={{ color: '#555', fontSize: '0.7rem' }}>{priceMsg}</span>}
          <button onClick={() => refreshPrices(false)} disabled={refreshing} style={{ background: 'transparent', border: '1px solid #222', color: refreshing ? '#444' : '#00ff88', padding: '0.3rem 0.7rem', fontFamily: 'monospace', fontSize: '0.7rem', cursor: refreshing ? 'default' : 'pointer' }}>
            {refreshing ? 'Refreshing...' : '↻ Prices'}
          </button>
        </div>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', alignItems: 'center' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Filter items..." style={{ flex: 1, background: '#0a0a0a', border: '1px solid #1e1e1e', color: '#ccc', padding: '0.4rem 0.75rem', fontFamily: 'monospace', fontSize: '0.8rem', outline: 'none' }} />
        <span style={{ color: '#444', fontSize: '0.7rem' }}>Sort:</span>
        {(['name', 'value', 'pnl', ...(hasFloats ? ['float' as const] : [])] as const).map(k => (
          <button key={k} onClick={() => setSortKey(k)} style={{ background: sortKey === k ? '#0d1f0d' : 'transparent', border: `1px solid ${sortKey === k ? '#00ff88' : '#222'}`, color: sortKey === k ? '#00ff88' : '#555', padding: '0.3rem 0.6rem', fontFamily: 'monospace', fontSize: '0.7rem', cursor: 'pointer', textTransform: 'uppercase' }}>{k}</button>
        ))}
      </div>

      {/* Main holdings table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #1a1a1a' }}>
              <th style={{ ...hCell, textAlign: 'left' }} onClick={() => setSortKey('name')}>Item</th>
              <th style={hCell}>Wear</th>
              {hasFloats && <th style={hCell} onClick={() => setSortKey('float')}>Float ↕</th>}
              {hasFloats && <th style={hCell}>Pattern</th>}
              <th style={{ ...hCell, textAlign: 'right' }}>Qty</th>
              <th style={{ ...hCell, textAlign: 'right' }} onClick={() => setSortKey('value')}>Price</th>
              <th style={{ ...hCell, textAlign: 'right' }} onClick={() => setSortKey('value')}>Value ↕</th>
              <th style={{ ...hCell, textAlign: 'right' }}>Cost</th>
              <th style={{ ...hCell, textAlign: 'right' }} onClick={() => setSortKey('pnl')}>P&L ↕</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(h => {
              const price = h.last_price || 0
              const value = price * h.quantity
              const cost = Number(h.cost_basis) * h.quantity
              const pnl = value - cost
              const pnlPct = cost > 0 ? (pnl / cost) * 100 : null
              return (
                <tr key={h.id} style={{ borderBottom: '1px solid #0f0f0f' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#0d0d0d')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <td style={{ ...cell, color: '#e0e0e0', maxWidth: 260 }}>
                    {h.is_stattrak && <span style={{ color: '#ff8c00', fontSize: '0.65rem', marginRight: '0.3rem', border: '1px solid #ff8c0033', padding: '0 3px' }}>ST</span>}
                    {h.item_name}
                  </td>
                  <td style={{ ...cell, color: '#555', fontSize: '0.72rem' }}>{abbrevCondition(h.item_condition)}</td>
                  {hasFloats && <td style={{ ...cell, color: h.float_value ? floatColor(h.float_value) : '#333', fontSize: '0.72rem', fontVariantNumeric: 'tabular-nums' }}>{h.float_value !== null ? h.float_value.toFixed(6) : '—'}</td>}
                  {hasFloats && <td style={{ ...cell, color: h.pattern_id ? '#aaa' : '#333', fontSize: '0.72rem' }}>{h.pattern_id ?? '—'}</td>}
                  <td style={{ ...cell, textAlign: 'right', color: '#777' }}>{h.quantity}</td>
                  <td style={{ ...cell, textAlign: 'right', color: price > 0 ? '#999' : '#333' }}>{price > 0 ? `$${price.toFixed(2)}` : '—'}</td>
                  <td style={{ ...cell, textAlign: 'right', color: value > 0 ? '#00ff88' : '#333' }}>{value > 0 ? `$${value.toFixed(2)}` : '—'}</td>
                  <td style={{ ...cell, textAlign: 'right', color: '#555' }}>{cost > 0 ? `$${cost.toFixed(2)}` : '—'}</td>
                  <td style={{ ...cell, textAlign: 'right', color: pnl >= 0 ? '#00d066' : '#ff4444' }}>
                    {cost > 0 ? `${pnl >= 0 ? '+' : '-'}$${Math.abs(pnl).toFixed(2)}${pnlPct !== null ? ` (${Math.abs(pnlPct).toFixed(0)}%)` : ''}` : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && search && (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#444', fontSize: '0.8rem' }}>No items match &quot;{search}&quot;</div>
      )}

      {/* Storage Units section */}
      {storageUnits.length > 0 && (
        <div style={{ marginTop: '1.5rem' }}>
          <div
            onClick={() => setShowStorageUnits(v => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', padding: '0.5rem 0', borderTop: '1px solid #1a1a1a', marginBottom: '0.5rem' }}
          >
            <span style={{ color: '#333', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {showStorageUnits ? '▼' : '▶'} Storage Units ({storageUnits.length})
            </span>
            <span style={{ color: '#333', fontSize: '0.65rem' }}>— click label to rename</span>
          </div>

          {showStorageUnits && (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #1a1a1a' }}>
                  <th style={{ ...hCell, textAlign: 'left' }}>Label</th>
                  <th style={{ ...hCell, textAlign: 'left' }}>Asset ID</th>
                  <th style={{ ...hCell, textAlign: 'right' }}>Value</th>
                </tr>
              </thead>
              <tbody>
                {storageUnits.map(h => (
                  <tr key={h.id} style={{ borderBottom: '1px solid #0f0f0f' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#0d0d0d')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <td style={{ ...cell }}>
                      <EditableLabel
                        id={h.id}
                        initial={h.group_label ?? h.item_name}
                        onSave={renameStorageUnit}
                      />
                    </td>
                    <td style={{ ...cell, color: '#444', fontSize: '0.7rem', fontVariantNumeric: 'tabular-nums' }}>
                      {h.steam_asset_id ?? '—'}
                    </td>
                    <td style={{ ...cell, textAlign: 'right', color: (h.last_price || 0) > 0 ? '#00ff88' : '#333' }}>
                      {(h.last_price || 0) > 0 ? `$${(h.last_price! * h.quantity).toFixed(2)}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
