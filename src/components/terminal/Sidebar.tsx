'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

interface SidebarProps {
  profile: { display_name: string | null; steam_username: string | null; steam_avatar: string | null; steam_id: string | null } | null
  portfolios: { id: string; name: string; is_default: boolean }[]
  userId: string
}

const NAV_GROUPS = [
  {
    label: 'PORTFOLIO',
    items: [
      { href: '/dashboard',             label: 'OVERVIEW',   icon: '', kbd: '1' },
      { href: '/dashboard/portfolio',   label: 'HOLDINGS',   icon: '', kbd: '2' },
      { href: '/dashboard/history',     label: 'HISTORY',    icon: '"', kbd: '3' },
    ],
  },
  {
    label: 'ANALYTICS',
    items: [
      { href: '/dashboard/analytics',   label: 'RISK',       icon: '', kbd: '4' },
      { href: '/dashboard/cases',       label: 'CASES',      icon: '', kbd: '5' },
    ],
  },
  {
    label: 'MARKET',
    items: [
      { href: '/dashboard/scanner',     label: 'SCANNER',    icon: '', kbd: '6' },
      { href: '/dashboard/trends',      label: 'TRENDS',     icon: '', kbd: '7' },
      { href: '/dashboard/calendar',    label: 'CALENDAR',   icon: '.', kbd: '8' },
      { href: '/dashboard/watchlist',   label: 'WATCHLIST',  icon: '', kbd: '9' },
      { href: '/dashboard/alerts',      label: 'ALERTS',     icon: '', kbd: '0', badge: true },
    ],
  },
]

function useUnreadCount() {
  return useQuery({
    queryKey: ['notifications-unread'],
    queryFn: async () => {
      const res = await fetch('/api/alerts/notifications?unread=true&limit=50')
      const { notifications } = await res.json()
      return notifications?.length ?? 0
    },
    refetchInterval: 2 * 60_000,
  })
}

export function TerminalSidebar({ profile, portfolios, userId }: SidebarProps) {
  const pathname = usePathname()
  const router   = useRouter()
  const { data: unreadCount = 0 } = useUnreadCount()

  const displayName = profile?.steam_username ?? profile?.display_name ?? 'Trader'
  const isSteam     = !!profile?.steam_id

  async function signOut() {
    await createClient().auth.signOut()
    router.push('/auth/login')
  }

  return (
    <aside className="w-48 flex-shrink-0 flex flex-col border-r border-terminal-border bg-black/60 overflow-y-auto">
      {/* Brand */}
      <div className="px-4 py-4 border-b border-terminal-border flex-shrink-0">
        <div className="font-mono font-bold text-green text-sm tracking-tight leading-none">
          CS2_TERMINAL
        </div>
        <div className="font-mono text-[9px] text-muted-3 tracking-widest uppercase mt-0.5">
          v0.4.0 . PHASE 4
        </div>
      </div>

      {/* Nav groups */}
      <nav className="flex-1 py-2">
        {NAV_GROUPS.map(group => (
          <div key={group.label}>
            <div className="px-4 pt-3 pb-1 font-mono text-[8px] tracking-widest text-muted-4 uppercase">
              {group.label}
            </div>
            {group.items.map(item => {
              const isActive = item.href === '/dashboard'
                ? pathname === '/dashboard'
                : pathname.startsWith(item.href)
              const showBadge = item.badge && unreadCount > 0
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`
                    flex items-center gap-2.5 px-4 py-2 font-mono text-[11px] tracking-widest
                    transition-all duration-100 group relative
                    ${isActive
                      ? 'text-green bg-green-soft'
                      : 'text-muted-3 hover:text-muted-2 hover:bg-terminal-surface'
                    }
                  `}
                >
                  {isActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-green rounded-r"
                      style={{ boxShadow: '0 0 6px var(--green)' }} />
                  )}
                  <span className={`text-[13px] leading-none ${isActive ? 'text-green' : 'text-muted-3 group-hover:text-muted-2'}`}>
                    {item.icon}
                  </span>
                  <span className="flex-1">{item.label}</span>
                  <div className="flex items-center gap-1">
                    {showBadge && (
                      <span className="w-4 h-4 rounded-full bg-red text-white font-mono text-[8px] font-bold flex items-center justify-center leading-none">
                        {Math.min(unreadCount, 9)}
                      </span>
                    )}
                    <span className="font-mono text-[9px] text-muted-4 opacity-60">{item.kbd}</span>
                  </div>
                </Link>
              )
            })}
          </div>
        ))}

        {/* Divider */}
        <div className="mx-4 my-2 border-t border-terminal-border" />

        <Link href="/dashboard/settings"
          className={`flex items-center gap-2.5 px-4 py-2 font-mono text-[11px] tracking-widest transition-all
            ${pathname === '/dashboard/settings' ? 'text-green bg-green-soft' : 'text-muted-3 hover:text-muted-2 hover:bg-terminal-surface'}`}>
          <span className="text-[13px] leading-none"></span>
          SETTINGS
          <span className="ml-auto font-mono text-[9px] text-muted-4 opacity-60">S</span>
        </Link>
      </nav>

      {/* Portfolio switcher */}
      {portfolios.length > 1 && (
        <div className="px-3 py-2 border-t border-terminal-border flex-shrink-0">
          <div className="font-mono text-[8px] text-muted-4 uppercase tracking-widest mb-1.5 px-1">Portfolio</div>
          {portfolios.map(pf => (
            <button key={pf.id}
              className={`w-full text-left px-2 py-1 rounded font-mono text-[10px] transition-all ${pf.is_default ? 'text-green' : 'text-muted-3 hover:text-muted-2'}`}>
              {pf.is_default ? ' ' : '  '}{pf.name}
            </button>
          ))}
        </div>
      )}

      {/* User */}
      <div className="border-t border-terminal-border p-3 flex-shrink-0">
        <div className="flex items-center gap-2 mb-2">
          {profile?.steam_avatar ? (
            <img src={profile.steam_avatar} alt="" className="w-6 h-6 rounded-sm border border-terminal-border-2 flex-shrink-0" />
          ) : (
            <div className="w-6 h-6 rounded-sm bg-terminal-surface-2 border border-terminal-border flex items-center justify-center font-mono text-[10px] text-green flex-shrink-0">
              {displayName[0]?.toUpperCase()}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="font-mono text-[10px] text-[var(--text)] truncate">{displayName}</div>
            <div className="font-mono text-[9px] text-muted-3">{isSteam ? ' Steam' : ' Email'}</div>
          </div>
        </div>
        <button onClick={signOut}
          className="w-full text-left px-2 py-1 font-mono text-[10px] text-muted-3 hover:text-red transition-colors rounded hover:bg-red-soft">
           Sign out
        </button>
      </div>
    </aside>
  )
}
