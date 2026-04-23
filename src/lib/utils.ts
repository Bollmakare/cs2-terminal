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
