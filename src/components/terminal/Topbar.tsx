'use client'

import { useState, useEffect, useCallback } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { NewsTicker } from '@/components/terminal/NewsTicker'

interface TopbarProps { userId: string }

const PAGE_TITLES: Record<string, string> = {
  '/dashboard':             'Overview',
  '/dashboard/portfolio':   'Portfolio . Holdings',
  '/dashboard/analytics':   'Portfolio . Analytics',
  '/dashboard/history':     'Portfolio . History',
  '/dashboard/scanner':     'Market Scanner',
  '/dashboard/watchlist':   'Watchlist',
  '/dashboard/cases':       'Cases Terminal',
  '/dashboard/alerts':      'Alerts',
  '/dashboard/settings':    'Settings',
}

const ACCENTS = [
  { id: 'green',  hex: '#00ff88' },
  { id: 'ember',  hex: '#f97316' },
  { id: 'blue',   hex: '#3b82f6' },
  { id: 'amber',  hex: '#f59e0b' },
]

//  Notification Bell 
function NotificationBell() {
  const [open, setOpen] = useState(false)
  const qc = useQueryClient()

  const { data: notifs = [] } = useQuery<any[]>({
    queryKey: ['notifications'],
    queryFn: async () => {
      const res = await fetch('/api/alerts/notifications?limit=15')
      const { notifications } = await res.json()
      return notifications ?? []
    },
    refetchInterval: 2 * 60_000,
  })

  const unread = notifs.filter((n: any) => !n.is_read).length

  async function markAllRead() {
    await fetch('/api/alerts/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mark_all_read: true }),
    })
    qc.invalidateQueries({ queryKey: ['notifications'] })
    qc.invalidateQueries({ queryKey: ['notifications-unread'] })
  }

  function timeAgo(d: string) {
    const mins = Math.floor((Date.now() - new Date(d).getTime()) / 60000)
    if (mins < 60)   return `${mins}m ago`
    if (mins < 1440) return `${Math.floor(mins/60)}h ago`
    return `${Math.floor(mins/1440)}d ago`
  }

  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)} className="btn-terminal relative" title="Notifications">
        <span className="text-[13px] leading-none"></span>
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-red text-white font-mono text-[7px] font-bold flex items-center justify-center leading-none">
            {Math.min(unread, 9)}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full right-0 mt-1 w-80 z-50 bg-[#0d0d0d] border border-terminal-border-2 rounded-lg shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-terminal-border">
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-3">
                Notifications {unread > 0 && <span className="text-green">({unread} new)</span>}
              </span>
              {unread > 0 && (
                <button onClick={markAllRead} className="font-mono text-[9px] text-green hover:underline">
                  Mark all read
                </button>
              )}
            </div>
            <div className="max-h-80 overflow-y-auto divide-y divide-terminal-border">
              {notifs.length === 0 ? (
                <div className="p-4 text-center font-mono text-xs text-muted-3">
                  No notifications yet.<br/>
                  <a href="/dashboard/alerts" className="text-green hover:underline" onClick={() => setOpen(false)}>
                    Set up alerts 
                  </a>
                </div>
              ) : (
                notifs.map((n: any) => (
                  <div key={n.id} className={`px-3 py-2.5 transition-colors hover:bg-terminal-surface-2 ${!n.is_read ? 'border-l-2 border-green' : 'border-l-2 border-transparent'}`}>
                    <div className="font-mono text-[11px] font-bold text-[var(--text)]">{n.title}</div>
                    <div className="font-mono text-[10px] text-muted-3 mt-0.5">{n.body}</div>
                    <div className="font-mono text-[9px] text-muted-4 mt-0.5">{timeAgo(n.created_at)}</div>
                  </div>
                ))
              )}
            </div>
            <div className="border-t border-terminal-border p-2 text-center">
              <a href="/dashboard/alerts" onClick={() => setOpen(false)}
                className="font-mono text-[10px] text-green hover:underline">
                Manage all alerts 
              </a>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

//  Topbar 
export function TerminalTopbar({ userId }: TopbarProps) {
  const pathname = usePathname()
  const router   = useRouter()
  const [refreshing,  setRefreshing]  = useState(false)
  const [lastRefresh, setLastRefresh] = useState<string | null>(null)
  const [liveDot,     setLiveDot]     = useState(false)
  const [now,         setNow]         = useState('')
  const [tweaksOpen,  setTweaksOpen]  = useState(false)
  const [accent,      setAccent]      = useState('green')

  const title = PAGE_TITLES[pathname] ?? 'Dashboard'

  // Clock
  useEffect(() => {
    const tick = () => setNow(new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }))
    tick(); const t = setInterval(tick, 1000); return () => clearInterval(t)
  }, [])

  // Keyboard shortcuts (18, S, R)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const map: Record<string, string> = {
        '1': '/dashboard',           '2': '/dashboard/portfolio',
        '3': '/dashboard/history',   '4': '/dashboard/analytics',
        '5': '/dashboard/cases',     '6': '/dashboard/scanner',
        '7': '/dashboard/trends',    '8': '/dashboard/calendar',
        '9': '/dashboard/watchlist', '0': '/dashboard/alerts',
      }
      if (map[e.key]) { router.push(map[e.key]); return }
      if (e.key.toLowerCase() === 's' && !e.metaKey && !e.ctrlKey) router.push('/dashboard/settings')
      if ((e.metaKey || e.ctrlKey) && e.key === 'r') { e.preventDefault(); handleRefresh() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [router])

  const handleRefresh = useCallback(async () => {
    if (refreshing) return
    setRefreshing(true)
    try {
      const supabase = await createClient()
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/prices/refresh', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session?.access_token}` },
      })
      const data = await res.json()
      if (res.ok) {
        setLastRefresh(new Date().toLocaleTimeString('en-US', { hour12: false }))
        setLiveDot(true)
        setTimeout(() => setLiveDot(false), 8000)
        window.dispatchEvent(new CustomEvent('prices:refreshed'))
        // Also sync case prices and run alert check
        fetch('/api/cases', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${session?.access_token}` },
        }).catch(() => {})
      }
    } finally { setRefreshing(false) }
  }, [refreshing])

  function applyAccent(id: string) {
    setAccent(id)
    document.documentElement.setAttribute('data-accent', id)
  }

  return (
    <header className="flex-shrink-0 border-b border-terminal-border bg-black/40">
      {/* News ticker row */}
      <div className="border-b border-terminal-border h-7 flex items-center px-3 gap-2 overflow-hidden">
        <span className="font-mono text-[8px] text-muted-4 uppercase tracking-widest flex-shrink-0">NEWS</span>
        <div className="flex-1 overflow-hidden"><NewsTicker /></div>
      </div>

      {/* Main row */}
      <div className="flex items-center justify-between px-4 h-10 gap-3">
        {/* Left: page title + live dot */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="font-mono text-[11px] font-bold text-[var(--text)] tracking-tight">{title}</span>
          <div className="hidden md:flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full transition-all ${liveDot ? 'bg-green' : 'bg-terminal-border-2'}`}
              style={liveDot ? { boxShadow: '0 0 6px var(--green)' } : undefined} />
            <span className="font-mono text-[9px] text-muted-3">
              {liveDot ? 'LIVE' : lastRefresh ? `Updated ${lastRefresh}` : 'SKINSTRACK . 27M'}
            </span>
          </div>
        </div>

        {/* Center: kbd hints */}
        <div className="hidden xl:flex items-center gap-3 font-mono text-[9px] text-muted-4 tracking-wider">
          <span>[18] NAV</span>
          <span>[S] SETTINGS</span>
          <span>[R] REFRESH</span>
        </div>

        {/* Right: controls */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button onClick={handleRefresh} disabled={refreshing} className="btn-terminal text-[10px]">
            <span className={refreshing ? 'inline-block animate-spin' : ''}>"</span>
            {refreshing ? 'Fetching' : 'Refresh'}
          </button>

          <NotificationBell />

          {/* Accent picker */}
          <div className="relative">
            <button onClick={() => setTweaksOpen(o => !o)} className="btn-terminal text-[10px]" title="Accent">
              <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: ACCENTS.find(a => a.id === accent)?.hex ?? 'var(--green)' }} />
            </button>
            {tweaksOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setTweaksOpen(false)} />
                <div className="absolute top-full right-0 mt-1 z-50 bg-[#0d0d0d] border border-terminal-border-2 rounded shadow-xl p-3 flex gap-2">
                  {ACCENTS.map(a => (
                    <button key={a.id} onClick={() => { applyAccent(a.id); setTweaksOpen(false) }}
                      title={a.id}
                      className="w-6 h-6 rounded-sm border-2 transition-all"
                      style={{ background: a.hex, borderColor: accent === a.id ? '#fff' : 'transparent' }} />
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="font-mono text-[11px] text-muted-3 tabular-nums w-20 text-right hidden sm:block">{now}</div>
        </div>
      </div>
    </header>
  )
}
