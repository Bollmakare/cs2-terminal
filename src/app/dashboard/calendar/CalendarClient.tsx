'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

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

export function CalendarClient() {
  const { data: events = [], isLoading } = useEvents()
  const [filter, setFilter] = useState<'all'|'major'|'operation'|'steam_sale'|'case_release'>('all')

  const filtered = filter === 'all' ? events : events.filter(e => e.event_type === filter)
  const active = filtered.filter(e => e.is_active)
  const upcoming = filtered.filter(e => !e.is_active && e.days_until > 0)
  const past = filtered.filter(e => !e.is_active && e.days_until <= 0).reverse()

  const IMPACT_COLOR: Record<string, string> = {
    bullish: 'var(--green)', bearish: 'var(--red)', mixed: 'var(--amber)', neutral: 'var(--text-3)',
  }

  return (
    <div className="flex flex-col h-[calc(100vh-88px)] overflow-hidden gap-3">
      <div className="panel flex-shrink-0 flex items-center gap-4 px-4 py-2">
        <div className="flex gap-1">
          {(['all','major','operation','steam_sale','case_release'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-2 py-1 font-mono text-[9px] rounded border transition-all capitalize ${filter === f ? 'bg-green text-black border-green font-bold' : 'border-terminal-border text-muted-3'}`}>
              {f === 'steam_sale' ? 'Steam Sale' : f === 'case_release' ? 'Cases' : f}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-3 pb-3">
        {isLoading && Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 skeleton rounded" />
        ))}

        {active.length > 0 && (
          <div>
            <div className="font-mono text-[9px] text-green uppercase tracking-widest px-1 mb-2">Active now</div>
            <div className="space-y-2">
              {active.map(e => <EventCard key={e.id} event={e} />)}
            </div>
          </div>
        )}

        {upcoming.length > 0 && (
          <div>
            <div className="font-mono text-[9px] text-muted-3 uppercase tracking-widest px-1 mb-2">Upcoming ({upcoming.length})</div>
            <div className="space-y-2">
              {upcoming.map(e => <EventCard key={e.id} event={e} />)}
            </div>
          </div>
        )}

        {past.length > 0 && (
          <div>
            <div className="font-mono text-[9px] text-muted-4 uppercase tracking-widest px-1 mb-2">Recent past ({past.length})</div>
            <div className="space-y-1.5 opacity-50">
              {past.slice(0, 3).map(e => <EventCard key={e.id} event={e} />)}
            </div>
          </div>
        )}

        {!isLoading && filtered.length === 0 && (
          <div className="panel p-8 text-center">
            <p className="font-mono text-sm text-muted-3">No events found</p>
          </div>
        )}
      </div>
    </div>
  )
}

function EventCard({ event }: { event: MarketEvent }) {
  const [expanded, setExpanded] = useState(false)
  const daysLabel = event.is_active ? 'ACTIVE NOW'
    : event.days_until < 0 ? `${Math.abs(event.days_until)}d ago`
    : event.days_until === 0 ? 'TODAY'
    : `in ${event.days_until}d`

  return (
    <div className={`rounded border transition-all cursor-pointer ${event.is_active ? 'border-green/40' : 'border-terminal-border hover:border-terminal-border-2'}`}
      onClick={() => setExpanded(e => !e)}>
      <div className="flex items-start gap-3 px-4 py-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-bold text-[var(--text)]">{event.title}</span>
            {!event.is_confirmed && <span className="font-mono text-[9px] text-amber border border-amber/30 px-1.5 py-0.5 rounded">SPECULATIVE</span>}
            {event.is_active && <span className="font-mono text-[9px] font-bold text-green border border-green/30 px-1.5 py-0.5 rounded">ACTIVE</span>}
          </div>
          <div className="flex items-center gap-3 mt-1">
            <span className="font-mono text-[9px] text-muted-3">{new Date(event.starts_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
            <span className="font-mono text-[9px] text-muted-3">impact {event.impact_magnitude}/5</span>
          </div>
        </div>
        <div className="font-mono text-[10px] font-bold">{daysLabel}</div>
      </div>
      {expanded && event.description && (
        <div className="px-4 pb-3 pt-0">
          <div className="border-t border-terminal-border pt-2">
            <p className="font-mono text-[10px] text-muted-2 leading-relaxed">{event.description}</p>
          </div>
        </div>
      )}
    </div>
  )
}
