// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const BASE_URL = 'https://api.pokemontcg.io/v2/cards'
const DELAY_MS = 300

function supabaseAdmin() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  )
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function buildQuery(name: string, setName: string, number: string) {
  const parts: string[] = []
  if (name) parts.push(`name:"${name}"`)
  if (number) parts.push(`number:"${number}"`)
  if (setName) parts.push(`set.name:"${setName}"`)
  return parts.join(' ')
}

async function fetchCardPrice(name: string, setName: string, number: string) {
  try {
    const q = buildQuery(name, setName, number)
    const url = `${BASE_URL}?q=${encodeURIComponent(q)}&pageSize=5`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'VAULT-Cron/1.0' },
    })
    if (!res.ok) return null
    const json = await res.json()
    const card = json.data?.[0]
    if (!card) return null

    const cm = card.cardmarket?.prices?.trendPrice ?? null
    const tcg = card.tcgplayer?.prices?.normal?.market
      ?? card.tcgplayer?.prices?.holofoil?.market
      ?? card.tcgplayer?.prices?.reverseHolofoil?.market
      ?? null

    return { cardmarket_eur: cm, tcgplayer_usd: tcg }
  } catch {
    return null
  }
}

async function run() {
  const sb = supabaseAdmin()

  // ── Fetch all Pokémon card items (not sealed) ─────────────────────────────
  const { data: items, error: itemsErr } = await sb
    .from('items')
    .select('id, name, user_id, cost, qty, metadata')
    .eq('vertical', 'pokemon')
    .or("metadata->>'item_type'.is.null,metadata->>'item_type'.eq.card")

  if (itemsErr) return { ok: false, reason: itemsErr.message }
  if (!items?.length) return { ok: true, updated: 0, reason: 'no_items' }

  // ── Process each card with delay ──────────────────────────────────────────
  let updated = 0
  let skipped = 0
  const userTotals: Record<string, number> = {}

  for (const item of items) {
    const meta = item.metadata ?? {}
    const prices = await fetchCardPrice(item.name, meta.set_name ?? '', meta.card_number ?? '')
    await sleep(DELAY_MS)

    if (!prices?.cardmarket_eur && !prices?.tcgplayer_usd) { skipped++; continue }
    const price = prices.cardmarket_eur ?? null
    if (price == null) { skipped++; continue }

    await sb.from('items').update({
      value: price,
      last_price_fetched_at: new Date().toISOString(),
      metadata: {
        ...meta,
        price_sources: {
          cardmarket_eur: prices.cardmarket_eur,
          tcgplayer_usd: prices.tcgplayer_usd,
        },
      },
    }).eq('id', item.id)

    const qty = item.qty ?? 1
    userTotals[item.user_id] = (userTotals[item.user_id] ?? 0) + price * qty
    updated++
  }

  // ── Write one price_history snapshot per user ─────────────────────────────
  const historyRows = Object.entries(userTotals).map(([userId, total]) => ({
    item_id: null,
    price: total,
    source: 'cron-pokemon',
    user_id: userId,
    recorded_at: new Date().toISOString(),
  }))
  if (historyRows.length) {
    await sb.from('price_history').insert(historyRows)
  }

  return { ok: true, updated, skipped, users: Object.keys(userTotals).length }
}

Deno.serve(async (_req: Request): Promise<Response> => {
  try {
    const result = await run()
    return new Response(JSON.stringify(result), {
      status: result.ok ? 200 : 500,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
