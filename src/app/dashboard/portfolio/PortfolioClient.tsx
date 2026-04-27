'use client'

import { useState, useEffect } from 'react'
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
  acquired_at: string
}

function abbrevCondition(c: string | null): string {
  if (!c) return '—'
  return c
    .replace('Factory New', 'FN')
    .replace('Minimal Wear', 'MW')
    .replace('Field-Tested', 'FT')
    .replace('Well-Worn', 'WW')
    .replace('Battle-Scarred', 'BS')
}

export function PortfolioClient(props: Record<string, unknown>) {
  const portfolioId = props.portfolioId as string
  const [holdings, setHoldings] = useState<Holding[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<'name' | 'value' | 'pnl'>('value')

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('holdings')
      .select('id, item_name, item_condition, item_category, is_stattrak, quantity, cost_basis, last_price, acquired_at')
      .eq('portfolio_id', portfolioId)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) console.error(error)
        setHoldings(data ?? [])
        setLoading(false)
      })
  }, [portfolioId])

  const filtered = holdings
    .filter(h => h.item_name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sortKey === 'value') return ((b.last_price || 0) * b.quantity) - ((a.last_price || 0) * a.quantity)
      if (sortKey === 'pnl') {
        const pA = ((a.last_price || 0) - Number(a.cost_basis)) * a.quantity
        const pB = ((b.last_price || 0) - Number(b.cost_basis)) * b.quantity
        return pB - pA
      }
      return a.item_name.localeCompare(b.item_name)
    })

  const totalValue = holdings.reduce((s, h) => s + (h.last_price || 0) * h.quantity, 0)
  const totalCost = holdings.reduce((s, h) => s + Number(h.cost_basis) * h.quantity, 0)
  const totalPnl = totalValue - totalCost

  const mono = { fontFamily: 'monospace' } as React.CSSProperties
  const hCell: React.CSSProperties = { textAlign: 'left' as const, padding: '0.4rem 0.75rem', color: '#444', fontSize: '0.68rem', textTransform: 'uppercase' as const, cursor: 'pointer' }
  const cell: React.CSSProperties = { padding: '0.45rem 0.75rem', fontSize: '0.8rem' }

  if (loading) {
    return (
      <div style={{ ...mono, padding: '3rem', textAlign: 'center', color: '#444' }}>
        <div style={{ color: '#00ff88' }}>Loading holdings...</div>
      </div>
    )
  }

  if (holdings.length === 0) {
    return (
      <div style={{ ...mono, padding: '3rem', textAlign: 'center', color: '#444' }}>
        <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>📦</div>
        <div style={{ color: '#666', marginBottom: '0.5rem' }}>No holdings yet.</div>
        <a href="/dashboard/inventory" style={{ color: '#00ff88', textDecoration: 'none' }}>
          → Import your inventory
        </a>
      </div>
    )
  }

  return (
    <div style={{ ...mono, padding: '1rem', overflowY: 'auto' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', padding: '0.75rem 1rem', background: '#0a0a0a', border: '1px solid #1a1a1a', marginBottom: '0.75rem' }}>
        {[
          { label: 'Holdings', value: String(holdings.length), color: '#fff' },
          { label: 'Total Value', value: `$${totalValue.toFixed(2)}`, color: '#00ff88' },
          { label: 'Cost Basis', value: totalCost > 0 ? `$${totalCost.toFixed(2)}` : '—', color: '#ccc' },
          { label: 'P&L', value: totalCost > 0 ? `${totalPnl >= 0 ? '+' : ''}$${Math.abs(totalPnl).toFixed(2)}` : '—', color: totalPnl >= 0 ? '#00ff88' : '#ff4444' },
        ].map(({ label, value, color }) => (
          <div key={label}>
            <div style={{ color: '#333', fontSize: '0.65rem', textTransform: 'uppercase', marginBottom: '0.15rem' }}>{label}</div>
            <div style={{ color, fontSize: '1.05rem', fontWeight: 700 }}>{value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', alignItems: 'center' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Filter items..."
          style={{ flex: 1, background: '#0a0a0a', border: '1px solid #1e1e1e', color: '#ccc', padding: '0.4rem 0.75rem', fontFamily: 'monospace', fontSize: '0.8rem', outline: 'none' }}
        />
        <span style={{ color: '#444', fontSize: '0.7rem' }}>Sort:</span>
        {(['name', 'value', 'pnl'] as const).map(k => (
          <button key={k} onClick={() => setSortKey(k)} style={{
            background: sortKey === k ? '#0d1f0d' : 'transparent',
            border: `1px solid ${sortKey === k ? '#00ff88' : '#222'}`,
            color: sortKey === k ? '#00ff88' : '#555',
            padding: '0.3rem 0.6rem', fontFamily: 'monospace', fontSize: '0.7rem',
            cursor: 'pointer', textTransform: 'uppercase'
          }}>{k}</button>
        ))}
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #1a1a1a' }}>
              <th style={{ ...hCell, textAlign: 'left' }} onClick={() => setSortKey('name')}>Item</th>
              <th style={{ ...hCell, textAlign: 'left' }}>Wear</th>
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
                  <td style={{ ...cell, color: '#e0e0e0', maxWidth: 300 }}>
                    {h.is_stattrak && <span style={{ color: '#ff8c00', fontSize: '0.65rem', marginRight: '0.3rem', border: '1px solid #ff8c0033', padding: '0 3px' }}>ST</span>}
                    {h.item_name}
                  </td>
                  <td style={{ ...cell, color: '#555', fontSize: '0.72rem' }}>{abbrevCondition(h.item_condition)}</td>
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
    </div>
  )
}
