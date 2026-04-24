import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const days = parseInt(req.nextUrl.searchParams.get('days') ?? '90')
  const type = req.nextUrl.searchParams.get('type') ?? 'all'

  const since = new Date(); since.setDate(since.getDate() - 7)
  const until = new Date(); until.setDate(until.getDate() + days)

  let query = supabase.from('market_events').select('*')
    .gte('starts_at', since.toISOString().slice(0, 10))
    .lte('starts_at', until.toISOString().slice(0, 10))
    .order('starts_at', { ascending: true })

  if (type !== 'all') query = query.eq('event_type', type)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const today = new Date(); today.setHours(0,0,0,0)
  const events = (data ?? []).map(e => ({
    ...e,
    days_until: Math.ceil((new Date(e.starts_at).getTime() - today.getTime()) / 86400000),
    is_active: e.ends_at
      ? new Date(e.starts_at) <= today && new Date(e.ends_at) >= today
      : Math.abs(new Date(e.starts_at).getTime() - today.getTime()) < 86400000,
  }))

  return NextResponse.json({ events })
}
