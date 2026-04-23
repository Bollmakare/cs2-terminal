'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { fmt$, fmtPct, cn, scoreColor, CAT_COLOR } from '@/lib/utils'

// ââ Types âââââââââââââââââââââââââââââââââââââââââââââââââ
interface MarketEvent {
  id: number
  event_type: string
  title: string
  description: string | null
  starts_at: string
  ends_at: string | null
  expected_impact: string | null
  affected_categories: string[]
  impact_magnitude: number
  is_confirmed: boolean
  url: string | null
  days_until: number
  is_active: boolean
}

interface SellSignalRow {
  holding_id: string
  item_name: string
  item_condition: string | null
  quantity: number
  cost_basis: number
  last_price: number | null
  sell_score: number
  urgency: string
  recommendation: string
  unrealized_pct: number
  days_held: number
  reasons: { type: string; label: string; detail: string; weight: number; direction: string }[]
}

// ââ Hooks âââââââââââââââââââââââââââââââââââââââââââââââââ
function useEvents() {
  return useQuery<MarketEvent[]>({
    queryKey: ['market-events'],
    queryFn: async () => {
      const res = await fetch('/api/events?days=120')
      const { events } = await res.json()
      return events ?? []
    },
    staleTime: 10 * 60_000,
  })
}

function useSellSignals(portfolioId: string | null) {
  return useQuery<SellSignalRow[]>({
    queryKey: ['sell-signals', portfolioId],
    queryFn: async () => {
      if (!portfolioId) return []
      const res = await fetch(`/api/signals/sell?portfolio_id=${portfolioId}`)
      const { signals } = await res.json()
      return signals ?? []
    },
    enabled: !!portfolioId,
    staleTime: 5 * 60_000,
  })
}

function usePortFolioId() {
  return useQuery<string | null>({
    queryKey: ['portfolio-id-cal'],
    queryFn: async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('portfolios').select('id').eq('is_default', true).single()
      return data?.id ?? null
    },
    staleTime: 60_000,
  })
}

// ââ Event type config âââââââââââââââââââââââââââââââââââââ
const EVENT_CONFIG: Record<string, { icon: string; color: string; bg: string }> = {
  major:       { icon: 'ð', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
  operation:   { icon: 'â¡', color: '#00ff88', bg: 'rgba(0,255,136,0.08)' },
  case_release:{ icon: 'ð¦', color: '#a855f7', bg: 'rgba(168,85,247,0.1)' },
  steam_sale:  { icon: 'ð¸', color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
  patch:       { icon: 'ð§', color: '#60a5fa', bg: 'rgba(96,165,250,0.1)' },
  other:       { icon: 'ð', color: '#94a3b8', bg: 'rgba(148,163,184,0.1)' },
}

const IMPACT_CONFIG: Record<string, { label: string; color: string }> = {
  bullish: { label: 'â² Bullish',  color: 'var(--green)' },
  bearish: { label: 'â¼ Bearish',  color: 'var(--red)'   },
  mixed:   { label: 'â Mixed',    color: 'var(--amber)'  },
  neutral: { label: 'â Neutral',  color: 'var(--text-3)' },
}

const URGENCY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  high:   { label: 'ð´ SELL NOW',  color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  medium: { label: 'ð¡ CONSIDER',  color: '#f59e0b', bg: 'rgba(245,158,11,0.10)' },
  low:    { label: 'ð¢ WATCH',     color: '#00ff88', bg: 'rgba(0,255,136,0.06)' },
}

// ââ Event card ââââââââââââââââââââââââââââââââââââââââââââ
function EventCard({ event }: { key?: number; event: MarketEvent }) {
  const [expanded, setExpanded] = useState(false)
  const cfg = EVENT_CONFIG[event.event_type] ?? EVENT_CONFIG.other
  const imp = IMPACT_CONFIG[event.expected_impact ?? 'neutral'] ?? IMPACT_CONFIG.neutral

  const daysLabel = event.is_active ? 'ð¢ ACTIVE NOW'
    : event.days_until < 0 ? `${Math.abs(event.days_until)}d ago`
    : event.days_until === 0 ? 'TODAY'
    : event.days_until === 1 ? 'TOMORROW'
    : `in ${event.days_until}d`

  return (
    <div className={cn(
      'rounded border transition-all cursor-pointer',
      event.is_active ? 'border-green/40' : 'border-terminal-border hover:border-terminal-border-2'
    )}
      style={{ background: event.is_active ? 'rgba(0,255,136,0.04)' : cfg.bg }}
      onClick={() => setExpanded(e => !e)}
    >
      <div className="flex items-start gap-3 px-4 py-3">
        {/* Icon + magnitude */}
        <div className="flex flex-col items-center gap-1 flex-shrink-0">
          <span className="text-xl leading-none">{cfg.icon}</span>
          <div className="flex gap-0.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="w-1 h-1 rounded-full"
                style={{ background: i < event.impact_magnitude ? cfg.color : '#2a2a2a' }} />
            ))}
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs font-bold text-[var(--text)]">{event.title}</span>
            {!event.is_confirmed && (
              <span className="font-mono text-[9px] text-amber border border-amber/30 px-1.5 py-0.5 rounded">
                SPECULATIVE
              </span>
            )}
            {event.is_active && (
              <span className="font-mono text-[9px] font-bold text-green border border-green/30 px-1.5 py-0.5 rounded">
                ACTIVE
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1">
            <span className="font-mono text-[9px]" style={{ color: imp.color }}>{imp.label}</span>
            <span className="font-mono text-[9px] text-muted-3">
              {new Date(event.starts_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              {event.ends_at && ` â ${new Date(event.ends_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
            </span>
            {event.affected_categories.length > 0 && (
              <div className="flex gap-1">
                {event.affected_categories.slice(0, 4).map(cat => (
                  <span key={cat} className="font-mono text-[8px] px-1 py-0.5 rounded"
                    style={{ background: `${CAT_COLOR[cat] ?? '#666'}20`, color: CAT_COLOR[cat] ?? '#666' }}>
                    {cat}
                  </span>
                ))}
      2       </div>
            )}
          </div>
        </div>

        <div className="text-right flex-shrink-0">
          <div className="font-mono text-[10px] font-bold" style={{ color: cfg.color }}>{daysLabel}</div>
          <div className="font-mono text-[8px] text-muted-4 mt-0.5">impact {event.impact_magnitude}/5</div>
        </div>
      </div>

      {expanded && event.description && (
        <div className="px-4 pb-3 pt-0">
          <div className="border-t border-terminal-border pt-2">
            <p className="font-mono text-[10px] text-muted-2 leading-relaxed">{event.description}</p>
            {event.url && (
              <a href={event.url} target="_blank" rel="noopener"
                className="font-mono text-[9px] text-green hover:underline mt-1 inline-block">
                â Source
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ââ Sell signal card ââââââââââââââââââââââââââââââââââââââ
function SellCard({ signal }: { key?: string; signal: SellSignalRow }) {
  const [expanded, setExpanded] = useState(false)
  const cfg = URGENCY_CONFIG[signal.urgency] ?? URGENCY_CONFIG.low
  const up  = signal.unrealized_pct >= 0

  return (
    <div className="rounded border border-terminal-border hover:border-terminal-border-2
                    transition-all cursor-pointer"
      style={{ background: cfg.bg }}
      onClick={() => setExpanded(e => !e)}
    >
      <div className="flex items-start gap-3 px-3 py-2.5">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] font-bold text-[var(--text)] truncate max-w-[200px]">
              {signal.item_name}
            </span>
            {signal.item_condition && (
              <span className="font-mono text-[9px] text-muted-3">{signal.item_condition}</span>
            )}
            {signal.quantity > 1 && (
              <span className="font-mono text-[9px] text-muted-3">Ã{signal.quantity}</span>
            )}
          </div>
          <div className="font-mono text-[9px] text-muted-3 mt-0.5 truncate">
            {signal.recommendation}
          </div>
        </div>

        <div className="text-right flex-shrink-0">
          <div className="font-mono text-[10px] font-bold px-2 py-0.5 rounded border text-[9px]"
            style={{ color: cfg.color, borderColor: `${cfg.color}33`, background: cfg.bg }}>
            {cfg.label}
          </div>
          <div className="flex items-center justify-end gap-2 mt-1">
            <span className="font-mono text-[10px]" style={{ color: scoreColor(100 - signal.sell_score) }}>
              {signal.sell_score}/100
            </span>
            <span className={cn('font-mono text-[10px] font-bold', up ? 'text-green' : 'text-red')}>
              {signal.unrealized_pct >= 0 ? '+' : ''}{signal.unrealized_pct.toFixed(1)}%
            </span>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="px-3 pb-2.5 space-y-1.5">
          <div className="border-t border-terminal-border pt-2 grid grid-cols-3 gap-2 mb-2">
            <div>
              <div className="font-mono text-[8px] text-muted-4">Cost basis</div>
              <div className="font-mono text-[10px] text-[var(--text)]">{fmt$(signal.cost_basis)}</div>
            </div>
            <div>
              <div className="font-mono text-[8px] text-muted-4">Current</div>
              <div className="font-mono text-[10px] text-[var(--text)]">{fmt$(signal.last_price)}</div>
            </div>
            <div>
              <div className="font-mono text-[8px] text-muted-4">Held</div>
              <div className="font-mono text-[10px] text-[var(--text)]">{signal.days_held}d</div>
            </div>
          </div>
          {signal.reasons.filter(r => r.direction === 'sell').map((r, i) => (
            <div key={i} className="flex items-start gap-2">
              <div className="w-1 h-1 rounded-full flex-shrink-0 mt-1.5"
       2        style={{ background: r.weight >= 20 ? '#ef4444' : r.weight >= 10 ? '#f59e0b' : '#00ff88' }} />
              <div>
                <span className="font-mono text-[10px] font-bold text-[var(--text)]">{r.label}</span>
                <span className="font-mono text-[9px] text-muted-3 ml-1">â {r.detail}</span>
              </div>
            </div>
          ))}
          {signal.reasons.filter(r => r.direction === 'hold').map((r, i) => (
            <div key={i} className="flex items-start gap-2 opacity-60">
              <div className="w-1 h-1 rounded-full flex-shrink-0 mt-1.5 bg-muted-3" />
              <div>
                <span className="font-mono text-[9px] text-muted-3">HOLD: {r.label} â {r.detail}</span>
            2 </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ââ Main client âââââââââââââââââââââââââââââââââââââââââââ
export function CalendarClient() {
  const [filter, setFilter] = useState<'all' | 'major' | 'operation' | 'steam_sale' | 'case_release'>('all')
  const [tab, setTab] = useState<'calendar' | 'sell'>('calendar')

  const { data: events = [],  isLoading: evLoad } = useEvents()
  const { data: portfolioId }                      = usePortfolioId()
  const { data: sellSignals = [], isLoading: ssLoad } = useSellSignals(portfolioId ?? null)

  const filteredEvents = filter === 'all' ? events : events.filter(e => e.event_type === filter)

  // Group events: active, upcoming, past
  const now = new Date(); now.setHours(0, 0, 0, 0)
  const active   = filteredEvents.filter(e => e.is_active)
  const upcoming = filteredEvents.filter(e => !e.is_active && e.days_until > 0)
  const past     = filteredEvents.filter(e => !e.is_active && e.days_until <= 0).reverse()

  const highUrgency = sellSignals.filter(s => s.urgency === 'high').length
  const medUrgency  = sellSignals.filter(s => s.urgency === 'medium').length

  return (
    <div className="flex flex-col h-[calc(100vh-88px)] overflow-hidden gap-3">
      {/* Header tabs */}
      <div className="panel flex-shrink-0">
        <div className="flex items-center gap-4 px-4 py-2">
          <div className="flex gap-2">
            <button onClick={() => setTab('calendar')}
              className={cn('px-3 py-1.5 font-mono text-[11px] rounded border transition-all',
                tab === 'calendar' ? 'bg-green text-black border-green font-bold' : 'border-terminal-border text-muted-3')}>
              ð Event Calendar
            </button>
            <button onClick={() => setTab('sell')}
              className={cn('px-3 py-1.5 font-mono text-[11px] rounded border transition-all flex items-center gap-2',
                tab === 'sell' ? 'bg-red/20 text-red border-red/40 font-bold' : 'border-terminal-border text-muted-3')}>
              ð¤ Sell Radar
              {(highUrgency > 0 || medUrgency > 0) && (
                <span className="w-4 h-4 rounded-full bg-red text-white font-mono text-[8px] flex items-center justify-center">
                  {highUrgency + medUrgency}
                </span>
              )}
            </button>
          </div>

          {tab === 'calendar' && (
            <div className="flex gap-1 ml-auto">
              {(['all', 'major', 'operation', 'steam_sale', 'case_release'] as const).map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  className={cn('px-2 py-1 font-mono text-[9px] rounded border transition-all capitalize',
                    filter === f ? 'bg-green text-black border-green font-bold' : 'border-terminal-border text-muted-3')}>
                  {f === 'steam_sale' ? 'Steam Sale' : f === 'case_release' ? 'Cases' : f}
                </button>
              ))}
            </div>
          )}

          {tab === 'sell' && sellSignals.length > 0 && (
            <div className="flex items-center gap-4 ml-auto font-mono text-[10px]">
              <span className="text-red font-bold">{highUrgency} HIGH urgency</span>
              <span className="text-amber">{medUrgency} MEDIUM</span>
              <span className="text-muted-3">{sellSignals.filter(s => s.urgency === 'low').length} watching</span>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto space-y-3 pb-3">
        {tab === 'calendar' ? (
          <>
            {/* Active events */}
     2      {active.length > 0 && (
              <div>
                <div className="font-mono text-[9px] text-green uppercase tracking-widest px-1 mb-2">
                  â Active now
                </div>
                <div className="space-y-2">
                  {active.map(e => <EventCard key={e.id} event={e} />)}
                </div>
              </div>
     
_BËÊ\ÛÛZ[È
ßBÝ\ÛÛZ[Ë[Ý	
]]Û\ÜÓ[YOHÛ[[ÛÈ^VÎ\H^[]]YLÈ\\Ø\ÙHXÚÚ[Ë]ÚY\ÝLHXL\ÛÛZ[È
Ý\ÛÛZ[Ë[ÝJBÙ]]Û\ÜÓ[YOHÜXÙK^KLÝ\ÛÛZ[ËX\
HO][Ø\Ù^O^ÙKYH][^Ù_HÏ_BÙ]Ù]
_BËÊ\Ý
ÛÛ\ÙY
H
ßBÜ\Ý[Ý	
]]Û\ÜÓ[YOHÛ[[ÛÈ^VÎ\H^[]]YM\\Ø\ÙHXÚÚ[Ë]ÚY\ÝLHXLXÙ[\Ý
Ü\Ý[ÝJBÙ]]Û\ÜÓ[YOHÜXÙK^KLKHÜXÚ]KMLÜ\ÝÛXÙJÊKX\
HO][Ø\Ù^O^ÙKYH][^Ù_HÏ_BÙ]Ù]
_BÙ]ØY	
]Û\ÜÓ[YOHÜXÙK^KLÐ\^KÛJÈ[ÝHJKX\

ËJHO
]Ù^O^Ú_HÛ\ÜÓ[YOHLMÚÙ[]ÛÝ[YÏ
J_BÙ]
_BÈY]ØY	[\Y][Ë[ÝOOH	
]Û\ÜÓ[YOH[[N^XÙ[\Û\ÜÓ[YOHÛ[[ÛÈ^\ÛH^[]]YLÈÈ][ÈÝ[ÜÙ]
_BËÊ\ØÛZ[Y\
ßB]Û\ÜÓ[YOH[[LÈÛ\ÜÓ[YOHÛ[[ÛÈ^VÎ\H^[]]YMXY[Ë\[^Y8¦¨][]\ÈX\ÙYÔPÕSUUH\H\ÙYÛ\ÝÜXØ[ÔÌ]\È[ÛÛ[][]H[[[HÙ\ÈÝKX[Ý[ÙH[ÜÝ][Ë[Ø^\È\YHYÜHXZÚ[ÈY[ÈXÚ\Ú[ÛËXÙH[\XÝ\Ý[X]\È\HYXØ][Û[Ý[[ÚX[YXÙKÜÙ]0Ï
H
ËÊÝÈ]ÛÜÜÈ
ßB]Û\ÜÓ[YOH[[MKLÈ^][\Ë\Ý\Ø\M]Û\ÜÓ[YOHÜYÜYXÛÛËLÈØ\M^LHÖÂÈXÛÛ	ü'å-	ËX[	ÒQÒ8¡%XÝÝÉË\ØÎ	ÔÝÛÈÝ\^[Ú[ÛÝÜÜÜËÜXZÜ][[Ù	ÈKÈXÛÛ	ð¡', label: 'MEDIUM â Consider', desc: 'Trend reversal, profit target hit, Buff floor falling' },
                  { icon: 'ð¢', label: 'WATCH â Monitor', desc: 'Early warning â continue watching price action' },
                ].map(u => (
                  <div key={u.label}>
                    <div className="font-mono text-[10px] font-bold text-[var(--text)] mb-0.5">{u.icon} {u.label}</div>
                    <div className="font-mono text-[9px] text-muted-3">{u.desc}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Sell signals */}
            {ssLoad ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-16 skeleton rounded" />)}
              </div>
            ) : sellSignals.length === 0 ? (
              <div className="panel p-8 text-center">
                <p className="font-mono text-sm text-muted-2 mb-2">No sell signals</p>
                <p className="font-mono text-xs text-muted-3">
                  All holdings look reasonable to hold. Signals appear when positions become overextended,
                  hit profit targets, or trigger stop-loss conditions.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {/* Group by urgency */}
                {(['high', 'medium', 'low'] as const).map(urgency => {
                  const group = sellSignals.filter(s => s.urgency === urgency)
                  if (!group.length) return null
                  const urgencyCfg = URGENCY_CONFIG[urgency]
                  return (
                    <div key={urgency}>
                      <div className="font-mono text-[9px] uppercase tracking-widest px-1 mb-2"
                        style={{ color: urgencyCfg.color }}>
        2               {urgencyCfg.label} ({group.length})
                      </div>
                      <div className="space-y-2">
                        {group.map(s => <SellCard key={s.holding_id} signal={s} />)}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
 À2    </div>
    </div>
  )
}
