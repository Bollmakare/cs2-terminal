import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const portfolioId = req.nextUrl.searchParams.get('portfolio_id')
  const days = Math.min(730, parseInt(req.nextUrl.searchParams.get('days') ?? '365'))
  if (!portfolioId) return NextResponse.json({ error: 'portfolio_id required' }, { status: 400 })

  const since = new Date()
  since.setDate(since.getDate() - days)
  const sinceStr = since.toISOString().slice(0, 10)

  const { data: snapshots, error: snapErr } = await supabase
    .from('portfolio_snapshots')
    .select('total_value, cost_basis, unrealized_pnl, position_count, snapped_at')
    .eq('portfolio_id', portfolioId)
    .eq('user_id', user.id)
    .gte('snapped_at', sinceStr)
    .order('snapped_at', { ascending: true })

  if (snapErr) return NextResponse.json({ error: snapErr.message }, { status: 500 })

  const { data: marketIndex } = await supabase
    .from('market_index')
    .select('snapped_at, index_value, change_1d_pct')
    .gte('snapped_at', sinceStr)
    .order('snapped_at', { ascending: true })

  const { data: holdings } = await supabase
    .from('holdings')
    .select('id, item_name, item_category, quantity, cost_basis, last_price, acquired_at, item:items(volume_24h, price_7d_change_pct)')
    .eq('portfolio_id', portfolioId)
    .eq('user_id', user.id)

  return NextResponse.json({ snapshots: snapshots ?? [], marketIndex: marketIndex ?? [], holdings: holdings ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { portfolio_id, metrics } = await req.json()
  if (!portfolio_id || !metrics) return NextResponse.json({ error: 'portfolio_id and metrics required' }, { status: 400 })

  const { error } = await supabase.from('portfolio_risk_metrics').upsert({
    portfolio_id, user_id: user.id, computed_at: new Date().toISOString(),
    days_of_history: metrics.daysOfHistory, annualized_vol: metrics.annualizedVol,
    daily_vol: metrics.dailyVol, sharpe_ratio: metrics.sharpe, sortino_ratio: metrics.sortino,
    calmar_ratio: metrics.calmar, max_drawdown_pct: metrics.maxDrawdownPct, max_drawdown_abs: metrics.maxDrawdownAbs,
    current_drawdown_pct: metrics.currentDrawdownPct, ath_value: metrics.athValue,
    beta: metrics.beta, alpha_annualized: metrics.alpha, correlation_to_market: metrics.correlation,
    total_return_pct: metrics.totalReturnPct, annualized_return_pct: metrics.annualizedReturnPct,
    portfolio_liquidity_score: metrics.liquidityScore, illiquid_value_usd: metrics.illiquidValue,
    illiquid_pct: metrics.illiquidPct, herfindahl_index: metrics.hhi, top1_pct: metrics.top1Pct, top5_pct: metrics.top5Pct,
  }, { onConflict: 'portfolio_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
