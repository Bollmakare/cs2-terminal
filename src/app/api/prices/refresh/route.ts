import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/server'
import { fetchAllPrices, calcArbitrage, getApiStatus } from '@/lib/api/skinstrack'
import { fetchAllPricEmpire, aggregatePrices } from '@/lib/api/pricempire'
import { computeScannerScores } from '@/lib/signals/scanner'
import type { SkinstrackPrice } from '@/types/db'

export const maxDuration = 60 // Vercel function timeout

// âââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
// POST /api/prices/refresh
// Called by: Vercel Cron (x-cron-secret) OR authenticated user
// âââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
export async function POST(req: NextRequest) {
  const force = req.nextUrl.searchParams.get('force') === 'true'

  // ââ Auth âââââââââââââââââââââââââââââââââââââââââââââ
  const cronSecret = req.headers.get('x-cron-secret')
  const isCron = cronSecret === process.env.CRON_SECRET && !!cronSecret

  if (!isCron) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // ââ Fetch from Skinstrack âââââââââââââââââââââââââ
    console.log('[refresh] Starting price refresh...')
    let prices: SkinstrackPrice[]

    try {
      prices = await fetchAllPrices()
    } catch (err) {
      const msg = (err as Error).message
      const is429 = msg.includes('rate limited') || msg.includes('quota')
      console.error('[refresh] Skinstrack failed:', msg, 'â using cached data')

      if (is429) {
        return NextResponse.json(
          { error: msg, source: 'skinstrack', retry_after: 3600 },
          { status: 429 }
        )
      }
      // For non-rate-limit errors, continue with empty array (cache already exists)
      prices = []
    }

    const supabase = createServiceClient()
    const today = new Date().toISOString().slice(0, 10)
    let itemsUpdated = 0

    // ââ Fetch PricEmpire in parallel with items processing ââ
    // PricEmpire covers 20+ markets in a single call
    let pricempireData: Awaited<ReturnType<typeof fetchAllPricEmpire>> = {}
    if (process.env.PRICEMPIRE_API_KEY) {
      try {
        pricempireData = await fetchAllPricEmpire()
        console.log(`[refresh] PricEmpire: ${Object.keys(pricempireData).length} items`)
      } catch (err) {
        console.warn('[refresh] PricEmpire failed (non-fatal):', (err as Error).message)
      }
    }

    if (prices.length > 0) {
      // ââ Batch upsert items table ââââââââââââââââââ
      const BATCH_SIZE = 500
      for (let i = 0; i < prices.length; i += BATCH_SIZE) {
        const batch = prices.slice(i, i + BATCH_SIZE)

        const rows = batch.map((p) => {
          // Merge Skinstrack + PricEmpire data
          const pe = pricempireData[p.market_hash_name] ?? null
          const agg = aggregatePrices(pe, p, p.market_hash_name)

          const best = agg.best_price ?? p.best_buy_price ?? p.skinport_price ?? p.steam_price

          return {
            id: slugify(p.market_hash_name),
            market_hash_name: p.market_hash_name,
            ...parseItemName(p.market_hash_name),
            // Best price (cheapest across all sources)
            price_usd:        best,
            // Per-market prices
            price_steam:      agg.steam    ?? p.steam_price,
            price_buff:       agg.buff163  ?? p.buff_price,
            price_skinport:   agg.skinport ?? p.skinport_price,
            price_csfloat:    agg.csfloat  ?? p.csfloat_price,
            price_lis_skins:  p.lis_skins_price,
            price_waxpeer:    agg.waxpeer,
            price_cs_money:   agg.cs_money,
            price_dmarket:    agg.dmarket,
            price_tradeit:    agg.tradeit,
            price_pricempire: agg.pricempire,
            // Buff buy order floor (true market floor price)
            buff_buy_order:   pe?.buff163?.buy_order
              ? Math.round(pe.buff163.buy_order * 100) / 100 : null,
            buff_bid_ask_gap: pe?.buff163?.buy_order && pe?.buff163?.price
              ? Math.round(((pe.buff163.price - pe.buff163.buy_order) / pe.buff163.buy_order) * 10000) / 100
              : null,
            steam_buy_order:  pe?.steam?.buy_order
              ? Math.round(pe.steam.buy_order * 100) / 100 : null,
            // Arbitrage (now across ALL markets, not just Skinstrack's 6)
            arb_spread_pct:   agg.arb_spread_pct,
            arb_buy_market:   agg.arb_buy_market,
            arb_sell_market:  agg.arb_sell_market,
            // Volume
            volume_24h:       p.volume_24h,
            volume_steam_30d: agg.volume_steam_30d,
            volume_buff_24h:  agg.volume_buff_24h,
            // Price trend
            price_7d_avg:     p.price_7d_avg,
            price_30d_avg:    p.price_30d_avg,
            price_90d_avg:    (pe as any)?.avg_30d ?? null,  // best approximation
            price_7d_change_pct: best && p.price_7d_avg
              ? ((best - p.price_7d_avg) / p.price_7d_avg) * 100 : null,
            price_30d_change_pct: best && p.price_30d_avg
              ? ((best - p.price_30d_avg) / p.price_30d_avg) * 100 : null,
            updated_at: new Date().toISOString(),
          }
        }).filter(r => r.market_hash_name)

        const { error } = await supabase
          .from('items')
          .upsert(rows, { onConflict: 'id', ignoreDuplicates: false })

        if (error) console.error('[refresh] items upsert error:', error.message)
        else itemsUpdated += rows.length
      }

      // ââ Snapshot price_history ââââââââââââââââââââ
      const histRows = prices
        .filter(p => p.best_buy_price || p.steam_price)
        .map(p => ({
          item_id:       slugify(p.market_hash_name),
          price_usd:     p.best_buy_price ?? p.steam_price,
          price_steam:   p.steam_price,
          price_buff:    p.buff_price,
          price_skinport: p.skinport_price,
          volume_24h:    p.volume_24h,
          arb_spread_pct: calcArbitrage(p)?.spread_pct ?? null,
          source:        'skinstrack',
          snapped_at:    today,
        }))

      // Upsert in batches
      for (let i = 0; i < histRows.length; i += 500) {
        await supabase
          .from('price_history')
          .upsert(histRows.slice(i, i + 500), { onConflict: 'item_id,snapped_at,source' })
      }

      // ââ Sync holding prices âââââââââââââââââââââââ
      await supabase.rpc('sync_holding_prices')

      // ââ Update scanner cache ââââââââââââââââââââââ
      await updateScannerCache(supabase, prices)

      // ââ Update market index âââââââââââââââââââââââ
      await updateMarketIndex(supabase, prices)
    }

    // ââ Snapshot portfolio NAV ââââââââââââââââââââââââ
    await snapshotPortfolios(supabase)

    return NextResponse.json({
      success: true,
      source: prices.length > 0 ? 'skinstrack' : 'cache',
      items_updated: itemsUpdated,
      refreshed_at: new Date().toISOString(),
      api_status: getApiStatus(),
    })

  } catch (err) {
    const msg = (err as Error).message
    console.error('[refresh] Fatal error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// âââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
// GET /api/prices/refresh â status check
// âââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: latest } = await supabase
    .from('price_history')
    .select('snapped_at, created_at')
    .eq('source', 'skinstrack')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  return NextResponse.json({
    last_refresh: latest?.created_at ?? null,
    last_snapshot: latest?.snapped_at ?? null,
    api_status: getApiStatus(),
  })
}

// âââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
// Helpers
// âââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[â|â¢]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
}

function parseItemName(name: string): {
  weapon_type: string
  skin_name: string
  condition: string | null
  category: string
  is_stattrak: boolean
  is_souvenir: boolean
} {
  const is_stattrak = name.startsWith('StatTrakâ¢')
  const is_souvenir  = name.startsWith('Souvenir')

  const cleanName = name
    .replace(/^StatTrakâ¢\s+/, '')
    .replace(/^Souvenir\s+/, '')

  // Extract condition
  const condMap: Record<string, string> = {
    'Factory New': 'FN', 'Minimal Wear': 'MW',
    'Field-Tested': 'FT', 'Well-Worn': 'WW', 'Battle-Scarred': 'BS',
  }
  let condition: string | null = null
  let baseName = cleanName
  const condMatch = cleanName.match(/\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/)
  if (condMatch) {
    condition = condMap[condMatch[1]]
    baseName = cleanName.slice(0, condMatch.index).trim()
  }

  // Split "Weapon | Skin" or just "Weapon"
  const parts = baseName.split(' | ')
  const weapon_type = parts[0].trim()
  const skin_name   = parts[1]?.trim() ?? weapon_type

  // Determine category
  const w = weapon_type.toLowerCase()
  let category = 'other'
  if (['karambit','butterfly knife','m9 bayonet','bayonet','gut knife','flip knife',
       'falchion knife','shadow daggers','bowie knife','stiletto knife','ursus knife',
       'navaja knife','talon knife','classic knife','skeleton knife','paracord knife',
       'survival knife','nomad knife'].some(k => w.includes(k)) || name.includes('â')) category = 'knife'
  else if (['ak-47','m4a4','m4a1-s','aug','sg 553','galil ar','famas','awp','ssg 08',
            'scar-20','g3sg1'].some(k => w.includes(k))) {
    category = ['awp','ssg 08','scar-20','g3sg1'].some(k => w.includes(k)) ? 'sniper' : 'rifle'
  }
  else if (['glock','usp-s','p250','desert eagle','r8','cz75','five-sevenfive-seven',
            'tec-9','p2000','mp5','mp7','mp9','mac-10','pp-bizon','ump-45'].some(k => w.includes(k))) category = 'pistol'
  else if (w.includes('glove') || w.includes('hand wraps')) category = 'gloves'
  else if (w.includes('case') && !w.includes('case hardened')) category = 'case'
  else if (w.includes('sticker')) category = 'sticker'

  return { weapon_type, skin_name, condition, category, is_stattrak, is_souvenir }
}

async function updateScannerCache(supabase: ReturnType<typeof createServiceClient>, prices: SkinstrackPrice[]) {
  const scoredItems = prices
    .filter(p => p.best_buy_price && p.best_buy_price > 0.5) // skip sub-$0.50 items
    .map(p => {
      const score = computeScannerScores(p)
      return {
        item_id:           slugify(p.market_hash_name),
        ...score,
        price_usd:         p.best_buy_price ?? p.skinport_price ?? null,
        arb_spread_pct:    calcArbitrage(p)?.spread_pct ?? null,
        volume_24h:        p.volume_24h ?? null,
        price_vs_7d_pct:   p.price_7d_avg && p.best_buy_price
          ? ((p.best_buy_price - p.price_7d_avg) / p.price_7d_avg) * 100 : null,
        price_vs_30d_pct:  p.price_30d_avg && p.best_buy_price
          ? ((p.best_buy_price - p.price_30d_avg) / p.price_30d_avg) * 100 : null,
        scored_at:         new Date().toISOString(),
      }
    })

  // Batch upsert scanner cache
  for (let i = 0; i < scoredItems.length; i += 500) {
    const { error } = await supabase
      .from('scanner_cache')
      .upsert(scoredItems.slice(i, i + 500), { onConflict: 'item_id' })
    if (error) console.error('[scanner] cache upsert error:', error.message)
  }
  console.log(`[scanner] â ${scoredItems.length} items scored`)
}

async function snapshotPortfolios(supabase: ReturnType<typeof createServiceClient>) {
  const today = new Date().toISOString().slice(0, 10)

  const { data: holdings } = await supabase
    .from('holdings')
    .select('portfolio_id, user_id, quantity, cost_basis, last_price')

  if (!holdings?.length) return

  const pfMap = new Map<string, { user_id: string; value: number; cost: number; count: number }>()
  for (const h of holdings) {
    const cur = pfMap.get(h.portfolio_id) ?? { user_id: h.user_id, value: 0, cost: 0, count: 0 }
    cur.value += (h.last_price ?? h.cost_basis) * h.quantity
    cur.cost  += h.cost_basis * h.quantity
    cur.count += 1
    pfMap.set(h.portfolio_id, cur)
  }

  const snapshots = Array.from(pfMap.entries()).map(([portfolio_id, s]) => ({
    portfolio_id,
    user_id:        s.user_id,
    total_value:    Math.round(s.value * 100) / 100,
    cost_basis:     Math.round(s.cost * 100) / 100,
    unrealized_pnl: Math.round((s.value - s.cost) * 100) / 100,
    position_count: s.count,
    snapped_at:     today,
  }))

  await supabase
    .from('portfolio_snapshots')
    .upsert(snapshots, { onConflict: 'portfolio_id,snapped_at' })

  console.log(`[snapshot] â ${snapshots.length} portfolios snapshotted`)
}

async function updateMarketIndex(supabase: ReturnType<typeof createServiceClient>, prices: SkinstrackPrice[]) {
  if (!prices.length) return
  const today = new Date().toISOString().slice(0, 10)

  // Volume-weighted average price across all items with price > 0
  const validPrices = prices.filter(p => p.best_buy_price && p.best_buy_price > 0)
  if (!validPrices.length) return

  const totalValue  = validPrices.reduce((s, p) => s + (p.best_buy_price ?? 0), 0)
  const avgPrice    = totalValue / validPrices.length
  const sorted      = [...validPrices].sort((a, b) => (a.best_buy_price ?? 0) - (b.best_buy_price ?? 0))
  const medianPrice = sorted[Math.floor(sorted.length / 2)]?.best_buy_price ?? avgPrice
  const totalVol    = validPrices.reduce((s, p) => s + (p.volume_24h ?? 0), 0)

  // Category sub-indices: avg price of items in each category
  const catAvg = (cat: string) => {
    const items = validPrices.filter(p => {
      const { category } = parseItemName(p.market_hash_name)
      return category === cat
    })
    if (!items.length) return null
    return Math.round((items.reduce((s, p) => s + (p.best_buy_price ?? 0), 0) / items.length) * 100) / 100
  }

  // Normalize to 1000 base using yesterday's index as reference
  const { data: yesterday } = await supabase
    .from('market_index')
    .select('index_value, avg_price_usd')
    .lt('snapped_at', today)
    .order('snapped_at', { ascending: false })
    .limit(1)
    .single()

  let indexValue = 1000
  if (yesterday?.avg_price_usd && yesterday.avg_price_usd > 0) {
    // Carry forward index scaled by % change in avg price
    const changePct = (avgPrice - yesterday.avg_price_usd) / yesterday.avg_price_usd
    indexValue = Math.round(yesterday.index_value * (1 + changePct) * 10000) / 10000
    // Clamp to reasonable range (CS2 market won't go to 0 or infinity)
    indexValue = Math.max(100, Math.min(10000, indexValue))
  }

  const change1d = yesterday?.index_value
    ? Math.round(((indexValue - yesterday.index_value) / yesterday.index_value) * 10000) / 100
    : 0

  const { error } = await supabase
    .from('market_index')
    .upsert({
      snapped_at:      today,
      index_value:     indexValue,
      total_items:     validPrices.length,
      avg_price_usd:   Math.round(avgPrice * 100) / 100,
      median_price_usd: Math.round(medianPrice * 100) / 100,
      total_volume_24h: totalVol,
      change_1d_pct:   change1d,
      idx_knife:       catAvg('knife'),
      idx_rifle:       catAvg('rifle'),
      idx_pistol:      catAvg('pistol'),
      idx_sniper:      catAvg('sniper'),
      idx_gloves:      catAvg('gloves'),
      idx_case:        catAvg('case'),
    }, { onConflict: 'snapped_at' })

  if (error) console.error('[market-index] upsert error:', error.message)
  else console.log(`[market-index] â index=${indexValue.toFixed(2)} 1d=${change1d}%`)
}
