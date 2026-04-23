/**
 * Doppler Phase Detection + Sticker Value Estimation
 *
 * Doppler items are critical to price correctly  same skin name, wildly different value:
 * Karambit | Doppler Phase 4 (FN)  $450
 * Karambit | Doppler Sapphire (FN)  $8,000
 *
 * Sticker detection flags holdings that likely have significant sticker value
 * that the base price doesn't capture.
 */

//  Doppler phase detection 
// Maps paint_index  phase name for each Doppler variant
// Source: CS2 item schema (Valve), verified against CSFloat data

export type DopplerPhase =
  | 'Phase 1' | 'Phase 2' | 'Phase 3' | 'Phase 4'
  | 'Ruby' | 'Sapphire' | 'Black Pearl' | 'Emerald'
  | 'Phase 1' // gamma

// Paint index ranges per phase (from Valve item schema)
// These are consistent across all Doppler knives
export const DOPPLER_PAINT_INDEX: Record<number, DopplerPhase> = {
  // Standard Doppler phases
  415: 'Phase 1',
  416: 'Phase 2',
  417: 'Phase 3',
  418: 'Phase 4',
  // Special phases
  569: 'Ruby',
  570: 'Sapphire',
  571: 'Black Pearl',
  // Gamma Doppler phases
  568: 'Emerald',
  572: 'Phase 1',  // Gamma Phase 1
  573: 'Phase 2',  // Gamma Phase 2
  574: 'Phase 3',  // Gamma Phase 3
  575: 'Phase 4',  // Gamma Phase 4
}

// Premium multipliers vs base Doppler price (Phase 1 = baseline 1.0)
// Source: market observation, updated periodically
export const DOPPLER_PHASE_PREMIUM: Record<string, number> = {
  'Phase 1':    1.0,
  'Phase 2':    1.3,   // most popular, slight premium
  'Phase 3':    0.85,  // less desirable
  'Phase 4':    1.2,   // blue back = popular
  'Emerald':    3.5,   // Gamma Emerald  rare green
  'Ruby':       8.0,   // solid red
  'Sapphire':  12.0,   // most desirable  bright blue
  'Black Pearl':18.0,  // rarest
}

export interface DopplerInfo {
  phase:          DopplerPhase | null
  is_doppler:     boolean
  is_gamma:       boolean
  is_special:     boolean   // Ruby, Sapphire, Black Pearl, Emerald
  price_multiplier: number  // vs base condition price
  phase_label:    string
}

export function detectDopplerPhase(
  marketHashName: string,
  paintIndex?: number | null
): DopplerInfo {
  const isDoppler      = marketHashName.includes('Doppler')
  const isGamma        = marketHashName.includes('Gamma Doppler')

  if (!isDoppler) {
    return { phase: null, is_doppler: false, is_gamma: false, is_special: false, price_multiplier: 1, phase_label: '' }
  }

  let phase: DopplerPhase | null = null

  if (paintIndex != null) {
    phase = DOPPLER_PAINT_INDEX[paintIndex] ?? null
  }

  // If phase is known from the market hash name string (some APIs include it)
  if (!phase) {
    if (marketHashName.includes('Sapphire'))    phase = 'Sapphire'
    else if (marketHashName.includes('Ruby'))   phase = 'Ruby'
    else if (marketHashName.includes('Black Pearl')) phase = 'Black Pearl'
    else if (marketHashName.includes('Emerald')) phase = 'Emerald'
    else if (marketHashName.includes('Phase 1')) phase = 'Phase 1'
    else if (marketHashName.includes('Phase 2')) phase = 'Phase 2'
    else if (marketHashName.includes('Phase 3')) phase = 'Phase 3'
    else if (marketHashName.includes('Phase 4')) phase = 'Phase 4'
  }

  const isSpecial = phase
    ? ['Ruby', 'Sapphire', 'Black Pearl', 'Emerald'].includes(phase)
    : false

  const multiplier = phase ? (DOPPLER_PHASE_PREMIUM[phase] ?? 1.0) : 1.0

  return {
    phase,
    is_doppler: true,
    is_gamma:   isGamma,
    is_special: isSpecial,
    price_multiplier: multiplier,
    phase_label: phase
      ? (isGamma && !isSpecial ? `Gamma ${phase}` : phase)
      : 'Unknown Phase',
  }
}

//  Phase-adjusted price 
// When we know the base Doppler price (from Skinstrack/PricEmpire)
// and the specific phase, compute a better estimate
export function adjustDopplerPrice(
  basePrice: number | null,
  phase: DopplerPhase | null
): number | null {
  if (!basePrice || !phase) return basePrice
  // Base price from APIs is usually Phase 2 average
  // Normalize to Phase 1 then multiply by phase premium
  const phase2Factor = DOPPLER_PHASE_PREMIUM['Phase 2'] ?? 1.3
  const phaseFactor  = DOPPLER_PHASE_PREMIUM[phase]    ?? 1.0
  return Math.round((basePrice / phase2Factor * phaseFactor) * 100) / 100
}

//  High-value sticker detection 
// Stickers that could be worth more than the skin itself
// Source: community price tracking (community-driven, approximate)

interface StickerValueInfo {
  sticker_name:     string
  min_value:        number    // conservative floor ($)
  max_value:        number    // high-end ceiling ($)
  tier:             'legendary' | 'major' | 'significant' | 'notable'
  applied_discount: number    // applied stickers typically worth 25-50% of float
  notes:            string
}

const HIGH_VALUE_STICKERS: Record<string, StickerValueInfo> = {
  // Katowice 2014
  'Katowice 2014 Holo':   { sticker_name: 'Katowice 2014 Holo', min_value: 3000,  max_value: 80000, tier: 'legendary', applied_discount: 0.35, notes: 'Most valuable CS stickers ever' },
  'Katowice 2014 Foil':   { sticker_name: 'Katowice 2014 Foil', min_value: 800,   max_value: 5000,  tier: 'legendary', applied_discount: 0.35, notes: 'Katowice 2014 foil team stickers' },
  'Katowice 2014':        { sticker_name: 'Katowice 2014', min_value: 150, max_value: 1500, tier: 'major', applied_discount: 0.30, notes: 'Katowice 2014 paper stickers' },
  // Cologne 2014
  'Cologne 2014 Holo':    { sticker_name: 'Cologne 2014 Holo', min_value: 500, max_value: 8000,  tier: 'major', applied_discount: 0.35, notes: 'Cologne 2014 holo' },
  'Cologne 2014 Foil':    { sticker_name: 'Cologne 2014 Foil', min_value: 200, max_value: 2000,  tier: 'major', applied_discount: 0.30, notes: 'Cologne 2014 foil' },
  // ESL One Katowice 2015
  'ESL One Katowice 2015 Holo': { sticker_name: 'ESL One Katowice 2015 Holo', min_value: 200, max_value: 3000, tier: 'major', applied_discount: 0.30, notes: 'Kat 2015 holos' },
  // Dreamhack 2014
  'DreamHack 2014 Holo':  { sticker_name: 'DreamHack 2014 Holo', min_value: 300, max_value: 5000, tier: 'major', applied_discount: 0.30, notes: 'DHW 2014 holos' },
  // Crown (Foil)  perennial high value
  'Crown (Foil)':         { sticker_name: 'Crown (Foil)', min_value: 300, max_value: 1500, tier: 'significant', applied_discount: 0.40, notes: 'Always valuable, rarely applied' },
  // Howling Dawn (Foil)
  'Howling Dawn (Foil)':  { sticker_name: 'Howling Dawn (Foil)', min_value: 150, max_value: 800, tier: 'significant', applied_discount: 0.35, notes: 'Discontinued, scarce' },
  // ESL One Cologne 2015
  'ESL One Cologne 2015 Holo': { sticker_name: 'ESL One Cologne 2015 Holo', min_value: 100, max_value: 2000, tier: 'significant', applied_discount: 0.30, notes: 'Cologne 2015 team holos vary significantly' },
  // Krakow 2017 notable team holos
  'Krakow 2017 Holo':     { sticker_name: 'Krakow 2017 Holo', min_value: 20, max_value: 500, tier: 'notable', applied_discount: 0.25, notes: 'Popular team holos vary' },
}

export interface StickerValueEstimate {
  has_valuable_stickers: boolean
  estimated_sticker_value_min: number   // floor across all stickers applied
  estimated_sticker_value_max: number   // ceiling
  applied_value_min: number             // after applied discount
  applied_value_max: number
  flagged_stickers: { name: string; tier: string; min: number; max: number }[]
  warning: string | null
}

export function estimateStickerValue(
  stickers: { name?: string; sticker_name?: string }[] | null | undefined
): StickerValueEstimate {
  const empty = {
    has_valuable_stickers: false,
    estimated_sticker_value_min: 0,
    estimated_sticker_value_max: 0,
    applied_value_min: 0,
    applied_value_max: 0,
    flagged_stickers: [],
    warning: null,
  }

  if (!stickers || stickers.length === 0) return empty

  const flagged: { name: string; tier: string; min: number; max: number }[] = []
  let totalMin = 0, totalMax = 0
  let appliedMin = 0, appliedMax = 0

  for (const sticker of stickers) {
    const name = sticker.name ?? sticker.sticker_name ?? ''
    if (!name) continue

    // Check direct match
    let info = HIGH_VALUE_STICKERS[name]

    // Check partial match (e.g. "Fnatic | Katowice 2014 Holo")
    if (!info) {
      for (const [key, val] of Object.entries(HIGH_VALUE_STICKERS)) {
        if (name.includes(key) || key.includes(name.split('|').pop()?.trim() ?? '')) {
          info = val
          break
        }
      }
    }

    if (info) {
      totalMin    += info.min_value
      totalMax    += info.max_value
      appliedMin  += info.min_value * info.applied_discount
      appliedMax  += info.max_value * info.applied_discount
      flagged.push({ name, tier: info.tier, min: info.min_value, max: info.max_value })
    }
  }

  if (!flagged.length) return empty

  const hasLegendary = flagged.some(s => s.tier === 'legendary')
  const warning = hasLegendary
    ? 'LEGENDARY sticker detected  this item may be worth significantly more than the base price. Check CSFloat/Buff listing comps.'
    : totalMax > 500
    ? 'High-value sticker(s) detected  base price does not include sticker premium.'
    : null

  return {
    has_valuable_stickers: true,
    estimated_sticker_value_min: Math.round(totalMin),
    estimated_sticker_value_max: Math.round(totalMax),
    applied_value_min:  Math.round(appliedMin),
    applied_value_max:  Math.round(appliedMax),
    flagged_stickers: flagged,
    warning,
  }
}

//  Float-adjusted price estimator 
// Given a float value, estimate what the item is actually worth
// relative to the condition's median price
// Uses exponential curve  low floats command exponential premiums

export interface FloatAdjustedPrice {
  base_price:        number
  adjusted_price:    number
  float_premium_pct: number
  float_tier:        string   // "gem", "low", "mid", "high", "max"
  marketable_note:   string
}

export function estimateFloatAdjustedPrice(
  basePrice: number,           // median price for condition from market
  floatValue: number,          // 0.000001 to 0.999999
  condition: string,           // FN, MW, FT, WW, BS
  marketHashName: string
): FloatAdjustedPrice {
  // Float tier thresholds per condition
  // These define what constitutes a "gem" float
  const tierThresholds: Record<string, { gem: number; low: number; high: number }> = {
    FN: { gem: 0.001,  low: 0.03,  high: 0.065 },
    MW: { gem: 0.072,  low: 0.09,  high: 0.13  },
    FT: { gem: 0.152,  low: 0.18,  high: 0.30  },
    WW: { gem: 0.382,  low: 0.40,  high: 0.43  },
    BS: { gem: 0.452,  low: 0.50,  high: 0.75  },
  }

  const thresholds = tierThresholds[condition] ?? { gem: 0.1, low: 0.25, high: 0.75 }

  let floatTier: string
  let premiumPct = 0

  if (floatValue <= thresholds.gem) {
    floatTier  = 'gem'
    // Exponential premium for gem floats  diminishing returns
    const depthBelowGem = (thresholds.gem - floatValue) / thresholds.gem
    premiumPct = Math.min(1500, 50 + depthBelowGem * 800)
  } else if (floatValue <= thresholds.low) {
    floatTier  = 'low'
    const depth = (thresholds.low - floatValue) / (thresholds.low - thresholds.gem)
    premiumPct  = depth * 50
  } else if (floatValue >= thresholds.high && condition !== 'FN') {
    floatTier  = 'high'
    // High floats sometimes command premium (max BS, max WW "playside")
    const isBSorWW = condition === 'BS' || condition === 'WW'
    premiumPct     = isBSorWW ? 5 : -5
  } else if (floatValue > thresholds.low) {
    floatTier  = 'mid'
    premiumPct  = 0
  } else {
    floatTier  = 'low'
    premiumPct  = 5
  }

  // Special cases: some skins have no float premium (case hardened relies on pattern not float)
  const noFloatPremiumSkins = ['Case Hardened', 'Fade', 'Marble Fade']
  const hasFloatPremium = !noFloatPremiumSkins.some(s => marketHashName.includes(s))

  const finalPremiumPct = hasFloatPremium ? premiumPct : 0
  const adjustedPrice   = Math.round(basePrice * (1 + finalPremiumPct / 100) * 100) / 100

  let note = ''
  if (floatTier === 'gem') note = `Gem float  very rare, manual comps recommended`
  else if (floatTier === 'low') note = `Low float  slight premium over median`
  else if (finalPremiumPct === 0 && !hasFloatPremium) note = `Float irrelevant  pattern/phase drives price`

  return {
    base_price:        basePrice,
    adjusted_price:    adjustedPrice,
    float_premium_pct: Math.round(finalPremiumPct * 10) / 10,
    float_tier:        floatTier,
    marketable_note:   note,
  }
}
