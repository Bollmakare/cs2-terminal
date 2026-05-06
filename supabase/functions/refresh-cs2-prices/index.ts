// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const PRICEMPIRE_API_KEY = '83c3a015-8f1c-4e45-b2a8-922d60e31678'
const PRICEMPIRE_URL = `https://api.pricempire.com/v3/items/prices?api_key=${PRICEMPIRE_API_KEY}&currency=EUR&sources=skinport,buff163,csfloat,steam`
const SOURCES = ['skinport', 'buff163', 'csfloat', 'steam']
const DAY_LIMIT = 95
const MONTH_LIMIT = 950

function supabaseAdmin() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  )
}

async function getUsageCounts(sb: ReturnType<typeof createClient>) {
  const today = new Date().toISOString().split('T')[0]
  const monthStart = today.substring(0, 7) + '-01'

  const { data: todayRow } = await sb
    .from('api_usage')
    .select('id, calls_today, calls_month')
    .eq('service', 'pricempire')
    .eq('date', today)
    .is('user_id', null)
    .maybeSingle()

  // Sum all days this month for accurate monthly total
  const { data: monthRows } = await sb
    .from('api_usage')
    .select('calls_today')
    .eq('service', 'pricempire')
    .is('user_id', null)
    .gte('date', monthStart)
    .lte('date', today)

  const callsMonth = monthRows?.reduce((s, r) => s + (r.calls_today ?? 0), 0) ?? 0
  return { todayRow, callsToday: todayRow?.calls_today ?? 0, callsMonth, today }
}

async function bumpUsage(sb: ReturnType<typeof createClient>, todayRow: any, callsToday: number, callsMonth: number, today: string) {
  const now = new Date().toISOString()
  if (todayRow) {
    await sb
      .from('api_usage')
      .update({ calls_today: callsToday + 1, calls_month: callsMonth + 1, last_refresh: now })
      .eq('id', todayRow.id)
  } else {
    await sb
      .from('api_usage')
      .insert({ service: 'pricempire', date: today, calls_today: 1, calls_month: callsMonth + 1, last_refresh: now, user_id: null })
  }
}

async function run() {
  const sb = supabaseAdmin()

  // ── Check limits ──────────────────────────────────────────────────────────
  const { todayRow, callsToday, callsMonth, today } = await getUsageCounts(sb)
  if (callsToday >= DAY_LIMIT) {
    return { ok: false, reason: 'daily_limit', callsToday, callsMonth }
  }
  if (callsMonth >= MONTH_LIMIT) {
    return { ok: false, reason: 'monthly_limit', callsToday, callsMonth }
  }

  // ── Fetch all CS2 items across all users ──────────────────────────────────
  const { data: items, error: itemsErr } = await sb
    .from('items')
    .select('id, name, user_id, cost, qty, metadata')
    .eq('vertical', 'cs2')

  if (itemsErr) return { ok: false, reason: itemsErr.message }
  if (!items?.length) return { ok: true, updated: 0, reason: 'no_items' }

  // ── Fetch prices from PriceEmpire (one bulk call) ─────────────────────────
  let priceMap: Record<string, any> = {}
  try {
    const res = await fetch(PRICEMPIRE_URL)
    if (!res.ok) throw new Error(`PriceEmpire HTTP ${res.status}`)
    priceMap = await res.json()
  } catch (e: any) {
    return { ok: false, reason: 'pricempire_error', error: e.message }
  }

  // ── Bump usage counter ────────────────────────────────────────────────────
  await bumpUsage(sb, todayRow, callsToday, callsMonth, today)

  // ── Process each item ─────────────────────────────────────────────────────
  let updated = 0
  const itemUpdates: Promise<any>[] = []
  const userTotals: Record<string, number> = {}

  for (const item of items) {
    const raw = priceMap[item.name]
    if (!raw) continue

    const sources: Record<string, number> = {}
    const vals: number[] = []
    for (const src of SOURCES) {
      const v = raw[src]?.price
      if (v != null && v > 0) { sources[src] = v / 100; vals.push(v / 100) }
    }
    if (!vals.length) continue

    vals.sort((a, b) => a - b)
    const median = vals.length % 2 === 0
      ? (vals[vals.length / 2 - 1] + vals[vals.length / 2]) / 2
      : vals[Math.floor(vals.length / 2)]

    itemUpdates.push(
      sb.from('items').update({
        value: median,
        last_price_fetched_at: new Date().toISOString(),
        metadata: { ...(item.metadata ?? {}), price_sources: sources },
      }).eq('id', item.id)
    )

    const qty = item.qty ?? 1
    userTotals[item.user_id] = (userTotals[item.user_id] ?? 0) + median * qty
    updated++
  }

  await Promise.all(itemUpdates)

  // ── Write one price_history snapshot per user ─────────────────────────────
  const historyRows = Object.entries(userTotals).map(([userId, total]) => ({
    item_id: null,
    price: total,
    source: 'cron-cs2',
    user_id: userId,
    recorded_at: new Date().toISOString(),
  }))
  if (historyRows.length) {
    await sb.from('price_history').insert(historyRows)
  }

  return {
    ok: true,
    updated,
    users: Object.keys(userTotals).length,
    callsToday: callsToday + 1,
    callsMonth: callsMonth + 1,
  }
}

Deno.serve(async (_req: Request): Promise<Response> => {
  try {
    const result = await run()
    const status = result.ok ? 200 : (result.reason?.includes('limit') ? 429 : 500)
    return new Response(JSON.stringify(result), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
