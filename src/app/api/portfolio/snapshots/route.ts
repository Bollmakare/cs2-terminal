import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const pid = req.nextUrl.searchParams.get('portfolio_id')
  const days = parseInt(req.nextUrl.searchParams.get('days') ?? '90')
  if (!pid) return NextResponse.json({ error: 'portfolio_id required' }, { status: 400 })

  const since = new Date()
  since.setDate(since.getDate() - days)

  const { data, error } = await supabase
    .from('portfolio_snapshots')
    .select('total_value, cost_basis, unrealized_pnl, snapped_at')
    .eq('portfolio_id', pid)
    .eq('user_id', user.id)
    .gte('snapped_at', since.toISOString().slice(0, 10))
    .order('snapped_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ snapshots: data })
}
