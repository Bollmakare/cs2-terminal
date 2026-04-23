'use client'

import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { fmt$, fmtPct, CAT_COLOR, skinImg, verdictClass, scoreColor } from '@/lib/utils'

type WLSort = 'added' | 'price_asc' | 'price_desc' | 'alert'

function useWatchlist() {
  return useQuery({
    queryKey: ['watchlist'],
    queryFn: async () => {
      const res = await fetch('/api/watchlist')
      const { items } = await res.json()
      return items ?? []
    },
    refetchInterval: 5 * 60_000,
  })
}

function AlertRow({
  label, value, color, placeholder, onSet, onClear,
}: {
  label: string; value: number | null; color: string; placeholder: string
  onSet: (v: number) => void; onClear: () => void
}) {
  const [input, setInput] = useState(value?.toFixed(2) ?? '')

  return (
    <div className="p-2.5 rounded border" style={{ borderColor: `${color}22`, background: `${color}08` }}>
      <div className="font-mono text-[9px] uppercase tracking-widest mb-1.5" style={{ color }}>
        {label}
      </div>
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-xs text-muted-3">$</span>
        <input type="number" value={input} onChange={e => setInput(e.target.value)}
          placeholder={placeholder} step="0.01" min="0"
          className="input-terminal py-1 text-xs flex-1" style={{ height: 28 }} />
        <button onClick={() => { const v = parseFloat(input); if (v > 0) onSet(v) }}
          className="font-mono text-[10px] px-2 py-1 rounded border transition-all"
          style={{ borderColor: `${color}44`, color, background: `${color}10` }}>
          Set
        </button>
        {value && (
          <button onClick={() => { setInput(''); onClear() }}
            className="font-mono text-[10px] text-muted-3 hover:text-red transition-colors"></button>
        )}
      </div>
      {value && (
        <div className="font-mono text-[9px] mt-1" style={{ color }}>
          Alert: {fmt$(value)}
        </div>
      )}
    </div>
  )
}

function WatchCard({ item, onRemove, onUpdateAlerts }: {
  key?: string
  item: any
  onRemove: () => void | Promise<void>
  onUpdateAlerts: (buy: number | null, sell: number | null) => void | Promise<void>
}) {
  const [expanded, setExpanded] = useState(false)
  const price    = item.item?.price_usd ?? null
  const d7       = item.item?.price_7d_change_pct ?? null
  const arb      = item.item?.arb_spread_pct ?? null
  const buyAlert = item.alert_buy
  const sellAlert = item.alert_sell

  const buyTriggered  = buyAlert  && price != null && price <= buyAlert
  const sellTriggered = sellAlert && price != null && price >= sellAlert

  return (
    <div className={`panel flex flex-col transition-all ${buyTriggered ? 'ring-1 ring-green/40' : sellTriggered ? 'ring-1 ring-red/40' : ''}`}>
      {/* Header */}
      <div className="flex items-start gap-2 p-3 cursor-pointer" onClick={() => setExpanded(e => !e)}>
        <img src={skinImg(item.item_name, 80)} alt=""
          className="w-12 h-9 object-contain flex-shrink-0 rounded"
          onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
        <div className="flex-1 min-w-0">
          <div className="font-mono text-[11px] font-bold text-[var(--text)] truncate">{item.item_name}</div>
          <div className="flex items-center gap-2 mt-1">
            <span className="font-mono text-sm font-bold tabular-nums text-[var(--text)]">{fmt$(price)}</span>
            {d7 != null && (
              <span className={`font-mono text-[10px] font-bold ${d7 >= 0 ? 'text-green' : 'text-red'}`}>{fmtPct(d7)}</span>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <button onClick={e => { e.stopPropagation(); onRemove() }}
            className="text-muted-4 hover:text-red transition-colors text-xs"></button>
          <span className="font-mono text-[9px] text-muted-4">{expanded ? '' : ''}</span>
        </div>
      </div>

      {/* Alert status bar */}
      {(buyAlert || sellAlert) && (
        <div className="flex items-center gap-2 px-3 pb-2">
          {buyAlert && (
            <div className={`flex items-center gap-1 font-mono text-[9px] px-2 py-0.5 rounded ${buyTriggered ? 'bg-green-soft text-green animate-pulse' : 'bg-terminal-muted text-muted-3'}`}>
              {buyTriggered ? '' : ''} BUY {fmt$(buyAlert)}
            </div>
          )}
          {sellAlert && (
            <div className={`flex items-center gap-1 font-mono text-[9px] px-2 py-0.5 rounded ${sellTriggered ? 'bg-red-soft text-red animate-pulse' : 'bg-terminal-muted text-muted-3'}`}>
              {sellTriggered ? '' : ''} SELL {fmt$(sellAlert)}
            </div>
          )}
          {arb && arb > 5 && (
            <div className="font-mono text-[9px] px-2 py-0.5 rounded bg-amber-soft text-amber">
              ARB +{arb.toFixed(1)}%
            </div>
          )}
        </div>
      )}

      {/* Expanded: alert config + market data */}
      {expanded && (
        <div className="px-3 pb-3 space-y-2.5 border-t border-terminal-border pt-2.5">
          <AlertRow label=" Buy alert  trigger when price drops to"
            value={buyAlert} color="var(--green)" placeholder={price ? (price * 0.9).toFixed(2) : '0.00'}
            onSet={v => onUpdateAlerts(v, sellAlert ?? null)}
            onClear={() => onUpdateAlerts(null, sellAlert ?? null)} />
          <AlertRow label=" Sell alert  trigger when price rises to"
            value={sellAlert} color="var(--red)" placeholder={price ? (price * 1.15).toFixed(2) : '0.00'}
            onSet={v => onUpdateAlerts(buyAlert ?? null, v)}
            onClear={() => onUpdateAlerts(buyAlert ?? null, null)} />

          {/* Market data */}
          {(item.item?.price_usd || item.item?.price_steam || item.item?.price_buff) && (
            <div className="pt-1">
              <div className="font-mono text-[9px] uppercase tracking-widest text-muted-3 mb-1.5">Market prices</div>
              <div className="space-y-1">
                {[
                  ['Best',     item.item?.price_usd],
                  ['Steam',    item.item?.price_steam],
                  ['Buff163',  item.item?.price_buff],
                ].filter(([, v]) => v != null).map(([label, v]) => (
                  <div key={label as string} className="flex justify-between font-mono text-xs">
                    <span className="text-muted-3">{label}</span>
                    <span>{fmt$(v as number)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {item.note && (
            <p className="font-mono text-[10px] text-muted-3 border-t border-terminal-border pt-2">{item.note}</p>
          )}
        </div>
      )}
    </div>
  )
}

export function WatchlistClient() {
  const qc = useQueryClient()
  const { data: items = [], isLoading } = useWatchlist()
  const [sort, setSort]     = useState<WLSort>('added')
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)
  const [newItem, setNewItem] = useState('')
  const [newNote, setNewNote] = useState('')
  const [addLoading, setAddLoading] = useState(false)
  const [addResults, setAddResults] = useState<any[]>([])

  // Search items for adding
  useEffect(() => {
    if (!newItem.trim() || newItem.length < 2) { setAddResults([]); return }
    const t = setTimeout(async () => {
      const supabase = createClient()
      const { data } = await supabase.from('items')
        .select('id, market_hash_name, category, condition, price_usd')
        .ilike('market_hash_name', `%${newItem}%`)
        .order('price_usd', { ascending: false, nullsFirst: false })
        .limit(8)
      setAddResults(data ?? [])
    }, 200)
    return () => clearTimeout(t)
  }, [newItem])

  async function handleAdd(item: any) {
    setAddLoading(true)
    await fetch('/api/watchlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_id: item.id, item_name: item.market_hash_name, note: newNote || null }),
    })
    setAdding(false); setNewItem(''); setNewNote(''); setAddResults([])
    setAddLoading(false)
    qc.invalidateQueries({ queryKey: ['watchlist'] })
  }

  async function handleRemove(id: string) {
    await fetch('/api/watchlist', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    qc.invalidateQueries({ queryKey: ['watchlist'] })
  }

  async function handleUpdateAlerts(id: string, item_id: string | null, item_name: string, alert_buy: number | null, alert_sell: number | null) {
    await fetch('/api/watchlist', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, alert_buy, alert_sell }),
    })
    qc.invalidateQueries({ queryKey: ['watchlist'] })
  }

  // Sort
  const sorted = [...items]
    .filter((i: any) => !search || i.item_name.toLowerCase().includes(search.toLowerCase()))
    .sort((a: any, b: any) => {
      if (sort === 'price_asc')  return (a.item?.price_usd ?? 0) - (b.item?.price_usd ?? 0)
      if (sort === 'price_desc') return (b.item?.price_usd ?? 0) - (a.item?.price_usd ?? 0)
  2   if (sort === 'alert')      return ((a.alert_buy || a.alert_sell) ? -1 : 1)
      return new Date(b.added_at).getTime() - new Date(a.added_at).getTime()
    })

  const triggered = sorted.filter((i: any) => {
    const p = i.item?.price_usd
    return (i.alert_buy && p && p <= i.alert_buy) || (i.alert_sell && p && p >= i.alert_sell)
  })

  return (
    <div className="flex flex-col gap-3 h-[calc(100vh-88px)] overflow-hidden">
      {/* Alert banner */}
      {triggered.length > 0 && (
        <div className="flex items-center gap-3 p-3 rounded border border-green/30 bg-green-soft flex-shrink-0 animate-pulse-green">
          <span className="font-mono text-xs text-green font-bold"> {triggered.length} ALERT{triggered.length > 1 ? 'S' : ''} TRIGGERED</span>
          {triggered.slice(0, 3).map((i: any) => (
            <span key={i.id} className="font-mono text-[10px] text-green/80">{i.item_name}</span>
          ))}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Filter watchlist..." className="input-terminal text-xs py-1.5 w-52" />

        <div className="flex gap-1">
          {[
            { id: 'added' as WLSort,      label: 'Recent' },
            { id: 'price_desc' as WLSort, label: 'Price ' },
            { id: 'price_asc' as WLSort,  label: 'Price ' },
            { id: 'alert' as WLSort,      label: 'Alerts' },
          ].map(s => (
            <button key={s.id} onClick={() => setSort(s.id)}
              className={`btn-terminal text-[10px] py-1 ${sort === s.id ? 'border-green/30 text-green bg-green-soft' : ''}`}>
              {s.label}
            </button>
          ))}
        </div>

        <div className="ml-auto">
          <button onClick={() => setAdding(a => !a)} className="btn-primary text-xs py-1.5">
            {adding ? ' Cancel' : '+ Watch item'}
          </button>
        </div>
      </div>

      {/* Add panel */}
      {adding && (
        <div className="panel p-4 flex-shrink-0">
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-3 mb-3">ADD TO WATCHLIST</div>
  3       <div className="flex gap-3">
            <div className="flex-1 relative">
              <input type="text" value={newItem} onChange={e => setNewItem(e.target.value)} autoFocus
                placeholder="Search item..." className="input-terminal text-sm" />
              {addResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 z-20 mt-1 rounded border border-terminal-border-2 bg-[#0d0d0d] shadow-xl overflow-hidden">
                  {addResults.map(item => (
                    <div key={item.id}
                      className="flex items-center gap-3 px-3 py-2 hover:bg-green-soft cursor-pointer border-b border-terminal-border last:border-0 transition-colors"
                      onClick={() => handleAdd(item)}>
                      <div className="flex-1 min-w-0">
                        <div className="font-mono text-xs text-[var(--text)] truncate">{item.market_hash_name}</div>
                        <div className="font-mono text-[9px] text-muted-3">{item.category} . {item.condition}</div>
                      </div>
                      <span className="font-mono text-xs text-muted-2">{fmt$(item.price_usd)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <input type="text" value={newNote} onChange={e => setNewNote(e.target.value)}
              placeholder="Note (optional)" className="input-terminal text-sm w-48" />
          </div>
        2 <p className="font-mono text-[10px] text-muted-4 mt-2">Click an item from search results to add it.</p>
        </div>
      )}

      {/* Cards grid */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-24 skeleton rounded" />)}
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <span className="text-4xl text-muted-4"></span>
            <p className="font-mono text-sm text-muted-2">Watchlist is empty</p>
            <p className="font-mono text-xs text-muted-3">Add items to track prices and set alerts</p>
            <button onClick={() => setAdding(true)} className="btn-primary text-sm mt-1">+ Add first item</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {sorted.map((item: any) => (
              <WatchCard
       2        key={item.id}
                item={item}
                onRemove={() => handleRemove(item.id)}
                onUpdateAlerts={(buy, sell) => handleUpdateAlerts(item.id, item.item_id, item.item_name, buy, sell)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="font-mono text-[9px] text-muted-4 text-center flex-shrink-0">
        ALERTS CHECK AGAINST LATEST SKINSTRACK PRICES . NOT FINANCIAL ADVICE
      </div>
    </div>
  )
}
