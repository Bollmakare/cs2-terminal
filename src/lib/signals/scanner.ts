/**
 * Scanner Scoring Engine v2
 * Now uses all data sources: Skinstrack + PricEmpire + CSFloat float/pattern data
 *
 * Scoring factors:
 * 1. Price vs 7d/30d/90d average  (weight: 28%)
 * 2. Cross-market arbitrage        (weight: 25%)  now across 10+ markets
 * 3. Liquidity/volume              (weight: 18%)
 * 4. Momentum/trend                (weight: 14%)
 * 5. Float/pattern premium         (weight: 10%)  now uses real CSFloat data
 * 6. Supply/demand (order book)    (weight:  5%)  Steam buy vs sell pressure
 */

import type { SkinstrackPrice, ScannerSignal, ScannerVerdict } from '@/types/db'

export type ItemWithExtended = SkinstrackPrice & {
  // Extended from PricEmpire
  waxpeer_price?:   number | null
  cs_money_price?:  number | null
  dmarket_price?:   number | null
  tradeit_price?:   number | null
  pricempire_fair?: number | null
  // Float data from CSFloat
  float_min?:       number | null
  float_max?:       number | null
  float_count?:     number | null
  has_patterns?:    boolean
  top_pattern_premium_pct?: number | null
  // Steam order book
  steam_buy_orders?:  number | null
  steam_sell_orders?: number | null
  // Extended price history
  price_90d_avg?: number | null
}

export interface ScannerScore {
  score_total:        number
  score_price_vs_avg: number
  score_arb:          number
  score_volume:       number
  score_trend:        number
  score_float:        number
  signals: ScannerSignal[]
  verdict: ScannerVerdict
}

// 
export function computeScannerScores(item: ItemWithExtended): ScannerScore {
  const signals: ScannerSignal[] = []

  const price = item.best_buy_price ?? item.skinport_price ?? item.steam_price ?? 0
  const avg7d  = item.price_7d_avg  ?? 0
  const avg30d = item.price_30d_avg ?? 0
  const avg90d = (item as any).price_90d_avg ?? 0

  //  Factor 1: Price vs historical averages (28%) 
  let score_price_vs_avg = 50

  if (price > 0 && avg7d > 0) {
    const vs7d  = ((price - avg7d)  / avg7d)  * 100
    const vs30d = avg30d > 0 ? ((price - avg30d) / avg30d) * 100 : vs7d
    const vs90d = avg90d > 0 ? ((price - avg90d) / avg90d) * 100 : vs30d

    // Deep discount gets highest score  mean reversion opportunity
    if (vs7d <= -25 && vs30d <= -15) {
      score_price_vs_avg = 97
      signals.push({ type: 'price', label: 'Extreme discount', detail: `${vs7d.toFixed(1)}% below 7d, ${vs30d.toFixed(1)}% below 30d avg`, score: 47, direction: 'bullish' })
    } else if (vs7d <= -15) {
      score_price_vs_avg = 85
      signals.push({ type: 'price', label: 'Deep discount', detail: `${vs7d.toFixed(1)}% below 7d avg`, score: 35, direction: 'bullish' })
    } else if (vs7d <= -7) {
      score_price_vs_avg = 70
      signals.push({ type: 'price', label: 'Below 7d avg', detail: `${vs7d.toFixed(1)}% discount`, score: 20, direction: 'bullish' })
    } else if (vs7d <= -3) {
      score_price_vs_avg = 60
      signals.push({ type: 'price', label: 'Slight discount', detail: `${vs7d.toFixed(1)}% below 7d avg`, score: 10, direction: 'bullish' })
    } else if (vs7d >= 25) {
      score_price_vs_avg = 10
      signals.push({ type: 'price', label: 'Overextended', detail: `+${vs7d.toFixed(1)}% above 7d avg`, score: -40, direction: 'bearish' })
    } else if (vs7d >= 12) {
      score_price_vs_avg = 25
      signals.push({ type: 'price', label: 'Elevated price', detail: `+${vs7d.toFixed(1)}% above 7d avg`, score: -25, direction: 'bearish' })
    } else if (vs7d >= 5) {
      score_price_vs_avg = 40
      signals.push({ type: 'price', label: 'Slightly elevated', detail: `+${vs7d.toFixed(1)}% above 7d avg`, score: -10, direction: 'bearish' })
    } else {
      signals.push({ type: 'price', label: 'At fair value', detail: `${vs7d >= 0 ? '+' : ''}${vs7d.toFixed(1)}% vs 7d avg`, score: 0, direction: 'neutral' })
    }

    // 30d/90d context boosts confidence
    if (vs30d <= -15 && score_price_vs_avg >= 60) {
      score_price_vs_avg = Math.min(100, score_price_vs_avg + 8)
      signals.push({ type: 'price', label: '30d dip confirmed', detail: `${vs30d.toFixed(1)}% below 30d avg`, score: 8, direction: 'bullish' })
    }
    if (avg90d > 0 && vs90d <= -20 && score_price_vs_avg >= 70) {
      score_price_vs_avg = Math.min(100, score_price_vs_avg + 5)
      signals.push({ type: 'price', label: '90d macro dip', detail: `${vs90d.toFixed(1)}% below 90d avg  potential value`, score: 5, direction: 'bullish' })
    }
    // Compare vs PricEmpire fair value if available
    const fairValue = (item as any).pricempire_fair ?? 0
    if (fairValue > 0 && price < fairValue * 0.90) {
      const discount = ((fairValue - price) / fairValue) * 100
      score_price_vs_avg = Math.min(100, score_price_vs_avg + 5)
      signals.push({ type: 'price', label: 'Below fair value', detail: `${discount.toFixed(1)}% under PricEmpire estimate ($${fairValue.toFixed(2)})`, score: 5, direction: 'bullish' })
    }
  }

  //  Factor 2: Cross-market arbitrage (25%) 
  let score_arb = 40

  const markets: [string, number][] = [
    ['buff163',   item.buff_price         ?? 0],
    ['skinport',  item.skinport_price     ?? 0],
    ['steam',     item.steam_price        ?? 0],
    ['csfloat',   item.csfloat_price      ?? 0],
    ['lis_skins', item.lis_skins_price    ?? 0],
    ['cs_money',  item.cs_money_price     ?? 0],
    ['waxpeer',   (item as any).waxpeer_price  ?? 0],
    ['dmarket',   (item as any).dmarket_price  ?? 0],
    ['tradeit',   (item as any).tradeit_price  ?? 0],
  ].filter(([, p]) => (p as number) > 0.5) as [string, number][]

  if (markets.length >= 2) {
    markets.sort((a, b) => a[1] - b[1])
    const [buyMkt, buyPx] = markets[0]
    const [sellMkt, sellPx] = markets[markets.length - 1]
    const spread = ((sellPx - buyPx) / buyPx) * 100
    // Net after typical fees: Buff buyer pays ~2.5%, Skinport seller pays 12%
    const netSpread = spread - 15

    if (netSpread >= 25) {
      score_arb = 98
      signals.push({ type: 'arb', label: 'Exceptional arb', detail: `Buy ${buyMkt} $${buyPx.toFixed(2)}  sell ${sellMkt} $${sellPx.toFixed(2)} (net ~${netSpread.toFixed(0)}%)`, score: 55, direction: 'bullish' })
    } else if (netSpread >= 15) {
      score_arb = 88
      signals.push({ type: 'arb', label: 'Strong arb', detail: `${spread.toFixed(1)}% spread across ${markets.length} markets`, score: 40, direction: 'bullish' })
    } else if (netSpread >= 7) {
      score_arb = 72
      signals.push({ type: 'arb', label: 'Arb opportunity', detail: `${buyMkt}  ${sellMkt}: +${spread.toFixed(1)}% (net ~${netSpread.toFixed(0)}%)`, score: 25, direction: 'bullish' })
    } else if (netSpread >= 2) {
      score_arb = 55
      signals.push({ type: 'arb', label: 'Small spread', detail: `${spread.toFixed(1)}% across ${markets.length} markets`, score: 8, direction: 'bullish' })
    } else {
      signals.push({ type: 'arb', label: 'Prices aligned', detail: `${markets.length} markets within ${Math.max(0, spread).toFixed(1)}%`, score: 0, direction: 'neutral' })
    }
  }

  //  Factor 3: Liquidity / Volume (18%) 
  let score_volume = 50

  const vol24h  = item.volume_24h   ?? 0
  const vol30d  = (item as any).volume_steam_30d ?? 0
  const volBuff = (item as any).volume_buff_24h  ?? 0
  const combinedVol = vol24h + Math.round(volBuff * 0.5) // Buff is high frequency

  // Steam sell orders: high sell orders relative to buy = supply glut (bearish)
  const buyOrders  = (item as any).steam_buy_orders  ?? 0
  const sellOrders = (item as any).steam_sell_orders ?? 0

  if (combinedVol >= 200) {
    score_volume = 95
    signals.push({ type: 'volume', label: 'Very high liquidity', detail: `${combinedVol} combined trades/24h`, score: 20, direction: 'bullish' })
  } else if (combinedVol >= 50) {
    score_volume = 80
    signals.push({ type: 'volume', label: 'High liquidity', detail: `${combinedVol} trades/24h`, score: 12, direction: 'bullish' })
  } else if (combinedVol >= 15) {
    score_volume = 65
    signals.push({ type: 'volume', label: 'Good liquidity', detail: `${combinedVol} trades/24h`, score: 5, direction: 'neutral' })
  } else if (combinedVol >= 5) {
    score_volume = 50
    signals.push({ type: 'volume', label: 'Moderate liquidity', detail: `${combinedVol} trades/24h`, score: 0, direction: 'neutral' })
  } else if (combinedVol > 0) {
    score_volume = 25
    signals.push({ type: 'volume', label: 'Low liquidity', detail: `${combinedVol} trades/24h  hard to exit`, score: -15, direction: 'bearish' })
  } else {
    score_volume = 8
    signals.push({ type: 'volume', label: 'Illiquid', detail: 'No volume data  use extreme caution', score: -25, direction: 'bearish' })
  }

  // Steam order book pressure signal
  if (buyOrders > 0 && sellOrders > 0) {
    const orderRatio = buyOrders / (buyOrders + sellOrders)
    if (orderRatio > 0.6) {
      score_volume = Math.min(100, score_volume + 8)
      signals.push({ type: 'volume', label: 'Buy-side pressure', detail: `${buyOrders} buy vs ${sellOrders} sell orders`, score: 8, direction: 'bullish' })
    } else if (orderRatio < 0.35) {
      score_volume = Math.max(0, score_volume - 8)
      signals.push({ type: 'volume', label: 'Sell-side pressure', detail: `${sellOrders} sell vs ${buyOrders} buy orders`, score: -8, direction: 'bearish' })
    }
  }

  //  Factor 4: Momentum / Trend (14%) 
  let score_trend = 50

  if (avg7d > 0 && avg30d > 0) {
    const shortTrend = ((price - avg7d)  / avg7d)  * 100
    const longTrend  = ((avg7d - avg30d) / avg30d) * 100

    // 90d macro context
    const macroTrend = avg90d > 0 ? ((avg30d - avg90d) / avg90d) * 100 : 0

    if (longTrend >= 10 && shortTrend <= 0) {
      score_trend = 82
      signals.push({ type: 'trend', label: 'Uptrend pullback', detail: `7d momentum +${longTrend.toFixed(1)}%, currently dipping  entry signal`, score: 22, direction: 'bullish' })
    } else if (longTrend >= 5 && macroTrend >= 5) {
      score_trend = 70
      signals.push({ type: 'trend', label: 'Strong uptrend', detail: `+${longTrend.toFixed(1)}% 7d, +${macroTrend.toFixed(1)}% 90d momentum`, score: 15, direction: 'bullish' })
    } else if (longTrend >= 5) {
      score_trend = 62
      signals.push({ type: 'trend', label: 'Rising trend', detail: `+${longTrend.toFixed(1)}% 7d momentum`, score: 8, direction: 'bullish' })
    } else if (longTrend <= -10 && shortTrend >= 0) {
      score_trend = 22
      signals.push({ type: 'trend', label: 'Downtrend bounce', detail: `${longTrend.toFixed(1)}% 7d trend  dead cat risk`, score: -22, direction: 'bearish' })
    } else if (longTrend <= -5) {
      score_trend = 35
      signals.push({ type: 'trend', label: 'Falling trend', detail: `${longTrend.toFixed(1)}% 7d momentum`, score: -12, direction: 'bearish' })
    } else {
      signals.push({ type: 'trend', label: 'Sideways', detail: 'No clear price trend', score: 0, direction: 'neutral' })
    }
  } else {
    signals.push({ type: 'trend', label: 'No history', detail: 'Insufficient price data', score: 0, direction: 'neutral' })
  }

  //  Factor 5: Float / Pattern premium (10%) 
  // Now uses REAL CSFloat data instead of placeholder
  let score_float = 50

  const floatMin   = (item as any).float_min   ?? null
  const floatMax   = (item as any).float_max   ?? null
  const floatCount = (item as any).float_count ?? null
  const hasPatterns = (item as any).has_patterns ?? false
  const patternPremium = (item as any).top_pattern_premium_pct ?? 0

  if (floatMin !== null && floatMax !== null) {
    const floatRange = floatMax - floatMin

    // Very low float minimum = extremely rare items exist (e.g. 0.001 FN)
    if (floatMin < 0.01 && price > 50) {
      score_float = 80
      signals.push({ type: 'float', label: 'Ultra-low float exists', detail: `Min float: ${floatMin.toFixed(4)}  premium potential`, score: 20, direction: 'bullish' })
    } else if (floatMin < 0.05) {
      score_float = 65
      signals.push({ type: 'float', label: 'Low float available', detail: `Min: ${floatMin.toFixed(4)}`, score: 10, direction: 'bullish' })
    }

    // Narrow float range = scarcer good floats
    if (floatRange < 0.1 && floatMin < 0.1) {
      score_float = Math.min(100, score_float + 8)
      signals.push({ type: 'float', label: 'Narrow float range', detail: `${floatMin.toFixed(3)}${floatMax.toFixed(3)}  low supply`, score: 8, direction: 'bullish' })
    }

    // Low total float count = genuinely rare
    if (floatCount !== null && floatCount < 500) {
      score_float = Math.min(100, score_float + 12)
      signals.push({ type: 'float', label: 'Rare  few indexed', detail: `Only ${floatCount} items on CSFloat`, score: 12, direction: 'bullish' })
    }
  }

  // Pattern premiums  high pattern premium suggests market values this skin highly
  if (hasPatterns && patternPremium > 0) {
    if (patternPremium >= 500) {
      score_float = Math.min(100, score_float + 20)
      signals.push({ type: 'float', label: 'Legendary pattern', detail: `Top pattern commands +${patternPremium.toFixed(0)}% premium`, score: 20, direction: 'bullish' })
    } else if (patternPremium >= 50) {
      score_float = Math.min(100, score_float + 10)
      signals.push({ type: 'float', label: 'Valued pattern', detail: `Top pattern: +${patternPremium.toFixed(0)}% premium`, score: 10, direction: 'bullish' })
    } else if (patternPremium >= 10) {
      score_float = Math.min(100, score_float + 5)
      signals.push({ type: 'float', label: 'Pattern upside', detail: `Good patterns up to +${patternPremium.toFixed(0)}%`, score: 5, direction: 'bullish' })
    }
  }

  //  Weighted total 
  const score_total = Math.round(
    score_price_vs_avg * 0.28 +
    score_arb          * 0.25 +
    score_volume       * 0.18 +
    score_trend        * 0.14 +
    score_float        * 0.10 +
    50                 * 0.05  // supply/demand absorbed into volume factor
  )

  //  Verdict 
  let verdict: ScannerVerdict
  if (score_total >= 80)      verdict = 'Strong Buy'
  else if (score_total >= 65) verdict = 'Buy'
  else if (score_total >= 50) verdict = 'Watch'
  else if (score_total >= 35) verdict = 'Fair'
  else                        verdict = 'Avoid'

  return {
    score_total,
    score_price_vs_avg,
    score_arb,
    score_volume,
    score_trend,
    score_float,
    signals: signals.sort((a, b) => Math.abs(b.score) - Math.abs(a.score)),
    verdict,
  }
}
