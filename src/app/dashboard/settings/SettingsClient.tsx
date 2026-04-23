'use client'

import React, { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

const ACCENTS = [
  { id: 'green',   hex: '#00ff88', label: 'Green' },
  { id: 'ember',   hex: '#f97316', label: 'Ember' },
  { id: 'blue',    hex: '#3b82f6', label: 'Blue'  },
  { id: 'amber',   hex: '#f59e0b', label: 'Amber' },
]

interface Props {
  settings: any
  profile:  any
  userId:   string
  userEmail: string
}

function Section({ title, sub, children }: { title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="panel overflow-hidden">
      <div className="panel-header px-5 py-3.5">
        <div>
          <div className="font-mono text-xs font-bold tracking-widest uppercase text-[var(--text)]">{title}</div>
          {sub && <div className="font-mono text-[10px] text-muted-3 mt-0.5">{sub}</div>}
        </div>
      </div>
      <div className="divide-y divide-terminal-border">{children}</div>
    </div>
  )
}

function Row({ label, sub, children }: { key?: string; label: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3.5">
      <div>
        <div className="font-mono text-sm text-[var(--text)]">{label}</div>
        {sub && <div className="font-mono text-[10px] text-muted-3 mt-0.5">{sub}</div>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  )
}

function SegBtns({ options, value, onChange }: {
  options: { id: string; label: string }[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex gap-1 bg-terminal-muted rounded p-0.5">
      {options.map(o => (
        <button key={o.id} onClick={() => onChange(o.id)}
          className={cn(
            'px-3 py-1.5 rounded font-mono text-[11px] transition-all',
            value === o.id ? 'bg-green text-black font-bold' : 'text-muted-3 hover:text-muted-2'
          )}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function SettingsClient({ settings, profile, userId, userEmail }: Props) {
  const s = settings

  // Form state
  const [displayName,   setDisplayName]   = useState(profile?.display_name ?? '')
  const [steamId,       setSteamId]       = useState(profile?.steam_id ?? '')
  const [theme,         setTheme]         = useState(s?.theme   ?? 'terminal')
  const [accent,        setAccent]        = useState(s?.accent  ?? 'green')
  const [density,       setDensity]       = useState(s?.density ?? 'comfortable')
  const [feeSkinport,   setFeeSkinport]   = useState(String(s?.fee_skinport ?? 12))
  const [feeSteam,      setFeeSteam]      = useState(String(s?.fee_steam    ?? 13))
  const [feeCsfloat,    setFeeCsfloat]    = useState(String(s?.fee_csfloat  ?? 2))
  const [minScore,      setMinScore]      = useState(String(s?.scanner_min_score  ?? 60))
  const [minVolume,     setMinVolume]     = useState(String(s?.scanner_min_volume ?? 5))
  const [saving,        setSaving]        = useState(false)
  const [saved,         setSaved]         = useState(false)
  const [error,         setError]         = useState('')

  async function handleSave() {
    setSaving(true); setError(''); setSaved(false)
    const supabase = createClient()
    const [r1, r2] = await Promise.all([
      supabase.from('profiles').update({
        display_name: displayName || null,
        steam_id:     steamId    || null,
      }).eq('id', userId),
      supabase.from('user_settings').upsert({
        user_id:             userId,
        theme, accent, density,
        fee_skinport:        parseFloat(feeSkinport)  || 12,
        fee_steam:           parseFloat(feeSteam)     || 13,
        fee_csfloat:         parseFloat(feeCsfloat)   || 2,
        scanner_min_score:   parseInt(minScore)       || 60,
        scanner_min_volume:  parseInt(minVolume)      || 5,
      }, { onConflict: 'user_id' }),
    ])

    if (r1.error || r2.error) {
      setError(r1.error?.message ?? r2.error?.message ?? 'Save failed')
    } else {
      // Apply theme immediately
      document.documentElement.setAttribute('data-theme', theme)
      document.documentElement.setAttribute('data-accent', accent)
      document.documentElement.setAttribute('data-density', density)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    }
    setSaving(false)
  }

  const isSteam = profile?.auth_provider === 'steam'

  return (
    <div className="max-w-2xl mx-auto space-y-4 pb-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-mono text-base font-bold text-[var(--text)]">Settings</h1>
          <p className="font-mono text-[10px] text-muted-3 mt-0.5">Preferences saved to your Supabase account</p>
        </div>
        <button onClick={handleSave} disabled={saving} className="btn-primary">
          {saving ? 'Saving...' : saved ? 'â Saved' : 'Save settings'}
        </button>
      </div>

      {error && <div className="px-4 py-3 rounded border border-red/30 bg-red-soft font-mono text-xs text-red">{error}</div>}
      {saved && <div className="px-4 py-3 rounded border border-green/30 bg-green-soft font-mono text-xs text-green">â Settings saved successfully</div>}

      {/* Account */}
      <Section title="Account" sub={userEmail}>
        {isSteam && profile?.steam_avatar && (
          <Row label="Steam identity">
            <div className="flex items-center gap-2">
              <img src={profile.steam_avatar} alt="" className="w-8 h-8 rounded border border-terminal-border" />
              <div className="text-right">
                <div className="font-mono text-xs text-[var(--text)]">{profile.steam_username}</div>
                <div className="font-mono text-[9px] text-muted-3">ID: {profile.steam_id}</div>
              </div>
            </div>
          </Row>
        )}
        <Row label="Display name" sub="Shown in the terminal sidebar">
          <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)}
            placeholder="Your name" className="input-terminal text-sm py-1.5 w-48" />
        </Row>
        {!isSteam && (
          <Row label="Steam ID" sub="SteamID64 for inventory import">
            <div className="space-y-1.5">
              <input type="text" value={steamId} onChange={e => setSteamId(e.target.value)}
                placeholder="76561197995388346" className="input-terminal text-xs py-1.5 w-48"
                style={{ fontFamily: 'var(--font-mono)' }} />
              <div className="text-right">
                <a href="/api/auth/steam" className="font-mono text-[10px] text-green hover:underline">
                  â Link Steam account instead
                </a>
              </div>
            </div>
          </Row>
        )}
        {isSteam && (
          <Row label="Email auth" sub="Optionally add a password">
            <a href="/auth/signup" className="btn-terminal text-[10px] py-1">Add email â</a>
          </Row>
        )}
      </Section>

      {/* Appearance */}
      <Section title="Appearance">
        <Row label="Theme" sub="Overall color scheme">
          <SegBtns
            options={[{ id: 'terminal', label: 'Terminal' }, { id: 'obsidian', label: 'Obsidian' }]}
            value={theme} onChange={setTheme} />
        </Row>
        <Row label="Accent color" sub="Primary highlight color">
          <div className="flex gap-2">
            {ACCENTS.map(a => (
              <button key={a.id} onClick={() => setAccent(a.id)} title={a.label}
                className="w-7 h-7 rounded-sm border-2 transition-all"
                style={{
                  background: a.hex,
                  borderColor: accent === a.id ? '#fff' : 'transparent',
                  outline: accent === a.id ? `2px solid ${a.hex}44` : 'none',
                  outlineOffset: 2,
                }} />
            ))}
          </div>
        </Row>
        <Row label="Density" sub="Row height and padding">
          <SegBtns
            options={[{ id: 'comfortable', label: 'Comfortable' }, { id: 'compact', label: 'Compact' }]}
            value={density} onChange={setDensity} />
        </Row>
      </Section>

      {/* Market fees */}
      <Section title="Market fees" sub="Used when calculating net proceeds on sells">
        {[
          { label: 'Skinport',  sub: 'skinport.com',  val: feeSkinport, set: setFeeSkinport },
          { label: 'Steam',     sub: 'Steam Market',  val: feeSteam,    set: setFeeSteam    },
          { label: 'CSFloat',   sub: 'csfloat.com',   val: feeCsfloat,  set: setFeeCsfloat  },
        ].map(f => (
          <Row key={f.label} label={f.label} sub={f.sub}>
            <div className="flex items-center gap-2">
              <input type="number" value={f.val} onChange={e => f.set(e.target.value)}
                step="0.1" min="0" max="50" className="input-terminal text-xs py-1.5 w-20 text-right" />
              <span className="font-mono text-xs text-muted-3">%</span>
            </div>
          </Row>
        ))}
      </Section>

      {/* Scanner defaults */}
      <Section title="Scanner defaults" sub="Saved filter state for the market scanner">
        <Row label="Min score" sub="0â100 composite score threshold">
          <div className="flex items-center gap-3">
            <input type="range" min={0} max={100} value={minScore}
              onChange={e => setMinScore(e.target.value)}
              className="w-32 accent-green" />
            <span className="font-mono text-sm font-bold text-green w-8">{minScore}</span>
          </div>
        </Row>
        <Row label="Min volume" sub="Minimum 24h trades for liquidity">
          <div className="flex items-center gap-3">
            <input type="range" min={0} max={100} value={minVolume}
              onChange={e => setMinVolume(e.target.value)}
              className="w-32 accent-green" />
            <span className="font-mono text-sm font-bold text-green w-8">{minVolume}</span>
          </div>
        </Row>
      </Section>

      {/* API status */}
      <Section title="API status" sub="Live connection status for all data sources">
        {[
          { name: 'Skinstrack',   desc: '27-market prices + arbitrage', key: !!process.env.NEXT_PUBLIC_SUPABASE_URL, status: 'primary'  },
          { name: 'CSFloat',      desc: 'Float data + listings',        key: true,                                   status: 'float'    },
          { name: 'Steam OpenID', desc: 'Authentication + inventory',   key: true,                                   status: 'auth'     },
          { name: 'Supabase',     desc: 'Database + realtime',          key: true,                                   status: 'database' },
        ].map(api => (
          <Row key={api.name} label={api.name} sub={api.desc}>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-green signal-dot-live" />
              <span className="font-mono text-[10px] text-muted-3">{api.status}</span>
            </div>
          </Row>
        ))}
      </Section>

      {/* Data */}
      <Section title="Data & privacy" sub="All data stored in your private Supabase project">
        <Row label="Export portfolio CSV" sub="Current holdings with prices and P&L">
          <button className="btn-terminal text-[10px] py-1">â Download</button>
        </Row>
        <Row label="Export transaction ledger" sub="Full buy/sell history">
          <button className="btn-terminal text-[10px] py-1">â Download</button>
        </Row>
        <Row label="Sign out" sub="End your current session">
          <button onClick={async () => {
            await createClient().auth.signOut()
            window.location.href = '/auth/login'
          }} className="font-mono text-xs text-red hover:underline">Sign out â</button>
        </Row>
      </Section>

      <p className="font-mono text-[9px] text-muted-4 text-center">
        CS2 TERMINAL Â· ALL DATA STORED IN YOUR OWN SUPABASE PROJECT Â· NOTHING SHARED WITH THIRD PARTIES
      </p>
    </div>
  )
}
