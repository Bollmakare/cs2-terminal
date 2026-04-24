import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getListings } from '@/lib/api/csfloat'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const name = req.nextUrl.searchParams.get('name')
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })

  const floatMin = req.nextUrl.searchParams.get('float_min') ? parseFloat(req.nextUrl.searchParams.get('float_min')) : undefined
  const floatMax = req.nextUrl.searchParams.get('float_max') ? parseFloat(req.nextUrl.searchParams.get('float_max')) : undefined
  const sortBy = req.nextUrl.searchParams.get('sort') ?? 'lowest_price'
  const limit = parseInt(req.nextUrl.searchParams.get('limit') ?? '20')

  try {
    const result = await getListings({ market_hash_name: name, float_min: floatMin, float_max: floatMax, sort_by: sortBy, limit })
    return NextResponse.json(result)
  } catch (err) {
    const msg = err.message
    return NextResponse.json({ error: msg }, { status: msg.includes('429') ? 429 : 500 })
  }
}
