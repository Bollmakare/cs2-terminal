'use client'
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fmt$ } from '@/lib/utils'

interface SteamDesc { classid: string; instanceid: string; market_hash_name: string; icon_url: string; tradable: number; marketable: number; tags?: unknown[] }
interface SteamAsset { assetid: string; classid: string; instanceid: string }
interface PricedItem { assetid: string; market_hash_name: string; icon_url: string; tradable: number; marketable: number; price_usd: number | null; item_id: string | null }

async function fetchSteamInventory(steamId: string): Promise<PricedItem[]> {
  // Fetch inventory directly from Steam (browser request, no CORS issue)
  const res = await fetch(`https://steamcommunity.com/inventory/${steamId}/730/2?l=english&count=5000`)
  if (res.status === 403) throw new Error('Inventory is private - set to Public in Steam Privacy Settings')
  if (!res.ok) throw new Error('Steam returned ' + res.status + ' - try again in a moment')
  const data = await res.json()
  if (!data.assets || !data.descriptions) return []

  // Build description map
  const descMap = new Map<string, SteamDesc>()
  for (const d of data.descriptions as SteamDesc[]) descMap.set(`${d.classid}_${d.instanceid}`, d)

  // Get marketable items
  const items = (data.assets as SteamAsset[]).map(asset => {
    const desc = descMap.get(`${asset.classid}_${asset.instanceid}`)
    if (!desc || !desc.market_hash_name) return null
    return { assetid: asset.assetid, market_hash_name: desc.market_hash_name, icon_url: desc.icon_url, tradable: desc.tradable, marketable: desc.marketable }
  }).filter(Boolean) as Omit<PricedItem, 'price_usd' | 'item_id'>[]

  // Get prices from our API
  const names = [...new Set(items.filter(i => i.marketable).map(i => i.market_hash_name))]
  let priceMap = new Map<string, { id: string; price_usd: number | null }>()
  if (names.length > 0) {
    try {
      const pr = await fetch('/api/items/prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ names: names.slice(0, 500) }),
      })
      if (pr.ok) {
        const pd = await pr.json()
        for (const p of (pd.items || [])) priceMap.set(p.market_hash_name, { id: p.id, price_usd: p.price_usd })
      }
    } catch {}
  }

  return items.map(i => ({ ...i, price_usd: priceMap.get(i.market_hash_name)?.price_usd ?? null, item_id: priceMap.get(i.market_hash_name)?.id ?? null }))
}

export function InventoryClient({ steamId, portfolioId }: { steamId: string | null; portfolioId: string | null }) {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [importing, setImporting] = useState<Set<string>>(new Set())
  const [imported, setImported] = useState<Set<string>>(new Set())
  const [manualId, setManualId] = useState('')
  const [activeId, setActiveId] = useState(steamId)

  const { data: items = [], isLoading, error, refetch } = useQuery({
    queryKey: ['steam-inv', activeId],
    queryFn: () => fetchSteamInventory(activeId!),
    enabled: !!activeId,
    staleTime: 5 * 60_000,
    retry: 1,
  })

  const filtered = items.filter(i => !search || i.market_hash_name.toLowerCase().includes(search.toLowerCase()))

  const getCond = (name: string) => {
    const m = name.match(/[(](Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)[)]/)
    return m ? m[1] : null
  }

  const addOne = async (item: PricedItem) => {
    if (!portfolioId || importing.has(item.assetid) || imported.has(item.assetid)) return
    setImporting(p => new Set([...p, item.assetid]))
    try {
      const res = await fetch('/api/holdings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ portfolio_id: portfolioId, item_id: item.item_id, item_name: item.market_hash_name, item_condition: getCond(item.market_hash_name), quantity: 1, cost_basis: item.price_usd ?? 0, steam_asset_id: item.assetid }),
      })
      if (res.ok) { setImported(p => new Set([...p, item.assetid])); qc.invalidateQueries({ queryKey: ['holdings'] }) }
    } finally { setImporting(p => { const s = new Set(p); s.delete(item.assetid); return s }) }
  }

  if (!activeId) return (
    <div className='flex flex-col items-center justify-center h-[calc(100vh-88px)] gap-6'>
      <div className='panel p-8 max-w-md w-full'>
        <div className='font-mono text-[11px] uppercase tracking-widest text-muted-3 mb-4'>Steam Inventory</div>
        <p className='font-mono text-sm text-muted-2 mb-6'>Enter your Steam ID64 to view your CS2 inventory with live prices.</p>
        <div className='flex gap-2'>
          <input type='text' value={manualId} onChange={e => setManualId(e.target.value)} placeholder='76561198xxxxxxxxx' className='input-terminal text-sm flex-1' />
          <button onClick={() => setActiveId(manualId)} disabled={!manualId.trim()} className='btn-primary text-sm px-4'>Load</button>
        </div>
        <p className='font-mono text-[10px] text-muted-4 mt-3'>Find your ID at steamid.io. Make sure inventory is set to Public.</p>
      </div>
    </div>
  )

  return (
    <div className='flex flex-col h-[calc(100vh-88px)] overflow-hidden gap-3'>
      <div className='panel px-4 py-3 flex-shrink-0 flex items-center gap-3 flex-wrap'>
        <div>
          <div className='font-mono text-[10px] text-muted-3 uppercase tracking-widest'>Steam Inventory</div>
          <div className='font-mono text-xs text-muted-2'>{activeId}</div>
        </div>
        <input type='text' value={search} onChange={e => setSearch(e.target.value)} placeholder='Search items...' className='input-terminal text-xs py-1.5 w-52' />
        <div className='font-mono text-xs text-muted-3'>{isLoading ? 'Loading inventory...' : filtered.length + ' items'}</div>
        <div className='ml-auto flex gap-2'>
          <button onClick={() => refetch()} className='btn-terminal text-[10px] py-1'>Refresh</button>
          {portfolioId && filtered.filter(i => i.marketable && !imported.has(i.assetid)).length > 0 && (
            <button onClick={() => filtered.filter(i => i.marketable).forEach(i => addOne(i))} className='btn-primary text-xs py-1.5'>Import All ({filtered.filter(i=>i.marketable&&!imported.has(i.assetid)).length})</button>
          )}
        </div>
      </div>
      <div className='flex-1 overflow-y-auto'>
        {isLoading && <div className='grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 p-1'>{Array.from({length:20}).map((_,i)=><div key={i} className='h-44 skeleton rounded'/>)}</div>}
        {error && (<div className='panel p-8 text-center'><p className='font-mono text-sm text-red mb-2'>Failed to load</p><p className='font-mono text-xs text-muted-3'>{(error as Error).message}</p></div>)}
        {!isLoading && !error && filtered.length === 0 && <div className='panel p-8 text-center'><p className='font-mono text-sm text-muted-2'>No items found</p></div>}
        {!isLoading && !error && filtered.length > 0 && (
          <div className='grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 p-1'>
            {filtered.map((item: PricedItem) => {
              const cond = getCond(item.market_hash_name)
              const done = imported.has(item.assetid)
              const busy = importing.has(item.assetid)
              const base = item.market_hash_name.replace(/ [(][^)]+[)]$/, '')
              return (
                <div key={item.assetid} className={`panel flex flex-col transition-all ${done ? 'border-green/30' : ''}`}>
                  <div className='relative bg-black/30 rounded-t p-3 flex items-center justify-center h-32'>
                    <img src={`https://community.cloudflare.steamstatic.com/economy/image/${item.icon_url}/200fx150f`} alt={item.market_hash_name} className='h-24 object-contain' onError={e => { (e.currentTarget as HTMLImageElement).style.display='none' }} />
                    {!item.marketable && <div className='absolute top-1 right-1 font-mono text-[8px] bg-red/20 text-red px-1 rounded'>NOT TRADABLE</div>}
                    {done && <div className='absolute top-1 left-1 font-mono text-[8px] bg-green/20 text-green px-1 rounded'>ADDED</div>}
                  </div>
                  <div className='p-2.5 flex flex-col flex-1'>
                    <div className='font-mono text-[10px] font-bold text-[var(--text)] truncate mb-0.5'>{base}</div>
                    {cond && <div className='font-mono text-[9px] text-muted-3 mb-1'>{cond}</div>}
                    <div className='font-mono text-sm font-bold text-green mt-auto mb-2'>{item.price_usd ? fmt$(item.price_usd) : '--'}</div>
                    {portfolioId && <button onClick={() => addOne(item)} disabled={busy || done} className={`font-mono text-[10px] py-1 rounded border w-full transition-all ${done ? 'border-green/30 text-green bg-green/10' : 'border-terminal-border text-muted-2 hover:border-green/30 hover:text-green hover:bg-green/5'}`}>{busy ? '...' : done ? 'Added' : '+ Portfolio'}</button>}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}