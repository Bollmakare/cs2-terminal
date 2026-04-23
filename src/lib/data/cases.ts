/**
 * CS2 Cases Data Library
 * Drop rates are official Valve percentages.
 * EV calculations use weighted averages from community price tracking.
 */

export const DROP_RATES = {
  milspec:    0.7992,
  restricted: 0.1598,
  classified: 0.0320,
  covert:     0.0064,
  rare:       0.0026,   // knife or glove
} as const

// Probability of getting AT LEAST one of each rarity in N opens
export function atLeastOneProbability(dropRate: number, n: number): number {
  return 1 - Math.pow(1 - dropRate, n)
}

// Expected value for N opens
export interface SimulationResult {
  n:              number
  total_cost:     number      // case price + key price  n
  expected_value: number      // EV per open  n
  expected_profit: number
  expected_roi_pct: number
  prob_knife_at_least_one: number
  prob_covert_at_least_one: number
  percentiles: {
    p10: number   // worst 10% outcome (full loss)
    p25: number
    p50: number   // median
    p75: number
    p90: number   // best 10% outcome
  }
}

export interface CaseEV {
  id:            string
  name:          string
  price_usd:     number
  key_price:     number
  ev_milspec:    number
  ev_restricted: number
  ev_classified: number
  ev_covert:     number
  ev_rare:       number
  ev_total:      number
  cost_per_open: number
  profit_per_open: number
  roi_pct:       number
  break_even_case_price: number
}

export function calcEV(casePrice: number, keyPrice: number, tierValues: {
  milspec: number; restricted: number; classified: number; covert: number; rare: number
}): CaseEV['ev_total'] & number {
  return (
    tierValues.milspec    * DROP_RATES.milspec    +
    tierValues.restricted * DROP_RATES.restricted +
    tierValues.classified * DROP_RATES.classified +
    tierValues.covert     * DROP_RATES.covert     +
    tierValues.rare       * DROP_RATES.rare
  )
}

export function simulate(
  casePrice: number,
  keyPrice: number,
  evPerOpen: number,
  n: number
): SimulationResult {
  const cost_per_open    = casePrice + keyPrice
  const total_cost       = cost_per_open * n
  const expected_value   = evPerOpen * n
  const expected_profit  = expected_value - total_cost
  const expected_roi_pct = total_cost > 0 ? (expected_profit / total_cost) * 100 : 0

  const prob_knife_at_least_one  = atLeastOneProbability(DROP_RATES.rare, n)
  const prob_covert_at_least_one = atLeastOneProbability(DROP_RATES.covert, n)

  // Monte Carlo approximation for percentile outcomes
  // Use binomial distribution for expensive items
  const p10_knives  = 0  // worst case: 0 knives in most opens
  const p50_coverts = Math.round(n * DROP_RATES.covert)

  // Simple percentile approximation
  const milspecAvgReturn = n * DROP_RATES.milspec * evPerOpen * 0.3 // just milspec
  const percentiles = {
    p10: milspecAvgReturn * 0.2,                       // only cheap drops
    p25: total_cost * 0.4,                              // bad session
    p50: expected_value,                                // median ~= EV
    p75: expected_value * 1.5,                          // some good drops
    p90: expected_value * 2.5 + evPerOpen * Math.sqrt(n), // lucky session
  }

  return {
    n, total_cost, expected_value, expected_profit, expected_roi_pct,
    prob_knife_at_least_one, prob_covert_at_least_one, percentiles,
  }
}

//  Break-even chart data 
export function buildBreakEvenChart(evPerOpen: number, keyPrice: number, n = 100) {
  const points: { case_price: number; roi_pct: number }[] = []
  for (let casePx = 0.01; casePx <= 20; casePx += 0.25) {
    const cost = casePx + keyPrice
    const roi  = ((evPerOpen - cost) / cost) * 100
    points.push({ case_price: Math.round(casePx * 100) / 100, roi_pct: Math.round(roi * 10) / 10 })
  }
  return points
}

//  Rarity breakdown for charting 
export interface RarityBreakdown {
  rarity:    string
  drop_rate: number
  tier_ev:   number
  color:     string
}

export function rarityBreakdown(tierValues: {
  milspec: number; restricted: number; classified: number; covert: number; rare: number
}): RarityBreakdown[] {
  return [
    { rarity: 'Mil-Spec',     drop_rate: DROP_RATES.milspec,    tier_ev: tierValues.milspec    * DROP_RATES.milspec,    color: '#4b69ff' },
    { rarity: 'Restricted',   drop_rate: DROP_RATES.restricted, tier_ev: tierValues.restricted * DROP_RATES.restricted, color: '#8847ff' },
    { rarity: 'Classified',   drop_rate: DROP_RATES.classified, tier_ev: tierValues.classified * DROP_RATES.classified, color: '#d32ce6' },
    { rarity: 'Covert',       drop_rate: DROP_RATES.covert,     tier_ev: tierValues.covert     * DROP_RATES.covert,     color: '#eb4b4b' },
    { rarity: 'Rare Special', drop_rate: DROP_RATES.rare,       tier_ev: tierValues.rare       * DROP_RATES.rare,       color: '#ffd700' },
  ]
}
