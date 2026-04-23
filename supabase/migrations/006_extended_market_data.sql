-- ============================================================
-- CS2 Terminal â Migration 006: Extended Market Data
-- Adds columns for all data sources: Steam orders, PricEmpire,
-- Buff direct, float distribution, pattern premiums.
-- Run AFTER migrations 001â005.
-- ============================================================

-- ââ Extend items table with new price sources âââââââââââââ
alter table public.items
  -- Additional market prices
  add column if not exists price_waxpeer      numeric(12,2),   -- Waxpeer
  add column if not exists price_cs_money     numeric(12,2),   -- CS.Money
  add column if not exists price_market_csgo  numeric(12,2),   -- Market.CSGO
  add column if not exists price_dmarket      numeric(12,2),   -- DMarket
  add column if not exists price_tradeit      numeric(12,2),   -- Tradeit.gg
  add column if not exists price_haloskins    numeric(12,2),   -- HaloSkins
  -- PricEmpire aggregate (weighted across all platforms)
  add column if not exists price_pricempire   numeric(12,2),   -- PricEmpire median
  add column if not exists price_pricempire_avg_30d numeric(12,2),
  -- Steam Market order book snapshot
  add column if not exists steam_buy_orders   int,             -- active buy orders count
  add column if not exists steam_sell_orders  int,             -- active sell orders count
  add column if not exists steam_buy_price_highest  numeric(12,2),  -- highest buyer willing to pay
  add column if not exists steam_sell_price_lowest  numeric(12,2),  -- lowest seller asking
  add column if not exists steam_order_spread_pct   numeric(7,3),   -- (sell_low - buy_high) / buy_high * 100
  add column if not exists steam_recent_sales int,             -- sales in last 24h (from Steam price history)
  -- Float distribution (from CSFloat database)
  add column if not exists float_min          numeric(8,6),    -- lowest float seen in the wild
  add column if not exists float_max          numeric(8,6),    -- highest float seen
  add column if not exists float_count        int,             -- total listings CSFloat has data for
  add column if not exists float_cap          numeric(8,6),    -- theoretical max float for this skin
  add column if not exists float_cap_min      numeric(8,6),    -- theoretical min float
  -- Pattern/paint seed data
  add column if not exists has_patterns       boolean default false,  -- does this skin have valuable patterns?
  add column if not exists pattern_count      int,             -- distinct patterns tracked by CSFloat
  add column if not exists top_pattern_premium_pct numeric(7,3),  -- highest pattern premium %
  -- Existence / total supply signals
  add column if not exists total_float_db_count int,           -- total items CSFloat has indexed
  add column if not exists market_hash_count  int,             -- Steam's total listing count (approximate)
  -- Volume across all sources
  add column if not exists volume_buff_24h    int,
  add column if not exists volume_steam_30d   int,             -- Steam's 30-day sale count
  -- Extended trend data
  add column if not exists price_90d_avg      numeric(12,2),
  add column if not exists price_90d_change_pct numeric(7,3),
  add column if not exists price_all_time_high  numeric(12,2),
  add column if not exists price_all_time_low   numeric(12,2);

-- ââ New table: steam_order_history ââââââââââââââââââââââââ
-- Stores buy/sell order snapshots over time for charting
create table if not exists public.steam_order_history (
  id              bigserial primary key,
  item_id         text not null references public.items(id) on delete cascade,
  snapped_at      date not null default current_date,
  -- Order book
  buy_orders      int,
  sell_orders     int,
  highest_buy     numeric(12,2),
  lowest_sell     numeric(12,2),
  spread_pct      numeric(7,3),
  -- Volume
  sales_24h       int,
  sales_7d        int,
  -- Price at time of snapshot
  price_usd       numeric(12,2),
  unique(item_id, snapped_at)
);
create index soh_item_date_idx on public.steam_order_history(item_id, snapped_at desc);

-- ââ New table: pattern_catalog ââââââââââââââââââââââââââââ
-- Named patterns with their paint_seed values and premiums
create table if not exists public.pattern_catalog (
  id              bigserial primary key,
  item_id         text not null references public.items(id) on delete cascade,
  paint_seed      int not null,             -- 0-999
  pattern_name    text,                     -- "Blue Gem", "Fade 100%", "Case Hardened Blue", etc.
  tier            text,                     -- "S", "A", "B", "C" tier
  premium_pct     numeric(8,2),             -- % premium over median price
  color_pct_blue  numeric(5,2),             -- for Case Hardened / Blue Gem
  color_pct_gold  numeric(5,2),
  fade_pct        numeric(5,2),             -- for Fades
  source          text default 'csfloat',
  updated_at      timestamptz default now(),
  unique(item_id, paint_seed)
);
create index pat_item_idx on public.pattern_catalog(item_id);
create index pat_tier_idx on public.pattern_catalog(tier, premium_pct desc);

-- ââ New table: float_distribution ââââââââââââââââââââââââ
-- Float histogram for each item (how rare is a given float)
create table if not exists public.float_distribution (
  id          bigserial primary key,
  item_id     text not null references public.items(id) on delete cascade,
  -- Float range bucket (0.00-0.01, 0.01-0.02, etc.)
  float_low   numeric(8,6) not null,
  float_high  numeric(8,6) not null,
  count       int not null default 0,       -- # of items CSFloat has seen in this range
  pct_of_all  numeric(6,3),                 -- % of total indexed items
  avg_price   numeric(12,2),               -- avg price of items in this float bucket
  updated_at  timestamptz default now(),
  unique(item_id, float_low, float_high)
);
create index fd_item_idx on public.float_distribution(item_id);

-- ââ New table: price_sources_raw âââââââââââââââââââââââââ
-- Raw prices from every source, stored separately for full history
create table if not exists public.price_sources_raw (
  id              bigserial primary key,
  item_id         text not null references public.items(id) on delete cascade,
  source          text not null,            -- 'buff' | 'steam' | 'skinport' | 'csfloat' | 'waxpeer' | 'cs_money' | 'pricempire' | 'dmarket'
  price           numeric(12,2),
  price_type      text default 'market',    -- 'market' | 'buy_order' | 'sell_order' | 'last_sale'
  volume_24h      int,
  snapped_at      date not null default current_date,
  unique(item_id, source, price_type, snapped_at)
);
create index psr_item_source_idx on public.price_sources_raw(item_id, source, snapped_at desc);
create index psr_source_date_idx on public.price_sources_raw(source, snapped_at desc);
