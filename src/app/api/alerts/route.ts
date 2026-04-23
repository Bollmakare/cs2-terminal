import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const AlertSchema = z.object({
  alert_type:   z.enum(['price_below','price_above','pct_drop','pct_rise','arb_above','scanner_score','case_roi','holding_pnl']),
  item_id:      z.string().nullable().optional(),
  item_name:    z.string().min(1),
  threshold:    z.number().optional().nullable(),
  target_price: z.number().optional().nullable(),
  target_pct:   z.number().optional().nullable(),
  target_score: z.number().optional().nullable(),
  ref_price:    z.number().optional().nullable(),
  notify_email: z.boolean().default(false),
  notify_in_app: z.boolean().default(true),
  cooldown_min: z.number().int().optional().nullable(),
  note:         z.string().nullable().optional(),
})

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('price_alerts')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ alerts: data })
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = AlertSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const d = parsed.data
  const threshold = d.threshold ?? d.target_price ?? d.target_pct ?? d.target_score ?? 0

  let lastPrice: number | null = null
  if (d.item_id && ['pct_drop','pct_rise'].includes(d.alert_type)) {
    const { data: item } = await supabase.from('items').select('price_usd').eq('id', d.item_id).single()
    lastPrice = item?.price_usd ?? d.ref_price ?? null
  }

  const { data, error } = await supabase
    .from('price_alerts')
    .insert({ user_id: user.id, alert_type: d.alert_type, item_id: d.item_id ?? null, item_name: d.item_name, threshold, notify_email: d.notify_email, notify_in_app: d.notify_in_app, last_price_seen: lastPrice, note: d.note ?? null })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ alert: data }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, ...updates } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const allowed = ['is_active','threshold','notify_email','notify_in_app','note']
  const safe = Object.fromEntries(Object.entries(updates).filter(([k]) => allowed.includes(k)))

  const { data, error } = await supabase.from('price_alerts').update(safe).eq('id', id).eq('user_id', user.id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ alert: data })
}

export async function DELETE(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { error } = await supabase.from('price_alerts').delete().eq('id', id).eq('user_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
