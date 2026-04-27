'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import {
  enrichHolding, fmt$, fmtPct, fmtFloat, fmtDate, daysAgo,
  CAT_COLOR, CAT_BG, condFull, skinImg, steamMarketUrl, csfloatUrl, cn
} from '@/lib/utils'
import type { Holding, HoldingWithValue } from '@/types/db'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { detectDopplerPhase, estimateStickerValue, estimateFloatAdjustedPrice } from '@/lib/data/skins'

interface Props {
  portfolioId: string
  portfolioName: string
  steamId: string | null
  fees: { skinport: number; steam: number; csfloat: number }
}

type SortCol = 'name' | 'value' | 'cost' | 'pnl' | 'pnl_pct' | 'days' | 'qty'
type View    = 'holdings' | 'allocation' | 'steam'

// ── Data hook ─────────────────────────────────────────────
function useHoldings(portfolioId: string) {
  return useQuery({
    queryKey: ['holdings', portfolioId],
    queryFn: async () => {
      const res = await fetch(`/api/holdings?portfolio_id=${portfolioId}`)
      const { holdings } = await res.json()
      return (holdings as Holding[]).map(enrichHolding)
    },
    staleTime: 60_000,
  })
}

// ── Sell modal ────────────────────────────────────────────
function SellModal({
  holding,
  fees,
  onClose,
  onSold,
}: {
  holding: HoldingWithValue
  fees: Props['fees']
  onClose: () => void
  onSold: () => void
}) {
  const [qty, setQty]           = useState(holding.quantity)
  const [price, setPrice]       = useState(holding.current_price.toFixed(2))
  const [platform, setPlatform] = useState<'skinport' | 'steam' | 'csfloat'>('skinport')
  const [note, setNote]         = useState('')
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')

  const feePct     = fees[platform]
  const gross      = parseFloat(price || '0') * qty
  const feeAmount  = gross * (feePct / 100)
  const net        = gross - feeAmount
  const costBasis  = holding.cost_basis * qty
  const realizedPnl = net - costBasis

  async function handleSell() {
    setSaving(true); setError('')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Not authenticated'); setSaving(false); return }

    // Insert transaction
    const { error: txErr } = await supabase.from('transactions').insert({
      portfolio_id:   holding.portfolio_id,
      user_id:        user.id,
      holding_id:     holding.id,
      type:           'sell',
      item_name:      holding.item_name,
      item_condition: holding.item_condition,
      quantity:       qty,
      price_per_unit: parseFloat(price),
      fee_platform:   platform,
      fee_pct:        feePct,
      fee_amount:     feeAmount,
      gross_proceeds: gross,
      net_proceeds:   net,
      cost_basis:     holding.cost_basis,
      realized_pnl:   realizedPnl,
      note:           note || null,
      transacted_at:  new Date().toISOString().slice(0, 10),
    })
    if (txErr) { setError(txErr.message); setSaving(false); return }

    // Update or delete holding
    if (qty >= holding.quantity) {
      await supabase.from('holdings').delete().eq('id', holding.id)
    } else {
      await supabase.from('holdings').update({ quantity: holding.quantity - qty }).eq('id', holding.id)
    }
    onSold()
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box w-full max-w-md">
        <div className="panel-header px-5 py-4">
          <span className="font-mono font-bold text-sm text-[var(--text)]">SELL POSITION</span>
          <button onClick={onClose} className="text-muted-3 hover:text-red transition-colors ml-auto text-lg leading-none">✕</button>
        </div>

        <div className="p-5 space-y-4">
          {/* Item info */}
          <div className="flex items-center gap-3 p-3 rounded border border-terminal-border bg-terminal-surface">
            <img src={skinImg(holding.item_name, 80)} alt="" className="w-16 h-12 object-contain flex-shrink-0"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
            <div>
              <div className="font-mono text-sm font-bold text-[var(--text)]">{holding.item_name}</div>
              <div className="font-mono text-xs text-muted-3 mt-0.5">
                {holding.item_condition ?? '—'} · ×{holding.quantity} held · cost {fmt$(holding.cost_basis)}/unit
              </div>
            </div>
          </div>

          {error && <div className="px-3 py-2 rounded border border-red/30 bg-red-soft font-mono text-xs text-red">{error}</div>}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-mono text-[9px] uppercase tracking-widest text-muted-3 mb-1.5">Qty selling</label>
              <input type="number" value={qty} min={1} max={holding.quantity}
                onChange={e => setQty(Math.min(holding.quantity, Math.max(1, parseInt(e.target.value) || 1)))}
                className="input-terminal" />
            </div>
            <div>
              <label className="block font-mono text-[9px] uppercase tracking-widest text-muted-3 mb-1.5">Sale price / unit</label>
              <input type="number" value={price} step="0.01" min="0"
                onChange={e => setPrice(e.target.value)}
                className="input-terminal" />
            </div>
          </div>

          {/* Platform selector */}
          <div>
            <label className="block font-mono text-[9px] uppercase tracking-widest text-muted-3 mb-1.5">Platform</label>
            <div className="flex gap-2">
              {(['skinport', 'steam', 'csfloat'] as const).map(p => (
                <button key={p} onClick={() => setPlatform(p)}
                  className={cn(
                    'flex-1 py-1.5 rounded border font-mono text-[11px] transition-all',
                    platform === p
                      ? 'bg-green-soft border-green/30 text-green'
                      : 'border-terminal-border-2 bg-terminal-surface text-muted-3 hover:text-muted-2'
                  )}>
                  {p.charAt(0).toUpperCase() + p.slice(1)}<br/>
                  <span className="text-[9px] opacity-70">{fees[p]}%</span>
                </button>
              ))}
            </div>
          </div>

          {/* P&L breakdown */}
          <div className="rounded border border-terminal-border bg-terminal-surface p-3 space-y-1.5">
            <div className="flex justify-between font-mono text-xs">
              <span className="text-muted-3">Gross proceeds</span>
              <span>{fmt$(gross)}</span>
            </div>
            <div className="flex justify-between font-mono text-xs">
              <span className="text-muted-3">Fee ({feePct}%)</span>
              <span className="text-red">−{fmt$(feeAmount)}</span>
            </div>
            <div className="flex justify-between font-mono text-xs border-t border-terminal-border pt-1.5">
              <span className="text-muted-3">Net proceeds</span>
              <span className="font-bold">{fmt$(net)}</span>
            </div>
            <div className="flex justify-between font-mono text-xs">
              <span className="text-muted-3">Cost basis</span>
              <span className="text-muted-2">{fmt$(costBasis)}</span>
            </div>
            <div className="flex justify-between font-mono text-sm font-bold border-t border-terminal-border pt-1.5">
              <span className="text-muted-2">Realized P&L</span>
              <span style={{ color: realizedPnl >= 0 ? 'var(--green)' : 'var(--red)' }}>
                {fmt$(realizedPnl, { sign: true })}
              </span>
            </div>
          </div>

          <div>
            <label className="block font-mono text-[9px] uppercase tracking-widest text-muted-3 mb-1.5">Note (optional)</label>
            <input type="text" value={note} onChange={e => setNote(e.target.value)}
              placeholder="e.g. sold via Skinport trade" maxLength={200} className="input-terminal" />
          </div>
        </div>

        <div className="flex gap-3 px-5 py-4 border-t border-terminal-border">
          <button onClick={onClose} className="btn-terminal flex-1 justify-center">Cancel</button>
          <button onClick={handleSell} disabled={saving} className="btn-primary flex-1 justify-center">
            {saving ? 'Selling...' : `Sell ×${qty} →`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Add holding drawer ────────────────────────────────────
function AddDrawer({
  portfolioId,
  onClose,
  onAdded,
}: {
  portfolioId: string
  onClose: () => void
  onAdded: () => void
}) {
  const [mode, setMode]         = useState<'manual' | 'steam'>('manual')
  const [search, setSearch]     = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [selected, setSelected] = useState<any | null>(null)
  const [qty, setQty]           = useState(1)
  const [cost, setCost]         = useState('')
  const [date, setDate]         = useState(new Date().toISOString().slice(0, 10))
  const [floatVal, setFloatVal] = useState('')
  const [note, setNote]         = useState('')
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')

  // Search items in the database
  useEffect(() => {
    if (!search.trim() || search.length < 2) { setSearchResults([]); return }
    const timer = setTimeout(async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('items')
        .select('id, market_hash_name, condition, category, is_stattrak, price_usd, icon_url')
        .ilike('market_hash_name', `%${search}%`)
        .order('price_usd', { ascending: false, nullsFirst: false })
        .limit(20)
      setSearchResults(data ?? [])
    }, 200)
    return () => clearTimeout(timer)
  }, [search])

  async function handleAdd() {
    if (!selected && !cost) { setError('Select an item or enter a name'); return }
    setSaving(true); setError('')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Not authenticated'); setSaving(false); return }

    const payload = {
      portfolio_id:   portfolioId,
      item_id:        selected?.id ?? null,
      item_name:      selected?.market_hash_name ?? search,
      item_condition: selected?.condition ?? null,
      item_category:  selected?.category ?? null,
      is_stattrak:    selected?.is_stattrak ?? false,
      quantity:       qty,
      cost_basis:     parseFloat(cost) || 0,
      acquired_at:    date,
      float_value:    floatVal ? parseFloat(floatVal) : null,
      note:           note || null,
      stickers:       [],
    }

    const res = await fetch('/api/holdings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error ?? 'Failed to add'); setSaving(false); return }
    onAdded()
  }

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      {/* Drawer */}
      <div className="fixed top-0 right-0 bottom-0 z-50 w-full max-w-lg bg-[#0d0d0d] border-l border-terminal-border-2 flex flex-col shadow-2xl animate-slide-up" style={{ animation: 'slideInRight 0.22s ease' }}>
        <style>{`@keyframes slideInRight { from { transform: translateX(100%) } to { transform: translateX(0) } }`}</style>

        <div className="panel-header px-5 py-4 border-b border-terminal-border flex-shrink-0">
          <span className="font-mono font-bold text-sm text-[var(--text)]">ADD HOLDING</span>
          <button onClick={onClose} className="text-muted-3 hover:text-red transition-colors ml-auto text-lg leading-none">✕</button>
        </div>

        {/* Mode tabs */}
        <div className="tab-strip flex-shrink-0">
          <button className={cn('tab-btn', mode === 'manual' && 'active')} onClick={() => setMode('manual')}>MANUAL</button>
          <button className={cn('tab-btn', mode === 'steam' && 'active')} onClick={() => setMode('steam')}>STEAM IMPORT</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && <div className="px-3 py-2 rounded border border-red/30 bg-red-soft font-mono text-xs text-red">{error}</div>}

          {mode === 'manual' && (
            <>
              {/* Search */}
              <div>
                <label className="block font-mono text-[9px] uppercase tracking-widest text-muted-3 mb-1.5">Search item</label>
                <input
                  type="text" value={search} autoFocus
                  onChange={e => { setSearch(e.target.value); setSelected(null) }}
                  placeholder="AK-47 Redline FT, Karambit Fade..."
                  className="input-terminal"
                />
              </div>

              {/* Search results */}
              {!selected && searchResults.length > 0 && (
                <div className="rounded border border-terminal-border overflow-hidden max-h-64 overflow-y-auto">
                  {searchResults.map(item => (
                    <div key={item.id}
                      className="flex items-center gap-3 px-3 py-2.5 hover:bg-green-soft cursor-pointer border-b border-terminal-border last:border-0 transition-colors"
                      onClick={() => { setSelected(item); setCost(item.price_usd?.toFixed(2) ?? ''); setSearch(item.market_hash_name) }}>
                      <img src={item.icon_url ?? skinImg(item.market_hash_name, 64)} alt=""
                        className="w-10 h-8 object-contain flex-shrink-0"
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                      <div className="flex-1 min-w-0">
                        <div className="font-mono text-xs text-[var(--text)] truncate">{item.market_hash_name}</div>
                        <div className="font-mono text-[9px] text-muted-3">{item.category} · {item.condition ?? 'no cond'}</div>
                      </div>
                      <div className="font-mono text-xs text-muted-2 flex-shrink-0">{fmt$(item.price_usd)}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Selected item summary */}
              {selected && (
                <div className="flex items-center gap-3 p-3 rounded border border-green/20 bg-green-soft">
                  <img src={skinImg(selected.market_hash_name, 80)} alt=""
                    className="w-14 h-11 object-contain flex-shrink-0"
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-xs font-bold text-[var(--text)] truncate">{selected.market_hash_name}</div>
                    <div className="font-mono text-[9px] text-muted-3 mt-0.5">
                      {selected.condition} · Market: {fmt$(selected.price_usd)}
                    </div>
                  </div>
                  <button onClick={() => { setSelected(null); setSearch('') }}
                    className="text-muted-3 hover:text-red text-sm transition-colors">✕</button>
                </div>
              )}

              {/* Fields */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-mono text-[9px] uppercase tracking-widest text-muted-3 mb-1.5">Qty</label>
                  <div className="flex">
                    <button onClick={() => setQty(q => Math.max(1, q - 1))}
                      className="w-8 h-9 border border-terminal-border-2 bg-terminal-surface font-mono text-sm flex items-center justify-center rounded-l border-r-0 hover:bg-terminal-muted transition-colors text-muted-2">−</button>
                    <input type="number" value={qty} min={1}
                      onChange={e => setQty(Math.max(1, parseInt(e.target.value) || 1))}
                      className="input-terminal text-center rounded-none w-full" />
                    <button onClick={() => setQty(q => q + 1)}
                      className="w-8 h-9 border border-terminal-border-2 bg-terminal-surface font-mono text-sm flex items-center justify-center rounded-r border-l-0 hover:bg-terminal-muted transition-colors text-muted-2">+</button>
                  </div>
                </div>
                <div>
                  <label className="block font-mono text-[9px] uppercase tracking-widest text-muted-3 mb-1.5">Cost / unit ($)</label>
                  <input type="number" value={cost} step="0.01" min="0"
                    onChange={e => setCost(e.target.value)} placeholder="0.00" className="input-terminal" />
                </div>
                <div>
                  <label className="block font-mono text-[9px] uppercase tracking-widest text-muted-3 mb-1.5">Date</label>
                  <input type="date" value={date} onChange={e => setDate(e.target.value)} className="input-terminal" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-mono text-[9px] uppercase tracking-widest text-muted-3 mb-1.5">Float value</label>
                  <input type="number" value={floatVal} step="0.0001" min="0" max="1"
                    onChange={e => setFloatVal(e.target.value)} placeholder="0.0000"
                    className="input-terminal" style={{ fontFamily: 'var(--font-mono)' }} />
                </div>
                <div>
                  <label className="block font-mono text-[9px] uppercase tracking-widest text-muted-3 mb-1.5">Note</label>
                  <input type="text" value={note} onChange={e => setNote(e.target.value)}
                    placeholder="e.g. clean float" maxLength={200} className="input-terminal" />
                </div>
              </div>

              {/* Summary */}
              {(selected || search) && parseFloat(cost || '0') > 0 && (
                <div className="rounded border border-terminal-border bg-terminal-surface p-3">
                  <div className="flex justify-between font-mono text-xs mb-1">
                    <span className="text-muted-3">Total cost</span>
                    <span className="font-bold">{fmt$(parseFloat(cost || '0') * qty)}</span>
                  </div>
                  {selected?.price_usd && (
                    <div className="flex justify-between font-mono text-xs">
                      <span className="text-muted-3">Current market value</span>
                      <span style={{ color: selected.price_usd >= parseFloat(cost || '0') ? 'var(--green)' : 'var(--red)' }}>
                        {fmt$(selected.price_usd * qty)}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {mode === 'steam' && (
            <SteamImportPanel portfolioId={portfolioId} onImported={onAdded} />
          )}
        </div>

        {mode === 'manual' && (
          <div className="flex gap-3 px-5 py-4 border-t border-terminal-border flex-shrink-0">
            <button onClick={onClose} className="btn-terminal flex-1 justify-center">Cancel</button>
            <button onClick={handleAdd} disabled={saving || (!selected && !search)} className="btn-primary flex-1 justify-center">
              {saving ? 'Adding...' : 'Add to portfolio →'}
            </button>
          </div>
        )}
      </div>
    </>
  )
}

// ── Steam import panel ────────────────────────────────────
function SteamImportPanel({ portfolioId, onImported }: { portfolioId: string; onImported: () => void }) {
  const [steamId, setSteamId]   = useState('')
  const [importing, setImporting] = useState(false)
  const [error, setError]       = useState('')
  const [result, setResult]     = useState<{ imported: number; skins: number; storage_units: number; stackables: number; floats_fetched: number } | null>(null)

  async function handleImport() {
    if (!steamId.trim()) return
    setImporting(true); setError(''); setResult(null)
    // Fetch inventory from browser to avoid server-side Steam IP blocks
    let inventory: any
    try {
      const invRes = await fetch(
        'https://steamcommunity.com/inventory/' + steamId.trim() + '/730/2?l=english&count=5000',
        { credentials: 'omit' }
      )
      if (!invRes.ok) {
        setError('Steam returned ' + invRes.status + '. Make sure your inventory is set to Public in Steam privacy settings.')
        setImporting(false); return
      }
      inventory = await invRes.json()
    } catch (e: any) {
      setError('Could not reach Steam: ' + (e.message ?? 'network error'))
      setImporting(false); return
    }
    const res = await fetch('/api/holdings/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ portfolio_id: portfolioId, inventory }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error ?? 'Import failed'); setImporting(false); return }
    setImporting(false)
    setResult(data)
    onImported()
  }

  return (
    <div className="space-y-4">
      <div className="p-3 rounded border border-blue/20 bg-blue-soft font-mono text-xs text-blue-300">
        <p className="font-bold mb-1">Portfolio import</p>
        <p className="text-muted-2">Fetches your full CS2 inventory, groups stackable items (cases, capsules), and fetches float/pattern for each skin. Replaces existing holdings.</p>
        <p className="text-muted-2 mt-1">Inventory must be set to <strong>Public</strong> in Steam privacy settings.</p>
      </div>

      <div>
        <label className="block font-mono text-[9px] uppercase tracking-widest text-muted-3 mb-1.5">SteamID64</label>
        <div className="flex gap-2">
          <input type="text" value={steamId} onChange={e => setSteamId(e.target.value)}
            placeholder="76561197995388346" className="input-terminal flex-1"
            style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }} />
          <button onClick={handleImport} disabled={importing || !steamId.trim()} className="btn-primary whitespace-nowrap">
            {importing ? 'Importing…' : 'Import →'}
          </button>
        </div>
        <p className="font-mono text-[9px] text-muted-4 mt-1">
          Find at <a href="https://steamid.io" target="_blank" rel="noopener" className="text-green hover:underline">steamid.io</a>
        </p>
      </div>

      {error && <div className="px-3 py-2 rounded border border-red/30 bg-red-soft font-mono text-xs text-red">{error}</div>}

      {result && (
        <div className="px-3 py-2 rounded border border-green/20 bg-green-soft font-mono text-xs text-green space-y-0.5">
          <div>✓ {result.imported} rows imported</div>
          <div className="text-muted-2">{result.skins} skins · {result.storage_units} storage units · {result.stackables} stackable types · {result.floats_fetched} floats fetched</div>
          <div className="text-muted-3 mt-1">Click ↻ Prices to fetch current market prices.</div>
        </div>
      )}
    </div>
  )
}

// ── Edit row inline ───────────────────────────────────────
function EditCell({ holding, onSave }: { holding: HoldingWithValue; onSave: () => void }) {
  const [qty, setQty]   = useState(String(holding.quantity))
  const [cost, setCost] = useState(holding.cost_basis.toFixed(2))
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    await fetch('/api/holdings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: holding.id, quantity: parseInt(qty), cost_basis: parseFloat(cost) }),
    })
    setSaving(false)
    onSave()
  }

  return (
    <div className="flex items-center gap-2 py-1">
      <input type="number" value={qty} min={1} onChange={e => setQty(e.target.value)}
        className="input-terminal w-16 text-center text-xs py-1" />
      <span className="text-muted-4 text-xs">×</span>
      <input type="number" value={cost} step="0.01" onChange={e => setCost(e.target.value)}
        className="input-terminal w-24 text-xs py-1" />
      <button onClick={save} disabled={saving} className="btn-terminal py-1 px-2 text-[10px]">
        {saving ? '...' : '✓'}
      </button>
    </div>
  )
}

// ── Allocation donut ──────────────────────────────────────
function AllocationView({ holdings }: { holdings: HoldingWithValue[] }) {
  const totalValue = holdings.reduce((s, h) => s + h.total_value, 0)

  const byCategory = Object.entries(
    holdings.reduce((acc, h) => {
      const cat = h.item_category ?? 'other'
      acc[cat] = (acc[cat] ?? 0) + h.total_value
      return acc
    }, {} as Record<string, number>)
  )
    .sort((a, b) => b[1] - a[1])
    .map(([cat, value]) => ({
      cat,
      value,
      pct: totalValue > 0 ? (value / totalValue) * 100 : 0,
      color: CAT_COLOR[cat] ?? 'var(--cat-other)',
    }))

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.[0]) return null
    const d = payload[0].payload
    return (
      <div className="bg-terminal-surface-2 border border-terminal-border-2 rounded p-2 shadow-lg">
        <div className="font-mono text-[11px] font-bold text-[var(--text)] capitalize">{d.cat}</div>
        <div className="font-mono text-[11px] text-muted-2">{fmt$(d.value)} · {d.pct.toFixed(1)}%</div>
      </div>
    )
  }

  return (
    <div className="flex gap-8 items-start p-6">
      <div className="flex-shrink-0">
        <ResponsiveContainer width={220} height={220}>
          <PieChart>
            <Pie data={byCategory} dataKey="value" cx="50%" cy="50%"
              innerRadius={60} outerRadius={100} paddingAngle={2} strokeWidth={0}>
              {byCategory.map((entry, i) => (
                <Cell key={i} fill={entry.color} fillOpacity={0.9} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex-1 space-y-2 pt-2">
        {byCategory.map(({ cat, value, pct, color }) => (
          <div key={cat} className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
            <span className="font-mono text-xs text-muted-2 capitalize w-16">{cat}</span>
            <div className="flex-1 h-1 rounded-full bg-terminal-muted overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
            </div>
            <span className="font-mono text-xs text-[var(--text)] w-12 text-right">{pct.toFixed(1)}%</span>
            <span className="font-mono text-xs text-muted-3 w-20 text-right">{fmt$(value)}</span>
          </div>
        ))}
        <div className="pt-2 border-t border-terminal-border mt-3">
          <div className="flex items-center justify-between font-mono text-xs">
            <span className="text-muted-3">Total NAV</span>
            <span className="font-bold text-[var(--text)]">{fmt$(totalValue)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main portfolio client ─────────────────────────────────
export function PortfolioClient({ portfolioId, portfolioName, steamId, fees }: Props) {
  const qc = useQueryClient()
  const { data: holdings = [], isLoading } = useHoldings(portfolioId)

  // Sell signals — load once, map by holding_id for O(1) lookup in table
  const { data: sellSignalsRaw = [] } = useQuery({
    queryKey: ['sell-signals', portfolioId],
    queryFn: async () => {
      const res = await fetch(`/api/signals/sell?portfolio_id=${portfolioId}`)
      if (!res.ok) return []
      const { signals } = await res.json()
      return (signals ?? []) as { holding_id: string; urgency: string; sell_score: number; recommendation: string }[]
    },
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
  })
  const sellSignalMap = useMemo(
    () => new Map(sellSignalsRaw.map(s => [s.holding_id, s])),
    [sellSignalsRaw]
  )
  const highUrgencyCount = sellSignalsRaw.filter(s => s.urgency === 'high').length

  // Split holdings into regular + storage units
  const storageUnits    = holdings.filter(h => h.item_category === 'storage_unit')
  const regularHoldings = holdings.filter(h => h.item_category !== 'storage_unit')

  const [view, setView]           = useState<View>('holdings')
  const [sortCol, setSortCol]     = useState<SortCol>('value')
  const [sortDir, setSortDir]     = useState<1 | -1>(-1)
  const [catFilter, setCatFilter] = useState('all')
  const [search, setSearch]       = useState('')
  const [editId, setEditId]       = useState<string | null>(null)
  const [sellHolding, setSellHolding] = useState<HoldingWithValue | null>(null)
  const [showAdd, setShowAdd]     = useState(false)
  const [deleting, setDeleting]   = useState<string | null>(null)

  // Portfolio stats (exclude storage units from financial totals)
  const totalValue    = regularHoldings.reduce((s, h) => s + h.total_value, 0)
  const totalCost     = regularHoldings.reduce((s, h) => s + h.total_cost, 0)
  const unrealizedPnl = totalValue - totalCost
  const unrealizedPct = totalCost > 0 ? (unrealizedPnl / totalCost) * 100 : 0

  function toggleSort(col: SortCol) {
    if (sortCol === col) setSortDir(d => d === 1 ? -1 : 1)
    else { setSortCol(col); setSortDir(-1) }
  }

  const visible = useMemo(() => {
    let rows = catFilter === 'all' ? regularHoldings : regularHoldings.filter(h => h.item_category === catFilter)
    if (search.trim()) rows = rows.filter(h => h.item_name.toLowerCase().includes(search.toLowerCase()))
    return [...rows].sort((a, b) => {
      const field: Record<SortCol, (h: HoldingWithValue) => number | string> = {
        name:    h => h.item_name,
        value:   h => h.total_value,
        cost:    h => h.cost_basis,
        pnl:     h => h.unrealized_pnl,
        pnl_pct: h => h.unrealized_pnl_pct,
        days:    h => h.days_held,
        qty:     h => h.quantity,
      }
      const av = field[sortCol](a), bv = field[sortCol](b)
      if (typeof av === 'string') return sortDir * av.localeCompare(bv as string)
      return sortDir * ((bv as number) - (av as number))
    })
  }, [holdings, catFilter, search, sortCol, sortDir])

  async function handleDelete(id: string) {
    if (!confirm('Delete this holding?')) return
    setDeleting(id)
    await fetch('/api/holdings', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    setDeleting(null)
    qc.invalidateQueries({ queryKey: ['holdings', portfolioId] })
  }

  function refresh() { qc.invalidateQueries({ queryKey: ['holdings', portfolioId] }) }

  // ── Refresh prices ────────────────────────────────────────
  const [refreshingPrices, setRefreshingPrices] = useState(false)
  const [priceRefreshResult, setPriceRefreshResult] = useState<{ updated: number; failed: number } | null>(null)

  async function handleRefreshPrices() {
    setRefreshingPrices(true)
    setPriceRefreshResult(null)
    const res = await fetch('/api/holdings/refresh-prices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ portfolio_id: portfolioId }),
    })
    const data = await res.json()
    setRefreshingPrices(false)
    if (res.ok) {
      setPriceRefreshResult(data)
      refresh()
    }
  }

  // ── Storage units ─────────────────────────────────────────
  const [suOpen, setSuOpen] = useState(false)
  const [suLabels, setSuLabels] = useState<Record<string, string>>({})
  const [suEditId, setSuEditId] = useState<string | null>(null)

  async function renameStorageUnit(id: string, label: string) {
    const supabase = createClient()
    await supabase.from('holdings').update({ group_label: label }).eq('id', id)
    setSuLabels(prev => ({ ...prev, [id]: label }))
    setSuEditId(null)
    refresh()
  }

  const CATS = ['all', 'rifle', 'sniper', 'pistol', 'knife', 'gloves', 'case', 'other']

  function SortTh({ col, label, right }: { col: SortCol; label: string; right?: boolean }) {
    return (
      <th className={cn(right && 'term-num', sortCol === col ? (sortDir === -1 ? 'sort-desc' : 'sort-asc') : '')}
        onClick={() => toggleSort(col)} style={{ cursor: 'pointer', userSelect: 'none' }}>
        {label}
      </th>
    )
  }

  return (
    <div className="flex flex-col gap-3 h-[calc(100vh-88px)] overflow-hidden">
      {/* KPI strip */}
      <div className="grid grid-cols-4 gap-3 flex-shrink-0">
        {[
          { label: 'NAV', val: fmt$(totalValue), sub: `${regularHoldings.length} positions${storageUnits.length > 0 ? ` · ${storageUnits.length} units` : ''}`, col: undefined },
          { label: 'Unrealized P&L', val: fmt$(unrealizedPnl, { sign: true }), sub: fmtPct(unrealizedPct), col: unrealizedPnl >= 0 ? 'var(--green)' : 'var(--red)' },
          { label: 'Cost basis', val: fmt$(totalCost), sub: 'Total invested', col: undefined },
          { label: 'Avg position', val: fmt$(regularHoldings.length > 0 ? totalValue / regularHoldings.length : 0), sub: 'per holding', col: undefined },
        ].map(k => (
          <div key={k.label} className="panel px-4 py-3 flex-shrink-0">
            <div className="kpi-label mb-1.5">{k.label}</div>
            <div className="font-mono font-bold tabular-nums text-lg" style={{ color: k.col ?? 'var(--text)' }}>
              {isLoading ? <span className="skeleton inline-block w-24 h-5" /> : k.val}
            </div>
            <div className="font-mono text-[10px] text-muted-3 mt-0.5">{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Main panel */}
      <div className="panel flex flex-col flex-1 overflow-hidden">
        {/* Toolbar */}
        <div className="panel-header gap-3 flex-wrap flex-shrink-0">
          {/* View tabs */}
          <div className="flex">
            {(['holdings', 'allocation'] as View[]).map(v => (
              <button key={v} onClick={() => setView(v)}
                className={cn('px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest border-b-2 transition-all',
                  view === v ? 'border-green text-green' : 'border-transparent text-muted-3 hover:text-muted-2')}>
                {v}
              </button>
            ))}
          </div>

          {view === 'holdings' && (
            <>
              {/* Search */}
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Filter holdings..." className="input-terminal text-xs py-1 w-44" />

              {/* Category pills */}
              <div className="flex gap-1.5 flex-wrap">
                {CATS.map(c => (
                  <button key={c} onClick={() => setCatFilter(c)}
                    className={cn('px-2 py-0.5 rounded font-mono text-[10px] border transition-all capitalize',
                      catFilter === c
                        ? 'bg-green-soft border-green/30 text-green'
                        : 'border-terminal-border text-muted-3 hover:text-muted-2')}>
                    {c}
                  </button>
                ))}
              </div>
            </>
          )}

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={handleRefreshPrices}
              disabled={refreshingPrices}
              title={priceRefreshResult ? `Last: ${priceRefreshResult.updated} updated, ${priceRefreshResult.failed} failed` : 'Fetch current prices from Skinstrack'}
              className="btn-terminal text-xs py-1.5 px-3"
            >
              {refreshingPrices ? '↻ …' : '↻ Prices'}
            </button>
            <button onClick={() => setShowAdd(true)} className="btn-primary text-xs py-1.5">
              + Add holding
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {view === 'allocation' ? (
            isLoading
              ? <div className="p-8 flex items-center justify-center"><div className="skeleton w-48 h-48 rounded-full" /></div>
              : <AllocationView holdings={regularHoldings} />
          ) : isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-12 skeleton rounded" />)}
            </div>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 p-8">
              <span className="text-4xl text-muted-4">▤</span>
              <p className="font-mono text-sm text-muted-2">
                {holdings.length === 0 ? 'Portfolio is empty' : 'No holdings match filters'}
              </p>
              {holdings.length === 0 && (
                <button onClick={() => setShowAdd(true)} className="btn-primary text-sm">
                  Add first holding →
                </button>
              )}
            </div>
          ) : (
            <table className="term-table w-full">
              <thead className="sticky top-0 z-10">
                <tr>
                  <SortTh col="name" label="Item" />
                  <SortTh col="qty"  label="Qty" right />
                  <SortTh col="cost" label="Cost/unit" right />
                  <SortTh col="value" label="Price" right />
                  <th className="term-num">Value</th>
                  <SortTh col="pnl"     label="P&L" right />
                  <SortTh col="pnl_pct" label="%" right />
                  <SortTh col="days"    label="Days" right />
                  <th className="term-num w-20">Signal</th>
                  <th className="w-28 term-num">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(h => {
                  const up = h.unrealized_pnl >= 0
                  const isEditing = editId === h.id
                  return (
                    <tr key={h.id} className={cn(deleting === h.id && 'opacity-40')}>
                      {/* Item */}
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="w-0.5 h-8 rounded-full flex-shrink-0" style={{ background: CAT_COLOR[h.item_category ?? 'other'] }} />
                          <div className="min-w-0">
                            <div className="font-mono text-[11px] text-[var(--text)] truncate max-w-[260px]">{h.item_name}</div>
                            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                              {h.item_condition && (
                                <span className="font-mono text-[9px] text-muted-3">{h.item_condition}</span>
                              )}
                              {h.is_stattrak && (
                                <span className="font-mono text-[9px] text-amber font-bold">ST</span>
                              )}
                              {h.float_value != null && (() => {
                                const fa = h.item_condition
                                  ? estimateFloatAdjustedPrice(h.current_price, h.float_value, h.item_condition, h.item_name)
                                  : null
                                return (
                                  <span className={cn(
                                    'font-mono text-[9px]',
                                    fa?.float_tier === 'gem' ? 'text-amber font-bold' :
                                    fa?.float_tier === 'low' ? 'text-green' : 'text-muted-4'
                                  )}
                                  title={fa?.marketable_note}>
                                    {fmtFloat(h.float_value)}
                                    {fa?.float_tier === 'gem' && ' 💎'}
                                    {fa?.float_tier === 'low' && fa.float_premium_pct > 5 && ` +${fa.float_premium_pct.toFixed(0)}%`}
                                  </span>
                                )
                              })()}
                              {/* Doppler phase badge */}
                              {(() => {
                                const dp = detectDopplerPhase(h.item_name)
                                if (!dp.is_doppler) return null
                                return (
                                  <span className={cn(
                                    'font-mono text-[9px] px-1 py-0.5 rounded border',
                                    dp.is_special
                                      ? 'text-amber border-amber/30 bg-amber/10 font-bold'
                                      : 'text-muted-2 border-terminal-border-2'
                                  )}>
                                    {dp.phase_label}
                                    {dp.is_special && ' ⭐'}
                                  </span>
                                )
                              })()}
                              {/* Sticker value badge */}
                              {(() => {
                                const sv = estimateStickerValue(h.stickers as any)
                                if (!sv.has_valuable_stickers) return null
                                return (
                                  <span className={cn(
                                    'font-mono text-[9px] px-1 py-0.5 rounded border cursor-help',
                                    sv.flagged_stickers[0]?.tier === 'legendary'
                                      ? 'text-amber border-amber/40 bg-amber/10 font-bold'
                                      : 'text-muted-2 border-terminal-border-2'
                                  )}
                                  title={sv.warning ?? `Sticker value: $${sv.applied_value_min}–$${sv.applied_value_max}`}>
                                    🏷 {sv.flagged_stickers[0]?.tier === 'legendary' ? 'LEGENDARY STICKER' : `+$${sv.applied_value_min}–${sv.applied_value_max}`}
                                  </span>
                                )
                              })()}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Qty / cost — editable inline */}
                      {isEditing ? (
                        <td colSpan={2}>
                          <EditCell holding={h} onSave={() => { setEditId(null); refresh() }} />
                        </td>
                      ) : (
                        <>
                          <td className="term-num font-mono text-xs text-muted-2">{h.quantity}</td>
                          <td className="term-num font-mono text-xs text-muted-2">{fmt$(h.cost_basis)}</td>
                        </>
                      )}

                      <td className="term-num">
                        <div className="font-mono text-xs">{fmt$(h.current_price)}</div>
                        {(() => {
                          // Float premium
                          if (h.float_value != null && h.item_condition) {
                            const fa = estimateFloatAdjustedPrice(h.current_price, h.float_value, h.item_condition, h.item_name)
                            if (fa.float_premium_pct > 10) return (
                              <div className="font-mono text-[8px] text-amber">~{fmt$(fa.adjusted_price)} float</div>
                            )
                          }
                          // Doppler phase
                          const dp = detectDopplerPhase(h.item_name)
                          if (dp.is_special && dp.price_multiplier > 2) return (
                            <div className="font-mono text-[8px] text-amber">~{fmt$(h.current_price * dp.price_multiplier)} phase</div>
                          )
                          return null
                        })()}
                      </td>
                      <td className="term-num font-mono text-xs font-bold">{fmt$(h.total_value)}</td>

                               <td className="term-num">
                        <div className="font-mono text-xs font-bold" style={{ color: up ? 'var(--green)' : 'var(--red)' }}>
                          {fmt$(h.unrealized_pnl, { sign: true })}
                        </div>
                        {/* P&L bar */}
                        <div className="score-bar mt-1 w-16 ml-auto">
                          <div className="score-bar-fill" style={{
                            width: `${Math.min(100, Math.abs(h.unrealized_pnl_pct) * 3)}%`,
                            background: up ? 'var(--green)' : 'var(--red)',
                          }} />
                        </div>
                      </td>

                      <td className="term-num font-mono text-xs" style={{ color: up ? 'var(--green)' : 'var(--red)' }}>
                        {fmtPct(h.unrealized_pnl_pct)}
                      </td>

                      <td className="term-num font-mono text-xs text-muted-3">{h.days_held}d</td>

                      {/* Sell signal indicator */}
                      <td className="term-num">
                        {(() => {
                          const sig = sellSignalMap.get(h.id)
                          if (!sig) return <span className="font-mono text-[9px] text-muted-4">—</span>
                          const cfg = {
                            high:   { label: '🔴 SELL',  color: '#ef4444' },
                            medium: { label: '🟡 WATCH', color: '#f59e0b' },
                            low:    { label: '🟢 NOTE',  color: '#00ff88' },
                          }[sig.urgency] ?? null
                          if (!cfg) return null
                          return (
                            <button
                              onClick={() => setSellHolding(h)}
                              title={sig.recommendation}
                              className="font-mono text-[8px] font-bold px-1.5 py-0.5 rounded border transition-all hover:opacity-80"
                              style={{ color: cfg.color, borderColor: `${cfg.color}40`, background: `${cfg.color}10` }}>
                              {cfg.label}
                            </button>
                          )
                        })()}
                      </td>

                      {/* Actions */}
                      <td>
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => setEditId(isEditing ? null : h.id)}
                            className="btn-terminal py-0.5 px-1.5 text-[9px]" title="Edit">
                            {isEditing ? '✕' : '✎'}
                          </button>
                          <button onClick={() => setSellHolding(h)}
                            className="btn-terminal py-0.5 px-1.5 text-[9px] hover:border-red/30 hover:text-red" title="Sell">
                            SELL
                          </button>
                          <a href={steamMarketUrl(h.item_name)} target="_blank" rel="noopener"
                            onClick={e => e.stopPropagation()}
                            className="btn-terminal py-0.5 px-1.5 text-[9px]" title="Steam Market">↗</a>
                          <button onClick={() => handleDelete(h.id)}
                            className="btn-terminal py-0.5 px-1.5 text-[9px] hover:border-red/30 hover:text-red" title="Delete">✕</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-terminal-border flex-shrink-0">
          <span className="font-mono text-[10px] text-muted-3">{visible.length} positions shown</span>
          <div className="flex items-center gap-3">
            <button onClick={() => {
              const rows = [['Item','Condition','Qty','Cost/unit','Current price','Total value','P&L','P&L %','Days held']]
              for (const h of regularHoldings) {
                rows.push([h.item_name, h.item_condition ?? '', String(h.quantity), h.cost_basis.toFixed(2), h.current_price.toFixed(2), h.total_value.toFixed(2), h.unrealized_pnl.toFixed(2), h.unrealized_pnl_pct.toFixed(2), String(h.days_held)])
              }
              const csv = rows.map(r => r.map(v => /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v).join(',')).join('\n')
              const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
              a.download = `portfolio-${new Date().toISOString().slice(0,10)}.csv`; a.click()
            }} className="btn-terminal text-[10px] py-1">
              ↓ CSV
            </button>
          </div>
        </div>
      </div>

      {/* Storage Units section */}
      {storageUnits.length > 0 && (
        <div className="panel flex-shrink-0">
          <button
            onClick={() => setSuOpen(o => !o)}
            className="w-full flex items-center justify-between px-4 py-3 font-mono text-xs"
          >
            <span className="text-muted-2 uppercase tracking-widest text-[10px]">
              Storage Units
              <span className="ml-2 text-green">{storageUnits.length}</span>
            </span>
            <span className="text-muted-4">{suOpen ? '▲' : '▼'}</span>
          </button>

          {suOpen && (
            <div className="border-t border-terminal-border divide-y divide-terminal-border">
              {storageUnits.map(su => (
                <div key={su.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="text-muted-4 text-sm">📦</span>
                  <div className="flex-1">
                    {suEditId === su.id ? (
                      <input
                        autoFocus
                        defaultValue={suLabels[su.id] ?? su.group_label ?? `Storage Unit`}
                        className="input-terminal text-xs py-0.5 w-48"
                        onBlur={e => renameStorageUnit(su.id, e.target.value || (su.group_label ?? 'Storage Unit'))}
                        onKeyDown={e => {
                          if (e.key === 'Enter') renameStorageUnit(su.id, (e.target as HTMLInputElement).value || (su.group_label ?? 'Storage Unit'))
                          if (e.key === 'Escape') setSuEditId(null)
                        }}
                      />
                    ) : (
                      <button
                        onClick={() => setSuEditId(su.id)}
                        className="font-mono text-xs text-left hover:text-green transition-colors"
                        title="Click to rename"
                      >
                        {suLabels[su.id] ?? su.group_label ?? 'Storage Unit'}
                        <span className="ml-1 text-muted-4 text-[9px]">✎</span>
                      </button>
                    )}
                  </div>
                  <span className="font-mono text-[10px] text-muted-3">
                    {su.steam_asset_id ? `#${su.steam_asset_id}` : ''}
                  </span>
                </div>
              ))}
              <div className="px-4 py-2 font-mono text-[9px] text-muted-4">
                Click a name to rename. Items inside storage units aren't tracked by Steam's inventory API — add them manually via + Add holding.
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {sellHolding && (
        <SellModal holding={sellHolding} fees={fees} onClose={() => setSellHolding(null)}
          onSold={() => { setSellHolding(null); refresh() }} />
      )}
      {showAdd && (
        <AddDrawer portfolioId={portfolioId} onClose={() => setShowAdd(false)}
          onAdded={() => { setShowAdd(false); refresh() }} />
      )}
    </div>
  )
}
