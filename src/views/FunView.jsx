import { useState, useMemo } from 'react'
import AchievementsPanel from '../components/AchievementsPanel.jsx'
import WhatCanIBuy from '../components/WhatCanIBuy.jsx'
import SpinTheBottle from '../components/SpinTheBottle.jsx'
import PackSimulatorModal from '../components/PackSimulatorModal.jsx'
import { effectiveValue } from '../lib/utils.js'

const TABS = [
  { id: 'achievements', label: '🏆 Achievements' },
  { id: 'buy',          label: '💰 What Can I Buy' },
  { id: 'spin',         label: '🍾 Spin the Bottle' },
  { id: 'packs',        label: '📦 Pack Simulator' },
]

export default function FunView({ items }) {
  const [tab, setTab] = useState('achievements')
  const [spinOpen, setSpinOpen] = useState(false)
  const [packOpen, setPackOpen] = useState(false)

  const wineItems = items.filter(i => i.vertical === 'wine')
  const pokemonSets = useMemo(() => {
    const s = new Set(items.filter(i => i.vertical === 'pokemon').map(i => i.metadata?.set_name).filter(Boolean))
    return [...s].sort()
  }, [items])
  const totalValue = items.reduce((s, i) => s + effectiveValue(i) * i.qty, 0)

  return (
    <div>
      <div className="view-header">
        <div className="view-title" style={{ color: 'var(--gold)' }}>Fun Zone</div>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid var(--border)' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            background: 'none', border: 'none',
            borderBottom: `2px solid ${tab === t.id ? 'var(--gold)' : 'transparent'}`,
            color: tab === t.id ? 'var(--gold)' : 'var(--mut)',
            padding: '8px 16px', cursor: 'pointer', fontSize: 13,
            fontWeight: tab === t.id ? 600 : 400,
            marginBottom: -1, transition: 'color 0.15s',
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'achievements' && <AchievementsPanel items={items} />}

      {tab === 'buy' && <WhatCanIBuy value={totalValue} />}

      {tab === 'spin' && (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <div style={{ fontSize: 52, marginBottom: 12 }}>🍾</div>
          <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Spin the Bottle</div>
          <div style={{ color: 'var(--mut)', fontSize: 13, marginBottom: 24 }}>
            {wineItems.length > 0
              ? `${wineItems.length} bottle${wineItems.length !== 1 ? 's' : ''} in your cellar`
              : 'No bottles in your cellar yet'}
          </div>
          {wineItems.length > 0 && (
            <button className="btn btn-primary" style={{ background: 'var(--wine)', minWidth: 140 }} onClick={() => setSpinOpen(true)}>
              🎲 Spin!
            </button>
          )}
        </div>
      )}

      {tab === 'packs' && (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <div style={{ fontSize: 52, marginBottom: 12 }}>📦</div>
          <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Pack Simulator</div>
          <div style={{ color: 'var(--mut)', fontSize: 13, marginBottom: 24 }}>
            {pokemonSets.length > 0
              ? `${pokemonSets.length} set${pokemonSets.length !== 1 ? 's' : ''} available`
              : 'No Pokémon sets in your collection yet'}
          </div>
          {pokemonSets.length > 0 && (
            <button className="btn btn-primary" style={{ background: 'var(--pkm)', color: '#000', minWidth: 140 }} onClick={() => setPackOpen(true)}>
              📦 Open Packs
            </button>
          )}
        </div>
      )}

      {spinOpen && <SpinTheBottle items={wineItems} onClose={() => setSpinOpen(false)} />}
      {packOpen && <PackSimulatorModal sets={pokemonSets} onClose={() => setPackOpen(false)} />}
    </div>
  )
}
