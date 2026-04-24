import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/server'

// GET /api/alerts/notifications
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const unreadOnly = req.nextUrl.searchParams.get('unread') === 'true'
  const limit      = parseInt(req.nextUrl.searchParams.get('limit') ?? '20')

  let query = supabase
    .from('alert_notifications')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (unreadOnly) query = query.eq('is_read', false)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ notifications: data })
}

// PATCH /api/alerts/notifications - mark read
export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, mark_all_read } = await req.json()

  if (mark_all_read) {
    await supabase.from('alert_notifications').update({ is_read: true }).eq('user_id', user.id).eq('is_read', false)
    return NextResponse.json({ success: true })
  }

  if (id) {
    await supabase.from('alert_notifications').update({ is_read: true }).eq('id', id).eq('user_id', user.id)
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'id or mark_all_read required' }, { status: 400 })
}

// POST /api/alerts/notifications - run alert check (called by cron)
export async function POST(req: NextRequest) {
  const cronSecret = req.headers.get('x-cron-secret')
  if (cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase.rpc('check_alerts')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ fired: data })
}
