'use client'
import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { fmt$ } from '@/lib/utils'

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

export function WatchlistClient() {
  const qc = useQueryClient()
  const { data: items = [], isLoading } = useWatchlist()
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<WLSort>('added')

  const sorted = [...items]
    .filter((i: any) => !search || i.item_name?.toLowerCase().includes(search.toLowerCase()))
    .sort((a: any, b: any) => {
      if (sort === 'price_asc') return (a.item?.price_usd ?? 0) - (b.item?.price_usd ?? 0)
      if (sort === 'price_desc') return (b.item?.price_usd ?? 0) - (a.item?.price_usd ?? 0)
      return new Date(b.added_at).getTime() - new Date(a.added_at).getTime()
    })

  async function handleRemove(id: string) {
    await fetch('/api/watchlist', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    qc.invalidateQueries({ queryKey: ['watchlist'] })
  }

  return (
    <div className="flex flex-col gap-3 h-[calc(100vh-88px)] overflow-hidden">
      <div className="panel px-4 py-3 flex-shrink-0 flex items-center gap-3">
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Filter watchlist..." className="input-terminal text-xs py-1.5 w-52" />
        <div className="flex gap-1 ml-auto">
          {(['added','price_desc','price_asc','alert'] as WLSort[]).map(s => (
            <button key={s} onClick={() => setSort(s)}
              className={`btn-terminal text-[10px] py-1 ${sort === s ? 'border-green/30 text-green bg-green-soft' : ''}`}>
              {s === 'added' ? 'Recent' : s === 'price_desc' ? 'Price v' : s === 'price_asc' ? 'Price ^' : 'Alerts'}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-24 skeleton rounded" />)}
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <span className="text-4xl text-muted-4">&#x1f441;</span>
            <p className="font-mono text-sm text-muted-2">Watchlist is empty</p>
            <p className="font-mono text-xs text-muted-3">Add items to track prices and set alerts</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {sorted.map((item: any) => (
              <div key={item.id} className="panel p-3">
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-[11px] font-bold text-[var(--text)] truncate">{item.item_name}</div>
                    <div className="font-mono text-sm font-bold tabular-nums">{fmt$(item.item?.price_usd)}</div>
                  </div>
                  <button onClick={() => handleRemove(item.id)} className="text-muted-4 hover:text-red transition-colors text-xs">x</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
