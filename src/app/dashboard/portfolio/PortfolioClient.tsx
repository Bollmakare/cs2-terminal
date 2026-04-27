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

// â”€â”€ Data hook â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€ Sell modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
          <button onClick={onClose} className="text-muted-3 hover:text-red transition-colors ml-auto text-lg leading-none">âœ•</button>
        </div>

        <div className="p-5 space-y-4">
          {/* Item info */}
          <div className="flex items-center gap-3 p-3 rounded border border-terminal-border bg-terminal-surface">
            <img src={skinImg(holding.item_name, 80)} alt="" className="w-16 h-12 object-contain flex-shrink-0"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
            <div>
              <div className="font-mono text-sm font-bold text-[var(--text)]">{holding.item_name}</div>
              <div className="font-mono text-xs text-muted-3 mt-0.5">
                {holding.item_condition ?? 'â€”'} Â· Ã—{holding.quantity} held Â· cost {fmt$(holding.cost_basis)}/unit
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
              <span className="text-red">âˆ’{fmt$(feeAmount)}</span>
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
            {saving ? 'Selling...' : `Sell Ã—${qty} â†’`}
          </button>
        </div>
      </div>
    </div>
  )
}

// â”€â”€ Add holding drawer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
          <button onClick={onClose} className="text-muted-3 hover:text-red transition-colors ml-auto text-lg leading-none">âœ•</button>
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
                        <div className="font-mono text-[9px] text-muted-3">{item.category} Â· {item.condition ?? 'no cond'}</div>
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
                      {selected.condition} Â· Market: {fmt$(selected.price_usd)}
                    </div>
                  </div>
                  <button onClick={() => { setSelected(null); setSearch('') }}
                    className="text-muted-3 hover:text-red text-sm transition-colors">âœ•</button>
                </div>
              )}

              {/* Fields */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-mono text-[9px] uppercase tracking-widest text-muted-3 mb-1.5">Qty</label>
                  <div className="flex">
                    <button onClick={() => setQty(q => Math.max(1, q - 1))}
                      className="w-8 h-9 border border-terminal-border-2 bg-terminal-surface font-mono text-sm flex items-center justify-center rounded-l border-r-0 hover:bg-terminal-muted transition-colors text-muted-2">âˆ’</button>
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
              {saving ? 'Adding...' : 'Add to portfolio â†’'}
            </button>
          </div>
        )}
      </div>
    </>
  )
}

// â”€â”€ Steam import panel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function SteamImportPanel({ portfolioId, onImported }: { portfolioId: string; onImported: () => void }) {
  const [mode, setMode]         = useState<'json' | 'steamid'>('json')
  const [steamId, setSteamId]   = useState('')
  const [jsonText, setJsonText] = useState('')
  const [importing, setImporting] = useState(false)
  const [error, setError]       = useState('')
  const [result, setResult]     = useState<{ imported: number; skins: number; storage_units: number; stackables: number; floats_fetched: number } | null>(null)

  async function handleImport() {
    setImporting(true); setError(''); setResult(null)
    try {
      const body: any = { portfolio_id: portfolioId }
      if (mode === 'json') {
        if (!jsonText.trim()) { setError('Paste your inventory JSON first'); setImporting(false); return }
        body.inventory_json = jsonText.trim()
      } else {
        if (!steamId.trim()) { setError('Enter your SteamID64'); setImporting(false); return }
        body.steam_id = steamId.trim()
      }
      const res = await fetch('/api/holdings/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Import failed')
      setResult(data)
      onImported()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Mode tabs */}
      <div className="flex gap-1 font-mono text-[10px]">
        <button
          onClick={() => setMode('json')}
          className={`px-3 py-1 rounded border transition-colors ${mode === 'json' ? 'border-green/40 text-green bg-green/5' : 'border-border text-muted-3 hover:text-muted-1'}`}
        >Paste JSON</button>
        <button
          onClick={() => setMode('steamid')}
          className={`px-3 py-1 rounded border transition-colors ${mode === 'steamid' ? 'border-green/40 text-green bg-green/5' : 'border-border text-muted-3 hover:text-muted-1'}`}
        >Steam ID</button>
      </div>

      {mode === 'json' ? (
        <div className="space-y-2">
          <div className="p-3 rounded border border-blue/20 bg-blue-soft font-mono text-[10px] text-blue-300 space-y-1">
            <p className="font-bold">How to get your inventory JSON:</p>
            <p>1. Open this URL in your browser (replace with your SteamID64):</p>
            <p className="text-green break-all select-all">https://steamcommunity.com/inventory/76561198XXXXXXXX/730/2?l=english&count=5000</p>
            <p>2. Select all (Ctrl+A) and copy the JSON</p>
            <p>3. Paste it below and click Import</p>
            <p className="text-muted-3">Find your SteamID64 at <a href="https://steamid.io" target="_blank" rel="noopener" className="text-green hover:underline">steamid.io</a></p>
          </div>
          <textarea
            value={jsonText}
            onChange={e => setJsonText(e.target.value)}
            placeholder={`{"assets":[...],"descriptions":[...]}`}
            rows={5}
            className="input-terminal w-full resize-y"
            style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}
          />
          <button onClick={handleImport} disabled={importing || !jsonText.trim()} className="btn-primary w-full">
            {importing ? 'Importingâ€¦' : 'Import inventory â‚’'}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="p-3 rounded border border-blue/20 bg-blue-soft font-mono text-[10px] text-blue-300">
            <p>Requires <code>STEAM_API_KEY</code> set in Vercel environment variables.</p>
            <p className="text-muted-3 mt-1">Inventory must be Public in Steam privacy settings.</p>
          </div>
          <div className="flex gap-2">
            <input type="text" value={steamId} onChange={e => setSteamId(e.target.value)}
              placeholder="76561197995388346" className="input-terminal flex-1"
              style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }} />
            <button onClick={handleImport} disabled={importing || !steamId.trim()} className="btn-primary whitespace-nowrap">
              {importing ? 'Importingâ€¦' : 'Import â†’'}
            </button>
          </div>
          <p className="font-mono text-[9px] text-muted-4">
            Find at <a href="https://steamid.io" target="_blank" rel="noopener" className="text-green hover:underline">steamid.io</a>
          </p>
        </div>
      )}

      {error && <div className="px-3 py-2 rounded border border-red/30 bg-red-soft font-mono text-xs text-red">{error}</div>}

      {result && (
        <div className="px-3 py-2 rounded border border-green/20 bg-green-soft font-mono text-xs text-green space-y-0.5">
          <div>âœ“ {result.imported} rows imported</div>
          <div className="text-muted-2">{result.skins} skins Â· {result.storage_units} storage units Â· {result.stackables} stackable types</div>
          <div className="text-muted-3 mt-1">Click â†» Prices to fetch current market prices.</div>
        </div>
      )}
    </div>
  )
}

// â”€â”€ Edit row inline â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
      <span className="text-muted-4 text-xs">Ã—</span>
      <input type="number" value={cost} step="0.01" onChange={e => setCost(e.target.value)}
        className="input-terminal w-24 text-xs py-1" />
      <button onClick={save} disabled={saving} className="btn-terminal py-1 px-2 text-[10px]">
        {saving ? '...' : 'âœ“'}
      </button>
    </div>
  )
}

// â”€â”€ Allocation donut â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
        <div className="font-mono text-[11px] text-muted-2">{fmt$(d.value)} Â· {d.pct.toFixed(1)}%</div>
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

// â”€â”€ Main portfolio client â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export function PortfolioClient({ portfolioId, portfolioName, steamId, fees }: Props) {
  const qc = useQueryClient()
  const { data: holdings = [], isLoading } = useHoldings(portfolioId)

  // Sell signals â€” load once, map by holding_id for O(1) lookup in table
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

  // â”€â”€ Refresh prices â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€ Storage units â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
          { label: 'NAV', val: fmt$(totalValue), sub: `${regularHoldings.length} positions${storageUnits.length > 0 ? ` Â· ${storageUnits.length} units` : ''}`, col: undefined },
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
              {refreshingPrices ? 'â†» â€¦' : 'â†» Prices'}
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
              <span className="text-4xl text-muted-4">â–¤</span>
              <p className="font-mono text-sm text-muted-2">
                {holdings.length === 0 ? 'Portfolio is empty' : 'No holdings match filters'}
              </p>
              {holdings.length === 0 && (
                <button onClick={() => setShowAdd(true)} className="btn-primary text-sm">
                  Add first holding â†’
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
                  <SortThÛÛH™^\ÈˆX™[H‘^\ÈˆšYÚÏ‚ˆÛ\ÜÓ˜[YOH\›K[[HËLŒ”ÚYÛ˜[Ý‚ˆÛ\ÜÓ˜[YOHËLŽ\›K[[HXÝ[ÛœÏÝ‚ˆÝ‚ˆÝXY‚ˆ›ÙO‚ˆÝš\ÚX›K›X\
OˆÂˆÛÛœÝ\H[œ™X[^™YÜ›HˆÛÛœÝ\ÑY][™ÈHY]YOOHšYˆ™]\›ˆ
ˆˆÙ^O^ÚšYHÛ\ÜÓ˜[YO^ØÛŠ[][™ÈOOHšY	‰ˆ	ÛÜXÚ]KM	Ê_O‚ˆËÊˆ][H
‹ßBˆ‚ˆ]ˆÛ\ÜÓ˜[YOH™›^][\ËXÙ[\ˆØ\Lˆ‚ˆ]ˆÛ\ÜÓ˜[YOHËLHN›Ý[™YY[›^\Úš[šËLˆÝ[O^ÞÈ˜XÚÙÜ›Ý[™ˆÐUÐÓÓÔ–Úš][WØØ]YÛÜžHÏÈ	ÛÝ\‰×H_HÏ‚ˆ]ˆÛ\ÜÓ˜[YOH›Z[‹]ËL‚ˆ]ˆÛ\ÜÓ˜[YOH™›Û[[Û›È^VÌL\H^VÝ˜\ŠK]^
WH[˜Ø]HX^]ËVÌŒHžÚš][WÛ˜[Y_OÙ]‚ˆ]ˆÛ\ÜÓ˜[YOH™›^][\ËXÙ[\ˆØ\LKH]LH›^]Ü˜\‚ˆÚš][WØÛÛ™][Ûˆ	‰ˆ
ˆÜ[ˆÛ\ÜÓ˜[YOH™›Û[[Û›È^VÎ\H^[]]YLÈžÚš][WØÛÛ™][ÛŸOÜÜ[‚ˆ
_BˆÚš\×ÜÝ]˜ZÈ	‰ˆ
ˆÜ[ˆÛ\ÜÓ˜[YOH™›Û[[Û›È^VÎ\H^X[X™\ˆ›ÛX›Û”ÕÜÜ[‚ˆ
_BˆÚ™›Ø]Ý˜[YHOH[	‰ˆ


HOˆÂˆÛÛœÝ˜HHš][WØÛÛ™][Û‚ˆÈ\Ý[X]Q›Ø]Y\ÝYšXÙJ˜Ý\œ™[ÜšXÙK™›Ø]Ý˜[YKš][WØÛÛ™][Û‹š][WÛ˜[YJBˆˆ[ˆ™]\›ˆ
ˆÜ[ˆÛ\ÜÓ˜[YO^ØÛŠˆ	Ù›Û[[Û›È^VÎ\IËˆ˜OË™›Ø]ÝY\ˆOOH	ÙÙ[IÈÈ	Ý^X[X™\ˆ›ÛX›Û	È‚ˆ˜OË™›Ø]ÝY\ˆOOH	ÛÝÉÈÈ	Ý^YÜ™Y[‰Èˆ	Ý^[]]YM	Âˆ
_Bˆ]O^Ù˜OË›X\šÙ]X›WÛ›Ý_O‚ˆÙ›]›Ø]
™›Ø]Ý˜[YJ_BˆÙ˜OË™›Ø]ÝY\ˆOOH	ÙÙ[IÈ	‰ˆ	È<'ä£‰ßBˆÙ˜OË™›Ø]ÝY\ˆOOH	ÛÝÉÈ	‰ˆ˜K™›Ø]Ü™[Z][WÜÝˆH	‰ˆ
ÉÙ˜K™›Ø]Ü™[Z][WÜÝÑš^Y

_IXBˆÜÜ[‚ˆ
BˆJJ
_BˆËÊˆÜ\ˆ\ÙH˜YÙH
‹ßBˆÊ

HOˆÂˆÛÛœÝH]XÝÜ\”\ÙJš][WÛ˜[YJBˆYˆ
Yš\×ÙÜ\ŠH™]\›ˆ[ˆ™]\›ˆ
ˆÜ[ˆÛ\ÜÓ˜[YO^ØÛŠˆ	Ù›Û[[Û›È^VÎ\HLHKLH›Ý[™Y›Ü™\‰Ëˆš\×ÜÜXÚX[ˆÈ	Ý^X[X™\ˆ›Ü™\‹X[X™\‹ÌÌ™ËX[X™\‹ÌL›ÛX›Û	Âˆˆ	Ý^[]]YLˆ›Ü™\‹]\›Z[˜[X›Ü™\‹L‰Âˆ
_O‚ˆÙœ\ÙWÛX™[BˆÙš\×ÜÜXÚX[	‰ˆ	È8«d	ßBˆÜÜ[‚ˆ
BˆJJ
_BˆËÊˆÝXÚÙ\ˆ˜[YH˜YÙH
‹ßBˆÊ

HOˆÂˆÛÛœÝÝˆH\Ý[X]TÝXÚÙ\•˜[YJœÝXÚÙ\œÈ\È[žJBˆYˆ
\Ý‹š\×Ý˜[XX›WÜÝXÚÙ\œÊH™]\›ˆ[ˆ™]\›ˆ
ˆÜ[ˆÛ\ÜÓ˜[YO^ØÛŠˆ	Ù›Û[[Û›È^VÎ\HLHKLH›Ý[™Y›Ü™\ˆÝ\œÛÜ‹Z[	ËˆÝ‹™›YÙÙYÜÝXÚÙ\œÖÌOËY\ˆOOH	ÛYÙ[™\žIÂˆÈ	Ý^X[X™\ˆ›Ü™\‹X[X™\‹Í™ËX[X™\‹ÌL›ÛX›Û	Âˆˆ	Ý^[]]YLˆ›Ü™\‹]\›Z[˜[X›Ü™\‹L‰Âˆ
_Bˆ]O^ÜÝ‹Ø\›š[™ÈÏÈÝXÚÙ\ˆ˜[YNˆ		ÜÝ‹˜\YYÝ˜[YWÛZ[Ÿx $É	ÜÝ‹˜\YYÝ˜[YWÛX^XO‚ˆ<'ãíÈÜÝ‹™›YÙÙYÜÝXÚÙ\œÖÌOËY\ˆOOH	ÛYÙ[™\žIÈÈ	ÓQÑS‘T–HÕPÒÑT‰Èˆ
É	ÜÝ‹˜\YYÝ˜[YWÛZ[Ÿx $ÉÜÝ‹˜\YYÝ˜[YWÛX^XBˆÜÜ[‚ˆ
BˆJJ
_BˆÙ]‚ˆÙ]‚ˆÙ]‚ˆÝ‚‚ˆËÊˆ]HÈÛÜÝ8 %Y]X›H[›[™H
‹ßBˆÚ\ÑY][™ÈÈ
ˆÛÛÜ[^ÌŸO‚ˆY]Ù[Û[™Ï^ÚHÛ”Ø]™O^Ê
HOˆÈÙ]Y]Y
[
NÈ™Yœ™\Ú

H_HÏ‚ˆÝ‚ˆ
Hˆ
ˆ‚ˆÛ\ÜÓ˜[YOH\›K[[H›Û[[Û›È^^È^[]]YLˆžÚœ]X[]_OÝ‚ˆÛ\ÜÓ˜[YOH\›K[[H›Û[[Û›È^^È^[]]YLˆžÙ›]	
˜ÛÜÝØ˜\Ú\Ê_OÝ‚ˆÏ‚ˆ
_B‚ˆÛ\ÜÓ˜[YOH\›K[[H‚ˆ]ˆÛ\ÜÓ˜[YOH™›Û[[Û›È^^ÈžÙ›]	
˜Ý\œ™[ÜšXÙJ_OÙ]‚ˆÊ

HOˆÂˆËÈ›Ø]™[Z][BˆYˆ
™›Ø]Ý˜[YHOH[	‰ˆš][WØÛÛ™][ÛŠHÂˆÛÛœÝ˜HH\Ý[X]Q›Ø]Y\ÝYšXÙJ˜Ý\œ™[ÜšXÙK™›Ø]Ý˜[YKš][WØÛÛ™][Û‹š][WÛ˜[YJBˆYˆ
˜K™›Ø]Ü™[Z][WÜÝˆL
H™]\›ˆ
ˆ]ˆÛ\ÜÓ˜[YOH™›Û[[Û›È^VÎH^X[X™\ˆŸžÙ›]	
˜K˜Y\ÝYÜšXÙJ_H›Ø]Ù]‚ˆ
BˆBˆËÈÜ\ˆ\ÙBˆÛÛœÝH]XÝÜ\”\ÙJš][WÛ˜[YJBˆYˆ
š\×ÜÜXÚX[	‰ˆœšXÙWÛ][\Y\ˆˆŠH™]\›ˆ
ˆ]ˆÛ\ÜÓ˜[YOH™›Û[[Û›È^VÎH^X[X™\ˆŸžÙ›]	
˜Ý\œ™[ÜšXÙH
ˆœšXÙWÛ][\Y\Š_H\ÙOÙ]‚ˆ
Bˆ™]\›ˆ[ˆJJ
_BˆÝ‚ˆÛ\ÜÓ˜[YOH\›K[[H›Û[[Û›È^^È›ÛX›ÛžÙ›]	
Ý[Ý˜[YJ_OÝ‚‚ˆÛ\ÜÓ˜[YOH\›K[[H‚ˆ]ˆÛ\ÜÓ˜[YOH™›Û[[Û›È^^È›ÛX›ÛˆÝ[O^ÞÈÛÛÜŽˆ\È	Ý˜\ŠKYÜ™Y[ŠIÈˆ	Ý˜\ŠK\™Y
IÈ_O‚ˆÙ›]	
[œ™X[^™YÜ›ÈÚYÛŽˆYHJ_BˆÙ]‚ˆËÊˆ	“˜\ˆ
‹ßBˆ]ˆÛ\ÜÓ˜[YOHœØÛÜ™KX˜\ˆ]LHËLMˆ[X]]È‚ˆ]ˆÛ\ÜÓ˜[YOHœØÛÜ™KX˜\‹Yš[ˆÝ[O^ÞÂˆÚYˆ	ÓX]›Z[ŠLX]˜XœÊ[œ™X[^™YÜ›ÜÝ
H
ˆÊ_IXˆ˜XÚÙÜ›Ý[™ˆ\È	Ý˜\ŠKYÜ™Y[ŠIÈˆ	Ý˜\ŠK\™Y
IËˆ_HÏ‚ˆÙ]‚ˆÝ‚‚ˆÛ\ÜÓ˜[YOH\›K[[H›Û[[Û›È^^ÈˆÝ[O^ÞÈÛÛÜŽˆ\È	Ý˜\ŠKYÜ™Y[ŠIÈˆ	Ý˜\ŠK\™Y
IÈ_O‚ˆÙ›]Ý
[œ™X[^™YÜ›ÜÝ
_BˆÝ‚‚ˆÛ\ÜÓ˜[YOH\›K[[H›Û[[Û›È^^È^[]]YLÈžÚ™^\×Ú[YÝ‚‚ˆËÊˆÙ[ÚYÛ˜[[™XØ]Üˆ
‹ßBˆÛ\ÜÓ˜[YOH\›K[[H‚ˆÊ

HOˆÂˆÛÛœÝÚYÈHÙ[ÚYÛ˜[X\™Ù]
šY
BˆYˆ
\ÚYÊH™]\›ˆÜ[ˆÛ\ÜÓ˜[YOH™›Û[[Û›È^VÎ\H^[]]YM¸ %ÜÜ[‚ˆÛÛœÝÙ™ÈHÂˆYÚˆÈX™[ˆ	ü'å-ÑS	ËÛÛÜŽˆ	ÈÙY	ÈKˆYY][NˆÈX™[ˆ	ü'çèHÐUÒ	ËÛÛÜŽˆ	ÈÙNYL‰ÈKˆÝÎˆÈX™[ˆ	ü'çèˆ“ÕIËÛÛÜŽˆ	ÈÌ™Ž	ÈKˆVÜÚYË\™Ù[˜ÞWHÏÈ[ˆYˆ
XÙ™ÊH™]\›ˆ[ˆ™]\›ˆ
ˆ]Û‚ˆÛÛXÚÏ^Ê
HOˆÙ]Ù[Û[™Ê
_Bˆ]O^ÜÚYËœ™XÛÛ[Y[™][ÛŸBˆÛ\ÜÓ˜[YOH™›Û[[Û›È^VÎH›ÛX›ÛLKHKLH›Ý[™Y›Ü™\ˆ˜[œÚ][Û‹X[Ý™\Ž›ÜXÚ]KN‚ˆÝ[O^ÞÈÛÛÜŽˆÙ™Ë˜ÛÛÜ‹›Ü™\ÛÛÜŽˆ	ØÙ™Ë˜ÛÛÜŸM˜XÚÙÜ›Ý[™ˆ	ØÙ™Ë˜ÛÛÜŸLL_O‚ˆØÙ™Ë›X™[BˆØ]Û‚ˆ
BˆJJ
_BˆÝ‚‚ˆËÊˆXÝ[ÛœÈ
‹ßBˆ‚ˆ]ˆÛ\ÜÓ˜[YOH™›^][\ËXÙ[\ˆ\ÝYžKY[™Ø\LH‚ˆ]ÛˆÛÛXÚÏ^Ê
HOˆÙ]Y]Y
\ÑY][™ÈÈ[ˆšY
_BˆÛ\ÜÓ˜[YOH˜‹]\›Z[˜[KLHLKH^VÎ\Hˆ]OH‘Y]‚ˆÚ\ÑY][™ÈÈ	ø§%IÈˆ	ø§#‰ßBˆØ]Û‚ˆ]ÛˆÛÛXÚÏ^Ê
HOˆÙ]Ù[Û[™Ê
_BˆÛ\ÜÓ˜[YOH˜‹]\›Z[˜[KLHLKH^VÎ\HÝ™\Ž˜›Ü™\‹\™YÌÌÝ™\Ž^\™Yˆ]OH”Ù[‚ˆÑSˆØ]Û‚ˆH™Y^ÜÝX[SX\šÙ]\›
š][WÛ˜[YJ_H\™Ù]H—Ø›[šÈˆ™[H››ÛÜ[™\ˆ‚ˆÛÛXÚÏ^ÙHOˆKœÝÜ›ÜYØ][ÛŠ
_BˆÛ\ÜÓ˜[YOH˜‹]\›Z[˜[KLHLKH^VÎ\Hˆ]OH”ÝX[HX\šÙ]¸¡¥ÏØO‚ˆ]ÛˆÛÛXÚÏ^Ê
HOˆ[™Q[]JšY
_BˆÛ\ÜÓ˜[YOH˜‹]\›Z[˜[KLHLKH^VÎ\HÝ™\Ž˜›Ü™\‹\™YÌÌÝ™\Ž^\™Yˆ]OH‘[]H¸§%OØ]Û‚ˆÙ]‚ˆÝ‚ˆÝ‚ˆ
BˆJ_BˆÝ›ÙO‚ˆÝX›O‚ˆ
_BˆÙ]‚‚ˆËÊˆ›ÛÝ\ˆ
‹ßBˆ]ˆÛ\ÜÓ˜[YOH™›^][\ËXÙ[\ˆ\ÝYžKX™]ÙY[ˆMKLˆ›Ü™\‹]›Ü™\‹]\›Z[˜[X›Ü™\ˆ›^\Úš[šËL‚ˆÜ[ˆÛ\ÜÓ˜[YOH™›Û[[Û›È^VÌLH^[]]YLÈžÝš\ÚX›K›[™ÝHÜÚ][ÛœÈÚÝÛÜÜ[‚ˆ]ˆÛ\ÜÓ˜[YOH™›^][\ËXÙ[\ˆØ\LÈ‚ˆ]ÛˆÛÛXÚÏ^Ê
HOˆÂˆÛÛœÝ›ÝÜÈHÖÉÒ][IË	ÐÛÛ™][Û‰Ë	Ô]IË	ÐÛÜÝÝ[š]	Ë	ÐÝ\œ™[šXÙIË	ÕÝ[˜[YIË	Ô	“	Ë	Ô	“	IË	Ñ^\È[	×WBˆ›Üˆ
ÛÛœÝÙˆ™YÝ[\’Û[™ÜÊHÂˆ›ÝÜËœ\Ú
Úš][WÛ˜[YKš][WØÛÛ™][ÛˆÏÈ	ÉËÝš[™Êœ]X[]JK˜ÛÜÝØ˜\Ú\ËÑš^Y
ŠK˜Ý\œ™[ÜšXÙKÑš^Y
ŠKÝ[Ý˜[YKÑš^Y
ŠK[œ™X[^™YÜ›Ñš^Y
ŠK[œ™X[^™YÜ›ÜÝÑš^Y
ŠKÝš[™Ê™^\×Ú[
WJBˆBˆÛÛœÝÜÝˆH›ÝÜË›X\
ˆOˆ‹›X\
ˆOˆÖÈ‹—KË\Ý
ŠHÈ‰Ý‹œ™\XÙJÈ‹ÙË	Èˆ‰Ê_H˜ˆŠKš›Ú[Š	Ë	ÊJKš›Ú[Š	×‰ÊBˆÛÛœÝHHØÝ[Y[˜Ü™X]Q[[Y[
	ØIÊNÈKš™YˆHT“˜Ü™X]SØš™XÝT“
™]È›ØŠØÜÝ—KÈ\Nˆ	Ý^ØÜÝ‰ÈJJBˆK™ÝÛ›ØYHÜ›Û[ËIÛ™]È]J
KÒTÓÔÝš[™Ê
KœÛXÙJL
_K˜ÜÝ˜ÈK˜ÛXÚÊ
Bˆ_HÛ\ÜÓ˜[YOH˜‹]\›Z[˜[^VÌLHKLH‚ˆø¡¤ÈÔÕ‚ˆØ]Û‚ˆÙ]‚ˆÙ]‚ˆÙ]‚‚ˆËÊˆÝÜ˜YÙH[š]ÈÙXÝ[Ûˆ
‹ßBˆÜÝÜ˜YÙU[š]Ë›[™Ýˆ	‰ˆ
ˆ]ˆÛ\ÜÓ˜[YOHœ[™[›^\Úš[šËL‚ˆ]Û‚ˆÛÛXÚÏ^Ê
HOˆÙ]ÝSÜ[ŠÈOˆ[Ê_BˆÛ\ÜÓ˜[YOHËY[›^][\ËXÙ[\ˆ\ÝYžKX™]ÙY[ˆMKLÈ›Û[[Û›È^^È‚ˆ‚ˆÜ[ˆÛ\ÜÓ˜[YOH^[]]YLˆ\\˜Ø\ÙH˜XÚÚ[™Ë]ÚY\Ý^VÌLH‚ˆÝÜ˜YÙH[š]ÂˆÜ[ˆÛ\ÜÓ˜[YOH›[Lˆ^YÜ™Y[ˆžÜÝÜ˜YÙU[š]Ë›[™ÝOÜÜ[‚ˆÜÜ[‚ˆÜ[ˆÛ\ÜÓ˜[YOH^[]]YMžÜÝSÜ[ˆÈ	ø§,‰Èˆ	ø¥¯	ßOÜÜ[‚ˆØ]Û‚‚ˆÜÝSÜ[ˆ	‰ˆ
ˆ]ˆÛ\ÜÓ˜[YOH˜›Ü™\‹]›Ü™\‹]\›Z[˜[X›Ü™\ˆ]šYK^H]šYK]\›Z[˜[X›Ü™\ˆ‚ˆÜÝÜ˜YÙU[š]Ë›X\
ÝHOˆ
ˆ]ˆÙ^O^ÜÝKšYHÛ\ÜÓ˜[YOH™›^][\ËXÙ[\ˆØ\LÈMKL‹H‚ˆÜ[ˆÛ\ÜÓ˜[YOH^[]]YM^\ÛH¼'äéÜÜ[‚ˆ]ˆÛ\ÜÓ˜[YOH™›^LH‚ˆÜÝQY]YOOHÝKšYÈ
ˆ[œ]ˆ]]Ñ›ØÝ\ÂˆY˜][˜[YO^ÜÝSX™[ÖÜÝKšYHÏÈÝK™Ü›Ý\ÛX™[ÏÈÝÜ˜YÙH[š]BˆÛ\ÜÓ˜[YOHš[œ]]\›Z[˜[^^ÈKLHËM‚ˆÛ›\^ÙHOˆ™[˜[YTÝÜ˜YÙU[š]
ÝKšYK\™Ù]˜[YH
ÝK™Ü›Ý\ÛX™[ÏÈ	ÔÝÜ˜YÙH[š]	ÊJ_BˆÛ’Ù^QÝÛ^ÙHOˆÂˆYˆ
KšÙ^HOOH	Ñ[\‰ÊH™[˜[YTÝÜ˜YÙU[š]
ÝKšY
K\™Ù]\ÈS[œ][[Y[
K˜[YH
ÝK™Ü›Ý\ÛX™[ÏÈ	ÔÝÜ˜YÙH[š]	ÊJBˆYˆ
KšÙ^HOOH	Ñ\ØØ\IÊHÙ]ÝQY]Y
[
Bˆ_BˆÏ‚ˆ
Hˆ
ˆ]Û‚ˆÛÛXÚÏ^Ê
HOˆÙ]ÝQY]Y
ÝKšY
_BˆÛ\ÜÓ˜[YOH™›Û[[Û›È^^È^[YÝ™\Ž^YÜ™Y[ˆ˜[œÚ][Û‹XÛÛÜœÈ‚ˆ]OHÛXÚÈÈ™[˜[YH‚ˆ‚ˆÜÝSX™[ÖÜÝKšYHÏÈÝK™Ü›Ý\ÛX™[ÏÈ	ÔÝÜ˜YÙH[š]	ßBˆÜ[ˆÛ\ÜÓ˜[YOH›[LH^[]]YM^VÎ\H¸§#ÜÜ[‚ˆÂö'WGFöãà¢—Ð¢ÂöF—cà¢Ç7â6Æ74æÖSÒ&föçBÖÖöæòFW‡BÕ³…ÒFW‡BÖ×WFVBÓ2#à¢·7Rç7FVÕö76WEö–Bò2G·7Rç7FVÕö76WEö–GÖ¢rwÐ¢Â÷7ãà¢ÂöF—cà¢’—Ð¢ÆF—b6Æ74æÖSÒ'‚ÓB’Ó"föçBÖÖöæòFW‡BÕ³—…ÒFW‡BÖ×WFVBÓB#à¢6Æ–6²æÖRFò&VæÖRâ—FV×2–ç6–FR7F÷&vRVæ—G2&VâwBG&6¶VB'’7FVÒw2–çfVçF÷'’’(	BFBF†VÒÖçVÆÇ’f–²FB†öÆF–ærà¢ÂöF—cà¢ÂöF—cà¢—Ð¢ÂöF—cà¢—Ð ¢²ò¢ÖöFÇ2¢÷Ð¢·6VÆÄ†öÆF–ærbb€¢Å6VÆÄÖöFÂ†öÆF–æs×·6VÆÄ†öÆF–æwÒfVW3×¶fVW7Òöä6Æ÷6S×²‚’Óâ6WE6VÆÄ†öÆF–ær†çVÆÂ—Ð¢öå6öÆC×²‚’Óâ²6WE6VÆÄ†öÆF–ær†çVÆÂ“²&Vg&W6‚‚’×Òóà¢—Ð¢·6†÷tFBbb€¢ÄFDG&vW"÷'FföÆ–ô–C×·÷'FföÆ–ô–GÒöä6Æ÷6S×²‚’Óâ6WE6†÷tFB†fÇ6R—Ð¢öäFFVC×²‚’Óâ²6WE6†÷tFB†fÇ6R“²&Vg&W6‚‚’×Òóà¢—Ð¢ÂöF—cà¢§Ð