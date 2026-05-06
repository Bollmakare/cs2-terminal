import { useState, useEffect, useMemo } from 'react'

const CACHE_KEY = 'pkm_sets_cache'
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000

async function fetchSetSizes() {
  try {
    const cached = localStorage.getItem(CACHE_KEY)
    if (cached) {
      const { ts, data } = JSON.parse(cached)
      if (Date.now() - ts < CACHE_TTL) return data
    }
    const res = await fetch('https://api.pokemontcg.io/v2/sets?pageSize=250')
    if (!res.ok) return {}
    const json = await res.json()
    const map = {}
    for (const s of json.data ?? []) {
      map[s.name.toLowerCase()] = s.printedTotal ?? s.total ?? null
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data: map }))
    return map
  } catch {
    return {}
  }
}

export default function SetCompletionPanel({ items }) {
  const [setSizes, setSetSizes] = useState({})
  const [open, setOpen] = useState(true)

  useEffect(() => {
    fetchSetSizes().then(setSetSizes)
  }, [])

  const sets = useMemo(() => {
    const map = {}
    for (const item of items) {
      const setName = item.metadata?.set_name
      if (!setName) continue
      const itemType = item.metadata?.item_type
      if (itemType && itemType !== 'card') continue
      if (!map[setName]) map[setName] = new Set()
      if (item.metadata?.card_number) map[setName].add(item.metadata.card_number)
      else map[setName].add(`__item_${item.id}`)
    }
    return Object.entries(map)
      .map(([name, cards]) => ({
        name,
        owned: cards.size,
        total: setSizes[name.toLowerCase()] ?? null,
      }))
      .sort((a, b) => {
        if (a.total && b.total) return (b.owned / b.total) - (a.owned / a.total)
        return b.owned - a.owned
      })
  }, [items, setSizes])

  if (sets.length === 0) return null

  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 16 }}>
      <div
        style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setOpen(o => !o)}
      >
        <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--mut)', fontWeight: 600, flex: 1 }}>
          Set Completion · {sets.length} set{sets.length !== 1 ? 's' : ''}
        </span>
        <span style={{ color: 'var(--mut)', fontSize: 12 }}>{open ? '▲' : '▼'}</span>
      </div>

      {open && (
        <div style={{ padding: '0 14px 12px' }}>
          {sets.map(s => {
            const pct = s.total ? Math.min((s.owned / s.total) * 100, 100) : null
            return (
              <div key={s.name} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ fontSize: 12, fontWeight: 500 }}>{s.name}</span>
                  <span style={{ fontFamily: 'JetBrains Mono', fontSize: 11, color: 'var(--mut)' }}>
                    {s.owned}{s.total ? `/${s.total}` : ' cards'}
                    {pct != null && <span style={{ color: pct >= 80 ? 'var(--grn)' : 'var(--txt)', marginLeft: 6 }}>({pct.toFixed(0)}%)</span>}
                  </span>
                </div>
                {pct != null && (
                  <div style={{ height: 4, background: 'var(--bg3)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: pct >= 80 ? 'var(--grn)' : 'var(--pkm)', borderRadius: 2, transition: 'width 0.4s' }} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
