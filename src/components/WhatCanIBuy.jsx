import { useState } from 'react'
import { fmt } from '../lib/utils.js'

const ITEMS = [
  { label: 'cups of coffee',              unitPrice: 3.5,    emoji: '☕' },
  { label: 'pints of beer',               unitPrice: 6,      emoji: '🍺' },
  { label: 'fast food meals',             unitPrice: 12,     emoji: '🍔' },
  { label: 'cinema tickets',              unitPrice: 15,     emoji: '🎬' },
  { label: 'paperback books',             unitPrice: 15,     emoji: '📚' },
  { label: 'bottles of table wine',       unitPrice: 28,     emoji: '🍷' },
  { label: 'AAA video games',             unitPrice: 70,     emoji: '🎮' },
  { label: 'Spotify Premium years',       unitPrice: 120,    emoji: '🎵' },
  { label: 'AirPods Pro',                 unitPrice: 280,    emoji: '🎧' },
  { label: 'Nintendo Switch consoles',    unitPrice: 300,    emoji: '🕹️' },
  { label: 'economy flights to Tokyo',    unitPrice: 650,    emoji: '✈️' },
  { label: 'iPhone 16',                   unitPrice: 900,    emoji: '📱' },
  { label: 'MacBook Pro 14"',             unitPrice: 2500,   emoji: '💻' },
  { label: 'business class to NYC',       unitPrice: 3200,   emoji: '🛫' },
  { label: 'used Honda Civic',            unitPrice: 8000,   emoji: '🚗' },
  { label: 'Rolex Oyster Perpetual',      unitPrice: 6500,   emoji: '⌚' },
  { label: 'Tesla Model 3',               unitPrice: 42000,  emoji: '⚡' },
  { label: 'luxury apartment down payments', unitPrice: 60000, emoji: '🏠' },
]

function getPicks(value) {
  if (value <= 0) return []
  const affordable = ITEMS.filter(i => value >= i.unitPrice)
  const shuffled = [...affordable].sort(() => Math.random() - 0.5)
  const picks = []
  const many = shuffled.find(i => Math.floor(value / i.unitPrice) >= 6)
  const few  = shuffled.find(i => { const c = Math.floor(value / i.unitPrice); return c >= 1 && c <= 5 && i !== many })
  const almost = ITEMS.find(i => i.unitPrice > value && i.unitPrice <= value * 1.35)
  if (many)   picks.push({ ...many,   count: Math.floor(value / many.unitPrice), almost: false })
  if (few)    picks.push({ ...few,    count: Math.floor(value / few.unitPrice),  almost: false })
  if (almost) picks.push({ ...almost, count: null, almost: true })
  return picks.slice(0, 3)
}

export default function WhatCanIBuy({ value }) {
  const [picks, setPicks] = useState(() => getPicks(value))
  if (value <= 0 || picks.length === 0) return null
  return (
    <div style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:8, padding:'14px 16px', marginBottom:20 }}>
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
        <span style={{ fontSize:11, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--mut)', fontWeight:600, flex:1 }}>
          What {fmt(value)} could buy
        </span>
        <button style={{ fontSize:11, color:'var(--mut)', border:'1px solid var(--border)', borderRadius:4, padding:'2px 8px', cursor:'pointer', background:'none' }} onClick={() => setPicks(getPicks(value))}>
          ↻ shuffle
        </button>
      </div>
      <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
        {picks.map((p, i) => (
          <div key={i} style={{ flex:1, minWidth:130, background:'var(--bg3)', borderRadius:6, padding:'10px 12px', border:'1px solid var(--border)' }}>
            <div style={{ fontSize:24, marginBottom:4 }}>{p.emoji}</div>
            {p.almost ? (
              <>
                <div style={{ fontSize:13, fontWeight:600, color:'var(--mut)' }}>Almost…</div>
                <div style={{ fontSize:11, color:'var(--mut)', marginTop:2, lineHeight:1.4 }}>{fmt(p.unitPrice - value)} short of a {p.label.replace(/s$/, '')}</div>
              </>
            ) : (
              <>
                <div style={{ fontFamily:'JetBrains Mono', fontSize:20, fontWeight:700 }}>{p.count}×</div>
                <div style={{ fontSize:11, color:'var(--mut)', marginTop:2, lineHeight:1.4 }}>{p.count === 1 ? p.label.replace(/s$/, '') : p.label}</div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
