import { useState, useEffect, useRef } from 'react'
import { useEscapeKey } from '../lib/hooks.js'

const CACHE_PREFIX = 'pkm_grid_'
const CACHE_TTL = 24 * 60 * 60 * 1000

async function fetchSetCards(setName) {
  const key = CACHE_PREFIX + setName.toLowerCase().replace(/\s+/g, '_')
  try {
    const cached = localStorage.getItem(key)
    if (cached) {
      const { ts, data } = JSON.parse(cached)
      if (Date.now() - ts < CACHE_TTL) return data
    }
    const q = encodeURIComponent(`set.name:"${setName}"`)
    const res = await fetch(`https://api.pokemontcg.io/v2/cards?q=${q}&orderBy=number&pageSize=250&select=id,name,number,images,rarity`)
    if (!res.ok) return []
    const json = await res.json()
    const cards = json.data ?? []
    localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data: cards }))
    return cards
  } catch { return [] }
}

const SPECIAL = ['Secret Rare','Hyper Rare','Special Illustration Rare','Illustration Rare','Shiny Rare']
const ULTRA   = ['Rare Holo EX','Rare Holo GX','Rare Holo V','Rare Holo VMAX','Rare Holo VSTAR','Rare Ultra','Rare Rainbow','Rare Secret']
const RARE    = ['Rare','Rare Holo']
const UNCOMMON = ['Uncommon']

function cat(card) {
  const r = card.rarity ?? ''
  if (SPECIAL.includes(r)) return 'special'
  if (ULTRA.includes(r))   return 'ultra'
  if (RARE.includes(r))    return 'rare'
  if (UNCOMMON.includes(r)) return 'uncommon'
  return 'common'
}

function pick(arr) { return arr.length ? arr[Math.floor(Math.random() * arr.length)] : null }

function openPack(cards) {
  const by = { common:[], uncommon:[], rare:[], ultra:[], special:[] }
  for (const c of cards) by[cat(c)].push(c)
  const commons   = by.common.length   ? by.common   : cards
  const uncommons = by.uncommon.length ? by.uncommon : cards
  const pack = []
  for (let i = 0; i < 4; i++) pack.push({ ...pick(commons),   _slot:'common' })
  for (let i = 0; i < 3; i++) pack.push({ ...pick(uncommons), _slot:'uncommon' })
  const revPool = [...by.common, ...by.uncommon, ...by.rare]
  if (revPool.length) pack.push({ ...pick(revPool), _slot:'reverse' })
  const roll = Math.random()
  let hit
  if (roll < 0.04 && by.special.length) hit = { ...pick(by.special), _slot:'hit', _tier:'special' }
  else if (roll < 0.20 && by.ultra.length) hit = { ...pick(by.ultra),   _slot:'hit', _tier:'ultra' }
  else { const pool = [...by.rare, ...by.ultra]; hit = pool.length ? { ...pick(pool), _slot:'hit', _tier:'rare' } : { ...pick(cards), _slot:'hit', _tier:'rare' } }
  pack.push(hit)
  pack.push({ ...pick(commons), _slot:'common' })
  return pack
}

const SLOT_LABEL = { common:'Common', uncommon:'Uncommon', reverse:'Rev. Holo', hit:'Rare+' }

export default function PackSimulatorModal({ sets, onClose }) {
  useEscapeKey(onClose)
  const [selectedSet, setSelectedSet] = useState('')
  const [cards, setCards]   = useState([])
  const [loading, setLoading] = useState(false)
  const [pack, setPack]     = useState(null)
  const [revealed, setRevealed] = useState(0)
  const [revealing, setRevealing] = useState(false)
  const [stats, setStats]   = useState({ packs: 0, hits: 0 })
  const intervalRef = useRef(null)

  useEffect(() => {
    if (!selectedSet) { setCards([]); setPack(null); return }
    setLoading(true); setCards([]); setPack(null)
    fetchSetCards(selectedSet).then(c => { setCards(c); setLoading(false) })
  }, [selectedSet])

  function openNewPack() {
    if (!cards.length || revealing) return
    clearInterval(intervalRef.current)
    const newPack = openPack(cards)
    const hits = newPack.filter(c => c._tier === 'ultra' || c._tier === 'special').length
    setPack(newPack)
    setStats(s => ({ packs: s.packs + 1, hits: s.hits + hits }))
    setRevealed(0)
    setRevealing(true)
    let count = 0
    intervalRef.current = setInterval(() => {
      count++
      setRevealed(count)
      if (count >= newPack.length) { clearInterval(intervalRef.current); setRevealing(false) }
    }, 110)
  }

  useEffect(() => () => clearInterval(intervalRef.current), [])

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth:620 }} onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>×</button>
        <div className="modal-title" style={{ color:'var(--pkm)' }}>📦 Pack Simulator</div>
        <div style={{ fontSize:13, color:'var(--mut)', marginBottom:20, marginTop:-12 }}>Simulate booster pack openings — no real cards involved.</div>

        <div style={{ display:'flex', gap:10, marginBottom:16 }}>
          <select className="filter-select" style={{ flex:1 }} value={selectedSet} onChange={e => setSelectedSet(e.target.value)}>
            <option value="">— Select a set —</option>
            {sets.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <button
            className="btn btn-primary"
            style={{ background:'var(--pkm)', color:'#000', minWidth:140 }}
            onClick={openNewPack}
            disabled={!cards.length || revealing || loading}
          >
            {loading ? <span className="loading-spin" /> : revealing ? 'Opening…' : pack ? '📦 Open Another' : '📦 Open Pack'}
          </button>
        </div>

        {stats.packs > 0 && (
          <div style={{ display:'flex', gap:20, marginBottom:14, fontSize:12, color:'var(--mut)' }}>
            <span><span style={{ fontFamily:'JetBrains Mono', color:'var(--txt)' }}>{stats.packs}</span> packs</span>
            <span><span style={{ fontFamily:'JetBrains Mono', color: stats.hits > 0 ? 'var(--pkm)' : 'var(--mut)' }}>{stats.hits}</span> hits</span>
            <span><span style={{ fontFamily:'JetBrains Mono' }}>{stats.packs > 0 ? (stats.hits/stats.packs*100).toFixed(0) : 0}%</span> hit rate</span>
          </div>
        )}

        {pack ? (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:8 }}>
            {pack.map((card, i) => {
              const vis  = i < revealed
              const isHit = card._slot === 'hit'
              const isRev = card._slot === 'reverse'
              const glow  = card._tier === 'special' ? '0 0 16px rgba(255,150,255,0.6)' : card._tier === 'ultra' ? '0 0 12px rgba(255,214,10,0.5)' : 'none'
              return (
                <div key={i} style={{ opacity: vis?1:0, transform: vis?'none':'translateY(10px) scale(0.94)', transition:'opacity 0.18s, transform 0.18s' }}>
                  {card.images?.small
                    ? <img src={card.images.small} alt={card.name} style={{ width:'100%', borderRadius:6, display:'block', border: isHit ? '2px solid var(--pkm)' : '2px solid transparent', boxShadow: isHit ? glow : 'none' }} />
                    : <div style={{ aspectRatio:'0.72', background:'var(--bg3)', borderRadius:6, border:'2px solid var(--border)' }} />}
                  <div style={{ fontSize:9, textAlign:'center', marginTop:3, color: isHit ? 'var(--pkm)' : 'var(--mut)', fontFamily:'JetBrains Mono', fontWeight: isHit ? 700 : 400 }}>
                    {isHit ? '★ ' : ''}{SLOT_LABEL[card._slot]}
                  </div>
                  {(isHit || isRev) && (
                    <div style={{ fontSize:8, textAlign:'center', color:'var(--mut)', fontFamily:'JetBrains Mono', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {card.name}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <div style={{ textAlign:'center', padding:'30px 0', color:'var(--mut)', fontSize:13 }}>
            {selectedSet ? (loading ? 'Loading cards…' : 'Press Open Pack to start.') : 'Select a set to begin.'}
          </div>
        )}
      </div>
    </div>
  )
}
