import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const HoldingSchema = z.object({
  portfolio_id:   z.string().uuid(),
  item_id:        z.string().optional().nullable(),
  item_name:      z.string().min(1),
  item_condition: z.enum(['FN','MW','FT','WW','BS']).optional().nullable(),
  item_category:  z.string().optional().nullable(),
  is_stattrak:    z.boolean().default(false),
  quantity:       z.number().int().positive().default(1),
  cost_basis:     z.number().min(0).default(0),
  acquired_at:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  float_value:    z.number().min(0).max(1).optional().nullable(),
  pattern_id:     z.number().int().optional().nullable(),
  storage_unit:   z.string().optional().nullable(),
  group_label:    z.string().optional().nullable(),
  note:           z.string().max(500).optional().nullable(),
  stickers:       z.array(z.any()).default([]),
  steam_asset_id: z.string().optional().nullable(),
})

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const pid = req.nextUrl.searchParams.get('portfolio_id')
  if (!pid) return NextResponse.json({ error: 'portfolio_id required' }, { status: 400 })

  const { data, error } = await supabase.from('holdings').select('*').eq('portfolio_id', pid).eq('user_id', user.id).order('last_price', { ascending: false, nullsFirst: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ holdings: data })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = HoldingSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { data: pf } = await supabase.from('portfolios').select('id').eq('id', parsed.data.portfolio_id).eq('user_id', user.id).single()
  if (!pf) return NextResponse.json({ error: 'Portfolio not found' }, { status: 404 })

  const { data, error } = await supabase.from('holdings').insert({ ...parsed.data, user_id: user.id, acquired_at: parsed.data.acquired_at ?? new Date().toISOString().slice(0, 10) }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ holding: data }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, ...updates } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const allowed = ['quantity','cost_basis','acquired_at','float_value','pattern_id','storage_unit','group_label','note','stickers']
  const safe = Object.fromEntries(Object.entries(updates).filter(([k]) => allowed.includes(k)))

  const { data, error } = await supabase.from('holdings').update(safe).eq('id', id).eq('user_id', user.id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ holding: data })
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { error } = await supabase.from('holdings').delete().eq('id', id).eq('user_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
