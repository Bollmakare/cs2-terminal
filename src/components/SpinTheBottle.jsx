import { useState, useEffect, useRef } from 'react'
import { fmt, effectiveValue } from '../lib/utils.js'
import { useEscapeKey } from '../lib/hooks.js'

const THIS_YEAR = new Date().getFullYear()

export default function SpinTheBottle({ items, onClose }) {
  useEscapeKey(onClose)
  const [spinning, setSpinning] = useState(false)
  const [winner, setWinner] = useState(null)
  const [displayName, setDisplayName] = useState('')
  const intervalRef = useRef(null)

  const candidates = items.filter(i => {
    const f = i.metadata?.drink_from, t = i.metadata?.drink_to
    return f && t && THIS_YEAR >= f && THIS_YEAR <= t
  })
  const pool = candidates.length > 0 ? candidates : items

  function spin() {
    if (!pool.length || spinning) return
    setWinner(null)
    setSpinning(true)
    let ticks = 0
    const total = 24 + Math.floor(Math.random() * 12)
    intervalRef.current = setInterval(() => {
      const r = pool[Math.floor(Math.random() * pool.length)]
      setDisplayName(r.name)
      ticks++
      if (ticks >= total) {
        clearInterval(intervalRef.current)
        const picked = pool[Math.floor(Math.random() * pool.length)]
        setWinner(picked)
        setDisplayName(picked.name)
        setSpinning(false)
      }
    }, 80)
  }

  useEffect(() => () => clearInterval(intervalRef.current), [])

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth:420, textAlign:'center' }} onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>×</button>
        <div className="modal-title" style={{ color:'var(--wine)', textAlign:'center' }}>🍾 Spin the Bottle</div>

        {pool.length === 0 ? (
          <div style={{ color:'var(--mut)', fontSize:13, padding:'20px 0' }}>No bottles in your cellar yet.</div>
        ) : (
          <>
            <div style={{ color:'var(--mut)', fontSize:12, marginBottom:20, marginTop:-12 }}>
              {candidates.length > 0
                ? `${candidates.length} bottle${candidates.length !== 1 ? 's' : ''} currently in drinking window`
                : 'No bottles in drinking window — picking from all bottles'}
            </div>

            <div style={{
              height:80, display:'flex', alignItems:'center', justifyContent:'center',
              background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:8,
              marginBottom:20, padding:'0 20px',
            }}>
              <span style={{
                fontFamily:'Cormorant Garamond, serif',
                fontSize: winner ? 20 : spinning ? 15 : 14,
                fontWeight:600,
                color: winner ? 'var(--wine)' : 'var(--mut)',
                transition:'font-size 0.15s',
                textAlign:'center', lineHeight:1.3,
              }}>
                {spinning || winner ? displayName : 'Press Spin to pick a bottle'}
              </span>
            </div>

            {winner && (
              <div style={{ background:'rgba(196,69,105,0.08)', border:'1px solid rgba(196,69,105,0.2)', borderRadius:8, padding:'12px 16px', marginBottom:20, textAlign:'left' }}>
                {winner.metadata?.vintage && <div style={{ fontFamily:'JetBrains Mono', fontSize:14, color:'var(--mut)', marginBottom:3 }}>{winner.metadata.vintage}</div>}
                {winner.metadata?.producer && <div style={{ fontSize:13, color:'var(--mut)', marginBottom:3 }}>{winner.metadata.producer}</div>}
                {(winner.metadata?.appellation || winner.metadata?.region) && (
                  <div style={{ fontSize:12, color:'var(--mut)', marginBottom:6 }}>
                    {[winner.metadata.appellation, winner.metadata.region].filter(Boolean).join(' · ')}
                  </div>
                )}
                <div style={{ display:'flex', gap:14, flexWrap:'wrap' }}>
                  {winner.metadata?.bin_location && <span style={{ fontSize:11, color:'var(--mut)' }}>📍 {winner.metadata.bin_location}</span>}
                  <span style={{ fontSize:11, color:'var(--mut)', fontFamily:'JetBrains Mono' }}>{fmt(effectiveValue(winner))}</span>
                  <span style={{ fontSize:11, color:'var(--mut)' }}>×{winner.qty} bottle{winner.qty !== 1 ? 's' : ''}</span>
                </div>
              </div>
            )}

            <div style={{ display:'flex', gap:8, justifyContent:'center' }}>
              <button className="btn btn-primary" style={{ background:'var(--wine)', minWidth:120 }} onClick={spin} disabled={spinning}>
                {spinning ? <span className="loading-spin" /> : winner ? '🎲 Spin Again' : '🎲 Spin!'}
              </button>
              <button className="btn btn-secondary" onClick={onClose}>Close</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
