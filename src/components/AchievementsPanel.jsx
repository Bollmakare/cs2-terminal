import { useMemo, useState } from 'react'
import { effectiveValue } from '../lib/utils.js'

const ACHIEVEMENTS = [
  { id: 'first_skin',    icon: '🔫', name: 'First Blood',        desc: 'Added your first CS2 skin',                       check: items => items.some(i => i.vertical === 'cs2') },
  { id: 'first_card',   icon: '🃏', name: 'Rookie Trainer',      desc: 'Added your first Pokémon card',                   check: items => items.some(i => i.vertical === 'pokemon') },
  { id: 'first_bottle', icon: '🍷', name: 'First Pour',          desc: 'Added your first wine bottle',                    check: items => items.some(i => i.vertical === 'wine') },
  { id: 'all_three',    icon: '🌟', name: 'Triple Threat',       desc: 'Active in all three categories',                  check: items => ['cs2','pokemon','wine'].every(v => items.some(i => i.vertical === v)) },
  { id: 'ten_items',    icon: '📦', name: 'Getting Serious',     desc: '10+ items in portfolio',                          check: items => items.length >= 10 },
  { id: 'fifty_items',  icon: '🗃️', name: 'The Collector',       desc: '50+ items in portfolio',                          check: items => items.length >= 50 },
  { id: 'in_the_green', icon: '📈', name: 'In The Green',        desc: 'Overall portfolio is profitable',                 check: items => { const v=items.reduce((s,i)=>s+effectiveValue(i)*i.qty,0); const c=items.reduce((s,i)=>s+(i.cost??0)*i.qty,0); return v>c } },
  { id: 'whale',        icon: '🐋', name: 'Whale',               desc: 'Portfolio value over €10,000',                   check: items => items.reduce((s,i)=>s+effectiveValue(i)*i.qty,0)>=10000 },
  { id: 'big_win',      icon: '🚀', name: 'To The Moon',         desc: 'One item has doubled in value',                   check: items => items.some(i => i.cost>0 && effectiveValue(i)>=i.cost*2) },
  { id: 'diamond',      icon: '💎', name: 'Diamond Hands',       desc: 'Held an item for 2+ years',                       check: items => items.some(i => i.created_at && (Date.now()-new Date(i.created_at))>2*365.25*86400000) },
  { id: 'sommelier',    icon: '🍾', name: 'Sommelier',           desc: '12+ bottles in cellar',                           check: items => items.filter(i=>i.vertical==='wine').reduce((s,i)=>s+i.qty,0)>=12 },
  { id: 'graded',       icon: '🏅', name: 'Slab Life',           desc: 'Own a graded Pokémon card',                       check: items => items.some(i => i.vertical==='pokemon' && i.metadata?.grade && i.metadata.grade!=='Ungraded') },
  { id: 'float_hunt',   icon: '🔬', name: 'Float Hunter',        desc: 'Own a skin with float under 0.01',                check: items => items.some(i => i.vertical==='cs2' && i.metadata?.float!=null && i.metadata.float<0.01) },
  { id: 'stattrak',     icon: '🔢', name: 'Counter Strike',      desc: 'Own a StatTrak™ skin',                            check: items => items.some(i => i.vertical==='cs2' && i.metadata?.stattrak) },
  { id: 'set_hunter',   icon: '📚', name: 'Set Hunter',          desc: 'Cards from 5+ different Pokémon sets',            check: items => new Set(items.filter(i=>i.vertical==='pokemon').map(i=>i.metadata?.set_name).filter(Boolean)).size>=5 },
  { id: 'vintage',      icon: '⏳', name: 'Aged to Perfection',  desc: 'Own a wine from before 2000',                    check: items => items.some(i => i.vertical==='wine' && i.metadata?.vintage && i.metadata.vintage<2000) },
]

export default function AchievementsPanel({ items }) {
  const [open, setOpen] = useState(true)

  const { unlocked, locked } = useMemo(() => {
    const unlocked = [], locked = []
    for (const a of ACHIEVEMENTS) {
      try { a.check(items) ? unlocked.push(a) : locked.push(a) }
      catch { locked.push(a) }
    }
    return { unlocked, locked }
  }, [items])

  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 20 }}>
      <div style={{ display:'flex', alignItems:'center', padding:'10px 14px', cursor:'pointer', userSelect:'none' }} onClick={() => setOpen(o => !o)}>
        <span style={{ fontSize:11, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--mut)', fontWeight:600, flex:1 }}>
          Achievements · {unlocked.length} / {ACHIEVEMENTS.length} unlocked
        </span>
        <span style={{ color:'var(--mut)', fontSize:12 }}>{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <div style={{ padding:'0 14px 14px', display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(150px, 1fr))', gap:8 }}>
          {[...unlocked, ...locked].map(a => {
            const isUnlocked = unlocked.includes(a)
            return (
              <div key={a.id} title={a.desc} style={{
                background: isUnlocked ? 'rgba(201,168,76,0.08)' : 'var(--bg3)',
                border: `1px solid ${isUnlocked ? 'rgba(201,168,76,0.3)' : 'var(--border)'}`,
                borderRadius: 6, padding: '10px 12px',
                opacity: isUnlocked ? 1 : 0.4,
                transition: 'opacity 0.2s',
              }}>
                <div style={{ fontSize:22, marginBottom:4 }}>{isUnlocked ? a.icon : '🔒'}</div>
                <div style={{ fontSize:12, fontWeight:600, color: isUnlocked ? 'var(--gold)' : 'var(--mut)', marginBottom:2 }}>{a.name}</div>
                <div style={{ fontSize:10, color:'var(--mut)', lineHeight:1.4 }}>{a.desc}</div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
