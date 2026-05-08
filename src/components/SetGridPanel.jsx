import { useState, useEffect, useMemo } from 'react'

const CACHE_PREFIX = 'pkm_grid_'
const CACHE_TTL = 24 * 60 * 60 * 1000

// Normalize a card number for comparison:
//   "042/165" → "42"   "001" → "1"   "SV001" → "SV001"   "TG01" → "TG01"
function normalizeCardNumber(n) {
  const s = String(n).split('/')[0].trim()
  return /^\d+$/.test(s) ? String(parseInt(s, 10)) : s
}

async function fetchSetCards(setName) {
  const key = CACHE_PREFIX + setName.toLowerCase().replace(/\s+/g, '_')
  try {
    const cached = localStorage.getItem(key)
    if (cached) {
      const { ts, data } = JSON.parse(cached)
      if (Date.now() - ts < CACHE_TTL) return data
    }
    const q = encodeURIComponent(`set.name:"${setName}"`)
    const baseUrl = `https://api.pokemontcg.io/v2/cards?q=${q}&orderBy=number&pageSize=250&select=id,name,number,images,rarity`

    const firstRes = await fetch(`${baseUrl}&page=1`)
    if (!firstRes.ok) return []
    const firstJson = await firstRes.json()
    let cards = firstJson.data ?? []

    const totalCount = firstJson.totalCount ?? cards.length
    if (totalCount > 250) {
      const totalPages = Math.ceil(totalCount / 250)
      const extras = await Promise.all(
        Array.from({ length: totalPages - 1 }, (_, i) =>
          fetch(`${baseUrl}&page=${i + 2}`)
            .then(r => r.json())
            .then(j => j.data ?? [])
            .catch(() => [])
        )
      )
      for (const page of extras) cards = cards.concat(page)
    }

    localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data: cards }))
    return cards
  } catch {
    return []
  }
}

function UnmatchedWarning({ unmatched, onEdit }) {
  const [open, setOpen] = useState(false)
  if (!unmatched.length) return null
  return (
    <div style={{ marginTop: 16, border: '1px solid var(--gold)', borderRadius: 6, overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', textAlign: 'left', padding: '8px 12px', background: 'rgba(255,200,0,0.07)',
          border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
          color: 'var(--gold)', fontSize: 12, fontWeight: 600,
        }}
      >
        <span>⚠</span>
        <span>{unmatched.length} card{unmatched.length > 1 ? 's' : ''} in your collection couldn't be matched in this set</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--mut)' }}>{open ? '▲ hide' : '▼ show'}</span>
      </button>
      {open && (
        <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <p style={{ fontSize: 11, color: 'var(--mut)', margin: '0 0 6px' }}>
            These cards have a <strong style={{ color: 'var(--txt)' }}>set_name</strong> or <strong style={{ color: 'var(--txt)' }}>card_number</strong> that doesn't match any card in the API for this set.
            Edit each card and correct its number or set name to fix the match.
          </p>
          {unmatched.map(item => (
            <div key={item.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: 'var(--bg3)', borderRadius: 4, padding: '6px 10px',
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                <div style={{ fontSize: 11, color: 'var(--mut)', fontFamily: 'JetBrains Mono', marginTop: 2 }}>
                  {item.metadata?.card_number
                    ? <>card_number: <span style={{ color: 'var(--gold)' }}>"{item.metadata.card_number}"</span></>
                    : <span style={{ color: 'var(--red)' }}>no card_number stored</span>}
                </div>
              </div>
              {onEdit && (
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => onEdit(item)}
                  style={{ flexShrink: 0, fontSize: 11 }}
                >
                  ✏ Edit
                </button>
              )}
            </div>
          ))}
          <p style={{ fontSize: 10, color: 'var(--mut)', margin: '4px 0 0' }}>
            Tip: card numbers in this set run from <strong style={{ color: 'var(--txt)' }}>1</strong> to <strong style={{ color: 'var(--txt)' }}>the total shown above</strong>. Use just the number, e.g. "42" not "042/165".
          </p>
        </div>
      )}
    </div>
  )
}

export default function SetGridPanel({ items, setName, onAddCard, onEditCard }) {
  const [cards, setCards] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!setName) { setCards([]); return }
    setLoading(true)
    setCards([])
    fetchSetCards(setName).then(c => { setCards(c); setLoading(false) })
  }, [setName])

  const setItems = useMemo(() =>
    items.filter(i => i.metadata?.set_name?.toLowerCase() === setName?.toLowerCase()),
    [items, setName]
  )

  const ownedNumbers = useMemo(() => {
    const s = new Set()
    for (const item of setItems) {
      if (item.metadata?.card_number) s.add(normalizeCardNumber(item.metadata.card_number))
    }
    return s
  }, [setItems])

  const unmatched = useMemo(() => {
    if (!cards.length) return []
    const apiNumbers = new Set(cards.map(c => normalizeCardNumber(c.number)))
    return setItems.filter(item => {
      if (!item.metadata?.card_number) return true
      return !apiNumbers.has(normalizeCardNumber(item.metadata.card_number))
    })
  }, [cards, setItems])

  if (!setName) {
    return (
      <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--mut)', fontSize: 13 }}>
        Select a set above to see the full card grid.
      </div>
    )
  }

  if (loading) {
    return (
      <div className="page-loading" style={{ height: 120 }}>
        <span className="loading-spin" /> Loading {setName}…
      </div>
    )
  }

  if (!cards.length) {
    return (
      <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--mut)', fontSize: 13 }}>
        <div style={{ marginBottom: 8 }}>No card data found for "{setName}".</div>
        <div style={{ fontSize: 11, color: 'var(--mut)' }}>
          The set name stored on your cards might not match the API exactly.
          Check the exact name at{' '}
          <a
            href={`https://pokemontcg.io/sets`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--pkm)' }}
          >
            pokemontcg.io/sets
          </a>{' '}
          and update your cards' set name to match.
        </div>
        {setItems.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <UnmatchedWarning unmatched={setItems} onEdit={onEditCard} />
          </div>
        )}
      </div>
    )
  }

  const ownedCount = cards.filter(c => ownedNumbers.has(normalizeCardNumber(c.number))).length
  const pct = Math.round((ownedCount / cards.length) * 100)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <span style={{ fontFamily: 'JetBrains Mono', fontSize: 13, flexShrink: 0 }}>
          <span style={{ color: 'var(--grn)', fontWeight: 600 }}>{ownedCount}</span>
          <span style={{ color: 'var(--mut)' }}> / {cards.length}</span>
        </span>
        <div style={{ flex: 1, height: 4, background: 'var(--bg3)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: 'var(--pkm)', borderRadius: 2, transition: 'width 0.4s' }} />
        </div>
        <span style={{ fontFamily: 'JetBrains Mono', fontSize: 11, color: 'var(--mut)', flexShrink: 0 }}>{pct}%</span>
        <span style={{ fontSize: 11, color: 'var(--mut)', flexShrink: 0 }}>· click missing to add</span>
      </div>

      <div className="set-grid">
        {cards.map(card => {
          const owned = ownedNumbers.has(normalizeCardNumber(card.number))
          return (
            <div
              key={card.id}
              className={`set-grid-card${owned ? ' owned' : ' missing'}`}
              title={`${card.name} · #${card.number}${owned ? ' ✓ Owned' : ' · Click to add'}`}
              onClick={() => !owned && onAddCard?.(card)}
            >
              {card.images?.small
                ? <img src={card.images.small} alt={card.name} style={{ width: '100%', borderRadius: 4, display: 'block' }} />
                : <div style={{ aspectRatio: '0.72', background: 'var(--bg3)', borderRadius: 4 }} />}
              <div style={{ fontSize: 8, textAlign: 'center', color: 'var(--mut)', marginTop: 2, fontFamily: 'JetBrains Mono', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                #{card.number}
              </div>
              {owned && (
                <div style={{
                  position: 'absolute', top: 3, right: 3,
                  width: 14, height: 14, background: 'var(--grn)', borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 8, color: '#000', fontWeight: 700,
                }}>✓</div>
              )}
            </div>
          )
        })}
      </div>

      <UnmatchedWarning unmatched={unmatched} onEdit={onEditCard} />
    </div>
  )
}
