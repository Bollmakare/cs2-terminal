-- âââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
-- MIGRATION 003: Phase 4 â Professional Analytics Suite
-- Run in Supabase SQL Editor after 001 and 002
-- âââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

-- ââ CS2 Market Index âââââââââââââââââââââââââââââââââââââ
-- Daily aggregate market cap / value across all tracked items
-- Used for beta calculation and benchmark comparison
create table if not exists public.market_index (
  id          bigserial primary key,
  snapped_at  date not null unique,
  -- Weighted average price across all items (volume-weighted)
  index_value       numeric(14,4) not null,   -- normalized to 1000 base
  total_items       int,
  avg_price_usd     numeric(12,2),
  median_price_usd  numeric(12,2),
  total_volume_24h  int,
  -- Aggregate market change
  change_1d_pct     numeric(7,3),
  change_7d_pct     numeric(7,3),
  change_30d_pct    numeric(7,3),
  -- Individual category sub-indices (normalized)
  idx_knife         numeric(10,4),
  idx_rifle         numeric(10,4),
  idx_pistol        numeric(10,4),
  idx_sniper        numeric(10,4),
  idx_gloves        numeric(10,4),
  idx_case          numeric(10,4),
  created_at    2   timestamptz default now()
);
create index mi_date_idx on public.market_index(snapped_at desc);

-- ââ Trade-Up Lab: saved contracts ââââââââââââââââââââââââ
create table if not exists public.tradeup_contracts (
  id            uuid default uuid_generate_v4() primary key,
  user_id       uuid references auth.users on delete cascade not null,
  name          text not null default 'Untitled Contract',
  -- Input items (JSON array of {item_id, item_name, float_value, value_usd})
  input_items   jsonb not null default '[]',
  -- Calculated outputs (cached)
  rarity_in     text,           -- milspec | restricted | classified | covert
  rarity_out    text,           -- restricted | classified | covert | contraband
  n_inputs      int default 10,
  total_cost_usd  numeric(12,2),
  -- EV outputs
  ev_total       numeric(12,4),
  ev_net         numeric(12,4),  -- after fees
  roi_pct        numeric(7,3),
  -- Outcome distribution (JSON: [{item_name, probability, value, float_min, float_max}])
  outcomes       jsonb default '[]',
  -- Expected float output (avg of inputs weighted by contract rules)
  expected_float_out numeric(7,4),
  best_case_value    numeric(12,2),
  worst_case_value   numeric(12,2),
  -- Execution
  is_executed    boolean default false,
  executed_at    timestamptz,
  executed_result jsonb,         -- actual skin received
  notes          text,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);
alter table public.tradeup_contracts enable row level security;
create policy "tradeup_own" on public.tradeup_contracts for all using (auth.uid() = user_id);
create index tradeup_user_idx on public.tradeup_contracts(user_id, created_at desc);

-- ââ Float analysis cache ââââââââââââââââââââââââââââââââââ
-- Per-item float statistics pulled from CSFloat, cached daily
create table if not exists public.float_analysis (
  item_id       text primary key references public.items(id) on delete cascade,
  -- Float distribution statistics
  float_min     numeric(7,4),
  float_max     numeric(7,4),
  float_mean    numeric(7,4),
  float_median  numeric(7,4),
  float_std_dev numeric(7,4),
  -- Pattern availability
  patterns_available  int,       -- # distinct patterns seen on CSFloat
  top_patterns  jsonb,           -- [{pattern_id, name, rarity_label, premium_pct}]
  -- Float-based price premiums (% over median price)
  premium_fn_low  numeric(7,3),  -- float < 0.01
  premium_mw_low  numeric(7,3),  -- float < 0.08
  premium_bs_high numeric(7,3),  -- float > 0.9 (some skins)
  -- Rarity score (0-100 based on float position in distribution)
  float_rarity_score int,
  -- Source & freshness
  source        text default 'csfloat',
  listings_seen int,
  refreshed_at  timestamptz default now()
);
create index fa_refreshed_idx on public.float_analysis(refreshed_at desc);

-- ââ Risk metrics cache ââââââââââââââââââââââââââââââââââââ
-- Per-portfolio computed risk metrics, updated daily
create table if not exists public.portfolio_risk_metrics (
  id              bigserial primary key,
  portfolio_id    uuid references public.portfolios on delete cascade not null,
  user_id         uuid references auth.users on delete cascade not null,
  computed_at     timestamptz default now(),
  -- Return series
  days_of_history int,
  -- Volatility
  annualized_vol        numeric(8,4),    -- % annualized std dev of daily returns
  daily_vol             numeric(8,4),    -- daily std dev
  -- Risk-adjusted returns  
  sharpe_ratio          numeric(8,4),    -- (return - rf) / vol, rf = 0 for CS2
  sortino_ratio         numeric(8,4),    -- (return - rf) / downside_vol
  calmar_ratio          numeric(8,4),    -- annualized_return / max_drawdown
  -- Drawdown
  max_drawdown_pct      numeric(8,4),    -- worst peak-to-trough %
  max_drawdown_abs      numeric(12,2),   -- $ amount
  current_drawdown_pct  numeric(8,4),    -- current % from ATH
  ath_value             numeric(14,2),   -- all-time-high portfolio value
  -- Beta to market index
  beta                  numeric(8,4),    -- covariance(port, mkt) / variance(mkt)
  alpha_annualized      numeric(8,4),    -- Jensen's alpha (annualized)
  correlation_to_market numeric(8,4),    -- pearson r vs market index
  -- Liquidity
  portfolio_liquidity_score int,         -- 0-100 weighted average
  illiquid_value_usd        numeric(12,2),-- value in items with vol < 5/24h
  illiquid_pct              numeric(7,3),
  -- Concentration
  herfindahl_index      numeric(8,4),    -- HHI: 1/n = perfectly diverse, 1 = 100% concentrated
  top1_pct              numeric(7,3),    -- biggest position as % of NAV
  top5_pct              numeric(7,3),    -- top 5 positions as % of NAV
  category_count        int,
  -- Return metrics
  total_return_pct      numeric(8,4),    -- total return since inception
  annualized_return_pct numeric(8,4),    -- CAGR
  unique(portfolio_id)  -- upsert on portfolio_id
);
alter table public.portfolio_risk_metrics enable row level security;
create policy "risk_own" on public.portfolio_risk_metrics for all using (auth.uid() = user_id);

-- ââ Seed market index: generate synthetic history âââââââââ
-- Creates 90 days of synthetic index data based on current items
-- Real data will replace this as prices refresh
do $$
declare
  base_val numeric := 1000.0;
  cur_val  numeric := 1000.0;
  cur_date date    := current_date - 89;
  daily_change numeric;
begin
  while cur_date <= current_date loop
    -- Random walk with slight upward drift (CS2 market tendency)
    daily_change := (random() - 0.48) * 0.04;  -- -2% to +2.08% daily
    cur_val := cur_val * (1 + daily_change);
    -- Clamp to reasonable range
    cur_val := greatest(700, least(1400, cur_val));
    
    insert into public.market_index (
      snapped_at, index_value, total_items, avg_price_usd,
      change_1d_pct, change_7d_pct
    ) values (
      cur_date, round(cur_val, 4), 8000, round(45 + random() * 15, 2),
      round(daily_change * 100, 3), null
    )
    on conflict (snapped_at) do nothing;
    
    cur_date := cur_date + 1;
  end loop;
end;
$$;

-- ââ DB function: compute_portfolio_risk() âââââââââââââââââ
-- Called by /api/analytics/risk endpoint
create or replace function compute_portfolio_risk(p_portfolio_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
security definer
as $$
declare
  snap_row record;
  nav_values numeric[];
  mkt_values numeric[];
  n int;
  returns numeric[];
  mkt_returns numeric[];
  mean_ret numeric;
  vol numeric;
  downside_vol numeric;
  max_dd numeric;
  cur_dd numeric;
  ath numeric;
  sharpe numeric;
  sortino numeric;
  beta_val numeric;
  alpha_val numeric;
  corr_val numeric;
  total_ret numeric;
  ann_ret numeric;
  hhi numeric;
  result jsonb;
begin
  -- Gather snapshot NAV series (last 365 days)
  select array_agg(total_value order by snapped_at)
  into nav_values
  from portfolio_snapshots
  where portfolio_id = p_portfolio_id
    and user_id = p_user_id
    and snapped_at >= current_date - 365;

  n := array_length(nav_values, 1);
  if n < 3 then
    return jsonb_build_object('error', 'insufficient_history', 'days', coalesce(n, 0));
  end if;

  -- Gather market index for same period
  select array_agg(index_value order by snapped_at)
  into mkt_values
  from market_index
  where snapped_at >= current_date - 365
    and snapped_at <= current_date;

  -- Compute daily returns
  returns := array[]::numeric[];
  for i in 2..n loop
    if nav_values[i-1] > 0 then
      returns := returns || array[(nav_values[i] - nav_values[i-1]) / nav_values[i-1]];
    end if;
  end loop;

  -- Mean return
  mean_ret := (select avg(r) from unnest(returns) r);

  -- Volatility (std dev of returns)
  vol := (select stddev(r) from unnest(returns) r);

  -- Annualized vol
  vol := vol * sqrt(365);

  -- Downside vol (only negative returns)
  downside_vol := (select stddev(r) from unnest(returns) r where r < 0) * sqrt(365);

  -- Max drawdown
  ath := nav_values[1];
  max_dd := 0;
  foreach snap_row.total_value in array nav_values loop
    if snap_row.total_value > ath then ath := snap_row.total_value; end if;
    if ath > 0 then
      cur_dd := (ath - snap_row.total_value) / ath;
      if cur_dd > max_dd then max_dd := cur_dd; end if;
    end if;
  end loop;

  -- Total return
  total_ret := case when nav_values[1] > 0 then (nav_values[n] - nav_values[1]) / nav_values[1] else 0 end;
  
  -- Annualized return (CAGR)
  ann_ret := case when n > 1 then power(1 + total_ret, 365.0/n) - 1 else 0 end;

  -- Sharpe (rf = 0 for CS2 market)
  sharpe := case when vol > 0 then (ann_ret) / vol else 0 end;
  
  -- Sortino
  sortino := case when downside_vol > 0 then ann_ret / downside_vol else 0 end;

  -- Current drawdown from ATH
  cur_dd := case when ath > 0 then (ath - nav_values[n]) / ath else 0 end;

  result := jsonb_build_object(
    'days_of_history',    n,
    'annualized_vol',     round(vol * 100, 2),
    'daily_vol',          round((select stddev(r) from unnest(returns) r) * 100, 3),
    'sharpe_ratio',       round(sharpe, 3),
    'sortino_ratio',      round(sortino, 3),
    'max_drawdown_pct',   round(max_dd * 100, 2),
    'max_drawdown_abs',   round(ath - nav_values[n], 2),
    'current_drawdown_pct', round(cur_dd * 100, 2),
    'ath_value',          round(ath, 2),
    'total_return_pct',   round(total_ret * 100, 2),
    'annualized_return_pct', round(ann_ret * 100, 2),
    'calmar_ratio',       round(case when max_dd > 0 then (ann_ret * 100) / (max_dd * 100) else 0 end, 3)
  );

  return result;
end;
$$;

comment on table public.market_index is 'CS2 market aggregate index â normalized to 1000 base, updated on each price refresh';
comment on table public.tradeup_contracts is 'Trade-up contracts: saved inputs/outputs for the Trade-Up Lab';
comment on table public.float_analysis is 'Per-item float statistics from CSFloat API, cached daily';
comment on table public.portfolio_risk_metrics is 'Computed risk metrics per portfolio, upserted daily by /api/analytics/risk';
