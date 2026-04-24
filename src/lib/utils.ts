import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatUSD(value: number | null | undefined, decimals = 2): string {
  if (value == null) return '-'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)
}

export function formatPct(value: number | null | undefined, decimals = 1): string {
  if (value == null) return '-'
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(decimals)}%`
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(date))
}

export function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export function calcPnl(costBasis: number, currentPrice: number, quantity: number) {
  const unrealized = (currentPrice - costBasis) * quantity
  const pct = costBasis > 0 ? ((currentPrice - costBasis) / costBasis) * 100 : 0
  return { unrealized, pct }
}

export function calcRoi(costBasis: number, proceeds: number): number {
  if (costBasis === 0) return 0
  return ((proceeds - costBasis) / costBasis) * 100
}

// Additional exports for compatibility
export const fmt$ = (v: number | null | undefined, opts?: { sign?: boolean }): string => {
  if (v == null) return '--'
  const abs = Math.abs(v)
  const str = abs >= 1000 ? '$' + (abs/1000).toFixed(1) + 'k' : '$' + abs.toFixed(2)
  return opts?.sign ? (v >= 0 ? '+' : '-') + str : (v < 0 ? '-' : '') + str
}
export const fmtPct = (v: number | null | undefined): string => v == null ? '--' : (v >= 0 ? '+' : '') + v.toFixed(1) + '%'
export const CAT_COLOR: Record<string, string> = {
  rifle: '#4ade80', sniper: '#60a5fa', pistol: '#f59e0b',
  knife: '#a855f7', gloves: '#ec4899', case: '#94a3b8', other: '#6b7280',
}
export const skinImg = (name: string, sz = 128) => 'https://community.cloudflare.steamstatic.com/economy/image/' + encodeURIComponent(name) + '/' + sz + 'fx' + sz + 'f'
export const verdictClass = (v: string) => ({ 'Strong Buy': 'text-green', Buy: 'text-green', Watch: 'text-amber', Fair: 'text-muted-2', Avoid: 'text-red' }[v] ?? 'text-muted-3')
export const scoreColor = (score: number) => score >= 70 ? 'var(--green)' : score >= 40 ? 'var(--amber)' : 'var(--red)'
