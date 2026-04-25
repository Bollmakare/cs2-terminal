'use client'
import { useState, useCallback, useEffect, useRef } from 'react'

interface SearchItem {
  market_hash_name: string
  icon_url: string | null
  price_usd: number | null
  item_id: string | null
}

interface Props {
  portfolioId: string
  onAdded?: () => void
  onClose: () => void
}

const CONDITIONS = ['Factory New', 'Minimal Wear', 'Field-Tested', 'Well-Worn', 'Battle-Scarred']

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debouncedValue
}

export function ManualAddModal({ portfolioId, onAdded, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchItem[]>([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<SearchItem | null>(null)
  const [qty, setQty] = useState('1')
  const [cost, setCost] = useState('')
  const [condition, setCondition] = useState('')
  const [adding, setAdding] = useState(false)
  const [added, setAdded] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const debouncedQuery = useDebounce(query, 350)

  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    if (!debouncedQuery || debouncedQuery.length < 2) { setResults([]); return }
    setSearching(true)
    fetch('/api/items/search?q=' + encodeURIComponent(debouncedQuery))
      .then(r => r.json())
      .then(d => setResults(d.items || []))
      .catch(() => setResults([]))
      .finally(() => setSearching(false))
  }, [debouncedQuery])

  const selectItem = (item: SearchItem) => {
    setSelected(item)
    setCost(item.price_usd ? String(item.price_usd.toFixed(2)) : '')
    // Auto-detect condition from name
    const match = item.market_hash_name.match(/[(](Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)[)]/)
    setCondition(match ? match[1] : '')
    setResults([])
    setQuery(item.market_hash_name)
  }

  const handleAdd = useCallback(async () => {
    if (!selected || !portfolioId) return
    setAdding(true)
    try {
      const res = await fetch('/api/holdings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          portfolio_id: portfolioId,
          item_id: selected.item_id,
          item_name: selected.market_hash_name,
          item_condition: condition || null,
          quantity: parseInt(qty) || 1,
          cost_basis: parseFloat(cost) || 0,
        })
      })
      if (res.ok) {
        setAdded(true)
        onAdded?.()
        setTimeout(onClose, 800)
      }
    } finally {
      setAdding(false)
    }
  }, [selected, portfolioId, qty, cost, condition, onAdded, onClose])

  const imgUrl = (iconUrl: string | null) =>
    iconUrl ? `https://community.cloudflare.steamstatic.com/economy/image/${iconUrl}/200fx150f` : null

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center p-4' onClick={e => e.target === e.currentTarget && onClose()}>
      <div className='absolute inset-0 bg-black/70 backdrop-blur-sm' onClick={onClose} />
      <div className='relative panel w-full max-w-lg flex flex-col gap-4 p-5 z-10 max-h-[80vh] overflow-y-auto'>
        <div className='flex items-center justify-between'>
          <span className='font-mono text-[10px] uppercase tracking-widest text-muted-3'>Add Item Manually</span>
          <button onClick={onClose} className='font-mono text-muted-3 hover:text-[var(--text)] text-lg leading-none'>&#x2715;</button>
        </div>

        {/* Search */}
        <div className='relative'>
          <input
            ref={inputRef}
            type='text'
            value={query}
            onChange={e => { setQuery(e.target.value); setSelected(null); setAdded(false) }}
            placeholder='Search CS2 items... e.g. AK-47 Redline'
            className='input-terminal text-sm w-full pr-8'
          />
          {searching && <span className='absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[9px] text-muted-3 animate-pulse'>...</span>}
        </div>

        {/* Search results */}
        {results.length > 0 && !selected && (
          <div className='flex flex-col gap-1 max-h-52 overflow-y-auto -mt-2'>
            {results.map((item, i) => (
              <button
                key={i}
                onClick={() => selectItem(item)}
                className='flex items-center gap-3 px-3 py-2 hover:bg-white/5 rounded transition-colors text-left'
              >
                {imgUrl(item.icon_url) && (
                  <img src={imgUrl(item.icon_url)!} alt='' className='h-8 w-12 object-contain flex-shrink-0' />
                )}
                <div className='flex-1 min-w-0'>
                  <div className='font-mono text-[11px] text-[var(--text)] truncate'>{item.market_hash_name}</div>
                  {item.price_usd && <div className='font-mono text-[10px] text-green'>${item.price_usd.toFixed(2)}</div>}
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Selected item form */}
        {selected && (
          <div className='flex flex-col gap-3'>
            <div className='flex items-center gap-3 p-3 bg-black/20 rounded'>
              {imgUrl(selected.icon_url) && (
                <img src={imgUrl(selected.icon_url)!} alt='' className='h-14 w-20 object-contain flex-shrink-0' />
              )}
              <div>
                <div className='font-mono text-xs font-bold text-[var(--text)]'>{selected.market_hash_name}</div>
                {selected.price_usd && <div className='font-mono text-[10px] text-muted-3 mt-0.5'>Market: ${selected.price_usd.toFixed(2)}</div>}
              </div>
            </div>

            {/* Condition — only show for wearable items */}
            {!selected.market_hash_name.match(/^(Sticker|Graffiti|Music Kit|Pin|Patch|Case|Key|Package|Collection|Agent)/) && (
              <div>
                <div className='font-mono text-[9px] text-muted-3 uppercase tracking-widest mb-1.5'>Condition</div>
                <div className='flex flex-wrap gap-1.5'>
                  {CONDITIONS.map(c => (
                    <button
                      key={c}
                      onClick={() => setCondition(c === condition ? '' : c)}
                      className={`font-mono text-[9px] px-2 py-1 rounded border transition-all ${condition === c ? 'border-green/50 text-green bg-green/10' : 'border-terminal-border text-muted-3 hover:border-muted-2'}`}
                    >{c}</button>
                  ))}
                </div>
              </div>
            )}

            <div className='flex gap-3'>
              <div className='flex-1'>
                <div className='font-mono text-[9px] text-muted-3 uppercase tracking-widest mb-1'>Buy Price (USD)</div>
                <input
                  type='number'
                  value={cost}
                  onChange={e => setCost(e.target.value)}
                  step='0.01'
                  min='0'
                  placeholder='0.00'
                  className='input-terminal text-sm w-full'
                />
              </div>
              <div className='w-20'>
                <div className='font-mono text-[9px] text-muted-3 uppercase tracking-widest mb-1'>Quantity</div>
                <input
                  type='number'
                  value={qty}
                  onChange={e => setQty(e.target.value)}
                  min='1'
                  max='100'
                  className='input-terminal text-sm w-full'
                />
              </div>
            </div>

            <button
              onClick={handleAdd}
              disabled={adding || added}
              className={`btn-primary text-sm py-2 w-full ${added ? 'opacity-70' : ''}`}
            >
              {added ? '&#x2713; Added to Portfolio' : adding ? 'Adding...' : '+ Add to Portfolio'}
            </button>
          </div>
        )}

        {!selected && !results.length && !searching && query.length > 1 && (
          <p className='font-mono text-xs text-muted-3 text-center'>No results for "{query}"</p>
        )}
        {!query && (
          <p className='font-mono text-[10px] text-muted-4 text-center'>Search any CS2 item by name</p>
        )}
      </div>
    </div>
  )
}