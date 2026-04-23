/**
 * Sell Signal Engine
 * Mirror of the scanner buy engine  but for exit decisions.
 *
 * A sell signal fires when ONE OR MORE of:
 * 1. Price overextended vs 7d/30d avg (mean reversion risk)
 * 2. Trend reversing after a strong run (momentum fading)
 * 3. Significant unrealized profit at risk (lock in gains)
 * 4. Stop-loss: price down significantly from cost with downtrend
 * 5. Arb opportunity on SELL side (better price exists right now)
 * 6. Upcoming market event historically bearish for this category
 * 7. Liquidity deteriorating (harder to exit)
 */

import type { HoldingWithValue } from '@/types/db'

export type SellUrgency = 'high' | 'medium' | 'low' | 'none'

export interface SellReason {
  type:      'profit' | 'overextended' | 'stop_loss' | 'trend' | 'arb' | 'event' | 'liquidity'
  label:     string
  detail:    string
  weight:    number   // contribution to sell_score (0-100)
  direction: 'sell' | 'hold'
}

export interface SellSignal {
  sell_score:     number         // 0-100: how strongly to consider selling
  urgency:        SellUrgency
  reasons:        SellReason[]
  recommendation: string         // human-readable summary
  current_price:  number
  cost_basis:     number
  unrealized_pct: number
  days_held:      number
}

// Item data available at signal compute time
export interface ItemContext {
  price_usd:          number | null
  price_buff:         number | null
  price_steam:        number | null
  price_skinport:     number | null
  price_7d_avg:       number | null
  price_30d_avg:      number | null
  price_7d_change_pct: number | null
  price_30d_change_pct: number | null
  volume_24h:         number | null
  arb_spread_pct:     number | null
  arb_sell_market:    string | null
  buff_buy_order:     number | null  // true Buff floor price
  category:           string
  score_total?:       number | null  // current scanner score
}

// Upcoming events from market_events table
export interface UpcomingEvent {
  event_type:          string
  title:               string
  days_until:          number
  expected_impact:     string | null
  affected_categories: string[]
  impact_magnitude:    number
  is_confirmed:        boolean
}

export function computeSellSignal(
  holding: HoldingWithValue,
  item: ItemContext,
  upcomingEvents: UpcomingEvent[] = []
): SellSignal {
  const reasons: SellReason[] = []
  let sell_score = 0

  const price       = item.price_usd ?? holding.current_price
  const costBasis   = holding.cost_basis
  const unrealizedPct = costBasis > 0 ? ((price - costBasis) / costBasis) * 100 : 0
  const daysHeld    = holding.days_held
  const avg7d       = item.price_7d_avg ?? 0
  const avg30d      = item.price_30d_avg ?? 0

  //  1. Profit target / take profits 
  // The more profit on the table, the stronger the argument to lock some in
  if (unrealizedPct >= 100) {
    sell_score += 35
    reasons.push({
      type: 'profit', weight: 35, direction: 'sell',
      label: 'Doubled  consider taking profits',
      detail: `+${unrealizedPct.toFixed(1)}% gain (${holding.quantity > 1 ? `sell half to lock in cost basis` : `full exit or partial`})`,
    })
  } else if (unrealizedPct >= 50) {
    sell_score += 25
    reasons.push({
      type: 'profit', weight: 25, direction: 'sell',
      label: 'Strong profit  partial exit signal',
      detail: `+${unrealizedPct.toFixed(1)}% above cost basis after ${daysHeld}d`,
    })
  } else if (unrealizedPct >= 25) {
    sell_score += 12
    reasons.push({
      type: 'profit', weight: 12, direction: 'sell',
      label: 'Solid profit accumulating',
      detail: `+${unrealizedPct.toFixed(1)}%  watch for trend reversal`,
    })
  }

  //  2. Price overextended vs averages 
  if (avg7d > 0 && price > 0) {
    const vs7d  = ((price - avg7d)  / avg7d)  * 100
    const vs30d = avg30d > 0 ? ((price - avg30d) / avg30d) * 100 : 0

    if (vs7d >= 30 && vs30d >= 20) {
      sell_score += 30
      reasons.push({
        type: 'overextended', weight: 30, direction: 'sell',
        label: 'Severely overextended',
        detail: `+${vs7d.toFixed(1)}% above 7d avg, +${vs30d.toFixed(1)}% above 30d avg  mean reversion likely`,
      })
    } else if (vs7d >= 20) {
      sell_score += 22
      reasons.push({
        type: 'overextended', weight: 22, direction: 'sell',
        label: 'Overextended vs 7d average',
        detail: `+${vs7d.toFixed(1)}% above 7d avg  historically corrects`,
      })
    } else if (vs7d >= 12) {
      sell_score += 12
      reasons.push({
        type: 'overextended', weight: 12, direction: 'sell',
        label: 'Above 7d average',
        detail: `+${vs7d.toFixed(1)}% above recent average`,
      })
    }
  }

  //  3. Stop loss signals 
  if (unrealizedPct <= -25 && (item.price_7d_change_pct ?? 0) < -5) {
    sell_score += 28
    reasons.push({
      type: 'stop_loss', weight: 28, direction: 'sell',
      label: 'Stop loss  downtrend accelerating',
      detail: `${unrealizedPct.toFixed(1)}% below cost basis, still falling ${item.price_7d_change_pct?.toFixed(1)}% this week`,
    })
  } else if (unrealizedPct <= -15 && (item.price_7d_change_pct ?? 0) < -3) {
    sell_score += 18
    reasons.push({
      type: 'stop_loss', weight: 18, direction: 'sell',
      label: 'Consider cutting loss',
      detail: `${unrealizedPct.toFixed(1)}% underwater with continued downtrend`,
    })
  } else if (unrealizedPct <= -30) {
    sell_score += 15
    reasons.push({
      type: 'stop_loss', weight: 15, direction: 'sell',
      label: 'Deep loss  reassess thesis',
      detail: `${unrealizedPct.toFixed(1)}% below cost  has the market structure changed?`,
    })
  }

  //  4. Trend reversal (momentum fading) 
  const trend7d  = item.price_7d_change_pct  ?? 0
  const trend30d = item.price_30d_change_pct ?? 0

  // Was going up, now reversing  classic exit signal
  if (trend30d >= 15 && trend7d <= -5) {
    sell_score += 20
    reasons.push({
      type: 'trend', weight: 20, direction: 'sell',
      label: 'Trend reversal after rally',
      detail: `30d run +${trend30d.toFixed(1)}% now reversing (7d: ${trend7d.toFixed(1)}%)  momentum fading`,
    })
  } else if (trend30d >= 25 && trend7d <= 0) {
    sell_score += 14
    reasons.push({
      type: 'trend', weight: 14, direction: 'sell',
      label: 'Post-rally stall',
      detail: `Strong 30d run (+${trend30d.toFixed(1)}%) stalling  watch for reversal`,
    })
  }

  //  5. Buff buy order floor deteriorating 
  // If Buff's buy orders drop below current price  market floor is falling
  if (item.buff_buy_order && item.price_usd) {
    const buffGap = ((item.price_usd - item.buff_buy_order) / item.buff_buy_order) * 100
    if (buffGap >= 15) {
      sell_score += 18
      reasons.push({
        type: 'arb', weight: 18, direction: 'sell',
        label: 'Buff floor far below current price',
        detail: `Current price $${item.price_usd.toFixed(2)} vs Buff buy order $${item.buff_buy_order.toFixed(2)} (${buffGap.toFixed(1)}% gap)  floor is lower`,
      })
    } else if (buffGap >= 8) {
      sell_score += 10
      reasons.push({
        type: 'arb', weight: 10, direction: 'sell',
        label: 'Buff buy orders weakening',
        detail: `Buff floor at $${item.buff_buy_order.toFixed(2)} vs market $${item.price_usd.toFixed(2)}`,
      })
    }
  }

  //  6. Arb: better sell venue exists right now 
  if (item.arb_spread_pct && item.arb_spread_pct >= 10 && item.arb_sell_market) {
    sell_score += 12
    reasons.push({
      type: 'arb', weight: 12, direction: 'sell',
      label: `Sell premium on ${item.arb_sell_market}`,
      detail: `${item.arb_spread_pct.toFixed(1)}% spread  ${item.arb_sell_market} is paying the most right now`,
    })
  }

  //  7. Upcoming bearish events 
  const relevantEvents = upcomingEvents.filter(e => {
    if (e.expected_impact !== 'bearish' && e.expected_impact !== 'mixed') return false
    if (!e.affected_categories.includes(item.category) &&
        !e.affected_categories.includes('all')) return false
    return e.days_until <= 30  // warn within 30 days
  })

  for (const event of relevantEvents.slice(0, 2)) {
    const urgencyBoost = event.impact_magnitude >= 4 ? 15 :
                         event.impact_magnitude >= 3 ? 10 : 5
    const timeBoost = event.days_until <= 7 ? 8 : event.days_until <= 14 ? 4 : 0

    sell_score += urgencyBoost + timeBoost
    reasons.push({
      type: 'event', weight: urgencyBoost + timeBoost, direction: 'sell',
      label: `Bearish event in ${event.days_until}d${!event.is_confirmed ? ' (speculative)' : ''}`,
      detail: `${event.title}  historically bearish for ${item.category} items`,
    })
  }

  //  8. Liquidity deteriorating 
  const vol = item.volume_24h ?? 0
  const totalValue = price * holding.quantity

  // Hard to exit a large position in an illiquid item
  if (vol < 5 && totalValue > 500) {
    sell_score += 10
    reasons.push({
      type: 'liquidity', weight: 10, direction: 'sell',
      label: 'Large illiquid position',
      detail: `${vol} trades/24h  ${holding.quantity > 1 ? `${holding.quantity} units worth ${(totalValue).toFixed(0)} may take days to exit` : 'very hard to exit at ask'}`,
    })
  }

  //  Scanner score deteriorating 
  if (item.score_total != null && item.score_total <= 35 && unrealizedPct > 5) {
    sell_score += 10
    reasons.push({
      type: 'trend', weight: 10, direction: 'sell',
      label: 'Scanner downgraded to Avoid',
      detail: `Signal score ${item.score_total}/100  market sees little upside left`,
    })
  }

  //  Hold signals (counterweight) 
  // Strong uptrend + still undervalued = hold
  if (avg7d > 0 && price < avg7d * 0.95 && unrealizedPct < 10) {
    sell_score = Math.max(0, sell_score - 15)
    reasons.push({
      type: 'profit', weight: -15, direction: 'hold',
      label: 'Still below 7d average',
      detail: 'Price hasn\'t recovered to average  may have more upside',
    })
  }
  if (trend7d >= 5 && unrealizedPct < 20) {
    sell_score = Math.max(0, sell_score - 8)
    reasons.push({
      type: 'trend', weight: -8, direction: 'hold',
      label: 'Active uptrend',
      detail: `+${trend7d.toFixed(1)}% this week  trend still in your favor`,
    })
  }

  //  Clamp and classify 
  sell_score = Math.min(100, Math.max(0, sell_score))

  let urgency: SellUrgency = 'none'
  if (sell_score >= 70)      urgency = 'high'
  else if (sell_score >= 45) urgency = 'medium'
  else if (sell_score >= 20) urgency = 'low'

  //  Summary 
  const topReasons = reasons
    .filter(r => r.direction === 'sell')
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 2)
    .map(r => r.label)
    .join(', ')

  let recommendation = ''
  if (urgency === 'none')   recommendation = 'Hold  ino significant exit signals'
  else if (urgency === 'low')    recommendation = `Watch  ${topReasons}`
  else if (urgency === 'medium') recommendation = `Consider selling  ${topReasons}`
  else                           recommendation = `Strong exit signal   ${topReasons}`

  return {
    sell_score,
    urgency,
    reasons: reasons.sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight)),
    recommendation,
    current_price: price,
    cost_basis:    costBasis,
    unrealized_pct: Math.round(unrealizedPct * 100) / 100,
    days_held:     daysHeld,
  }
}
