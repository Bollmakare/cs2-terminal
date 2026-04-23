// Portfolio risk analytics — mirrors the DB function compute_portfolio_risk
// Used client-side when snapshot history is insufficient

export interface RiskMetrics {
  days_of_history: number
  annualized_vol: number
  daily_vol: number
  sharpe_ratio: number
  sortino_ratio: number
  max_drawdown_pct: number
  max_drawdown_abs: number
  current_drawdown_pct: number
  ath_value: number
  total_return_pct: number
  annualized_return_pct: number
  calmar_ratio: number
}

export function computeRiskMetrics(navValues: number[]): RiskMetrics | { error: string } {
  const n = navValues.length
  if (n < 3) return { error: 'insufficient_history' }

  // Daily returns
  const returns: number[] = []
  for (let i = 1; i < n; i++) {
    if (navValues[i - 1] > 0) {
      returns.push((navValues[i] - navValues[i - 1]) / navValues[i - 1])
    }
  }

  const mean = returns.reduce((a, b) => a + b, 0) / returns.length
  const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / returns.length
  const stdDev = Math.sqrt(variance)
  const annVol = stdDev * Math.sqrt(365)

  const downside = returns.filter(r => r < 0)
  const downsideVariance = downside.length > 0
    ? downside.reduce((a, b) => a + b * b, 0) / downside.length
    : 0
  const downsideVol = Math.sqrt(downsideVariance) * Math.sqrt(365)

  // Drawdown
  let ath = navValues[0]
  let maxDd = 0
  for (const v of navValues) {
    if (v > ath) ath = v
    const dd = ath > 0 ? (ath - v) / ath : 0
    if (dd > maxDd) maxDd = dd
  }
  const curDd = ath > 0 ? (ath - navValues[n - 1]) / ath : 0

  const totalRet = navValues[0] > 0 ? (navValues[n - 1] - navValues[0]) / navValues[0] : 0
  const annRet = n > 1 ? Math.pow(1 + totalRet, 365 / n) - 1 : 0
  const sharpe = annVol > 0 ? annRet / annVol : 0
  const sortino = downsideVol > 0 ? annRet / downsideVol : 0
  const calmar = maxDd > 0 ? (annRet * 100) / (maxDd * 100) : 0

  return {
    days_of_history: n,
    annualized_vol: Math.round(annVol * 10000) / 100,
    daily_vol: Math.round(stdDev * 100000) / 1000,
    sharpe_ratio: Math.round(sharpe * 1000) / 1000,
    sortino_ratio: Math.round(sortino * 1000) / 1000,
    max_drawdown_pct: Math.round(maxDd * 10000) / 100,
    max_drawdown_abs: Math.round((ath - navValues[n - 1]) * 100) / 100,
    current_drawdown_pct: Math.round(curDd * 10000) / 100,
    ath_value: Math.round(ath * 100) / 100,
    total_return_pct: Math.round(totalRet * 10000) / 100,
    annualized_return_pct: Math.round(annRet * 10000) / 100,
    calmar_ratio: Math.round(calmar * 1000) / 1000,
  }
}
