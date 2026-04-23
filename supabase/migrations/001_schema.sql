-- ============================================================
-- CS2 Terminal â Full Schema v2
-- Run in: Supabase Dashboard â SQL Editor â New Query
-- ============================================================

-- Extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pg_trgm"; -- for fast text search on items

-- âââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
-- PROFILES
-- âââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
create table if not exists public.profiles (
  id              uuid references auth.users on delete cascade primary key,
  email           text,
  display_name    text,
  avatar_url      text,
  -- Steam identity (populated after Steam OpenID login)
  steam_id        text unique,       -- SteamID64, e.g. "76561197995388346"
  steam_username  text,
  steam_avatar    text,
  -- Auth method
  auth_provider   text default 'email', -- 'email' | 'steam'
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);
alter table public.profiles enable row level security;
create policy "profiles_own" on public.profiles for all using (auth.uid() = id);
create index profiles_steam_id_idx on public.profiles(steam_id) where steam_id is not null;

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- âââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
-- USER SETTINGS
-- âââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
create table if not exists public.user_settings (
  user_id             uuid references auth.users on delete cascade primary key,
  -- Appearance
  theme               text default 'terminal',      -- 'terminal' | 'obsidian'
  accent              text default 'green',         -- 'green' | 'ember' | 'blue' | 'amber'
  density             text default 'comfortable',   -- 'comfortable' | 'compact'
  -- Market preferences
  currency            text default 'USD',
  default_market      text default 'skinstrack',   -- 'skinstrack' | 'skinport' | 'steam'
  -- Fee defaults (pct)
  fee_skinport        numeric(5,2) default 12.0,
  fee_steam           numeric(5,2) default 13.0,
  fee_csfloat         numeric(5,2) default 2.0,
  fee_buff163         numeric(5,2) default 2.5,
  -- Scanner preferences
  scanner_min_score   int default 60,              -- 0â100
  scanner_min_volume  int default 5,               -- min daily trades
  scanner_categories  text[] default '{rifle,sniper,pistol,knife,gloves}',
  updated_at          timestamptz default now()
);
alter table public.user_settings enable row level security;
create policy "settings_own" on public.user_settings for all using (auth.uid() = user_id);

-- âââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
-- ITEMS CATALOG
-- Seeded once, updated via cron. NOT user-specific.
-- âââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
create table if not exists public.items (
  id              text primary key,          -- slug: "ak-47-redline-ft"
  market_hash_name text not null unique,     -- exact Steam name: "AK-47 | Redline (Field-Tested)"
  -- Parsed fields
  weapon_type     text not null,             -- "AK-47", "AWP", "Karambit", etc.
  skin_name       text not null,             -- "Redline", "Dragon Lore", etc.
  condition       text,                      -- "FN"|"MW"|"FT"|"WW"|"BS"|null (cases have null)
  category        text not null,             -- "rifle"|"sniper"|"pistol"|"knife"|"gloves"|"case"|"sticker"|"other"
  rarity          text,                      -- "Consumer Grade"..."Covert"..."Contraband"
  rarity_color    text,                      -- hex color from Steam
  collection      text,                      -- case/collection name
  is_stattrak     boolean default false,
  is_souvenir     boolean default false,
  -- Pricing (updated by cron)
  price_usd       numeric(12,2),             -- Skinstrack best price
  price_steam     numeric(12,2),             -- Steam Community Market
  price_buff      numeric(12,2),             -- Buff163 (via Skinstrack)
  price_skinport  numeric(12,2),             -- Skinport min
  price_csfloat   numeric(12,2),             -- CSFloat median
  price_lis_skins numeric(12,2),             -- Lis-skins (via Skinstrack)
  -- Arbitrage (updated by cron)
  arb_spread_pct  numeric(7,3),              -- max spread across markets in %
  arb_buy_market  text,                      -- cheapest market
  arb_sell_market text,                      -- most expensive market
  -- Liquidity
  volume_24h      int,                       -- estimated daily trades (Skinstrack)
  volume_7d       int,
  -- Price trend
  price_7d_avg    numeric(12,2),
  price_30d_avg   numeric(12,2),
  price_7d_change_pct  numeric(7,3),
  price_30d_change_pct numeric(7,3),
  -- Metadata
  icon_url        text,                      -- Steam CDN URL
  inspect_link    text,
  updated_at      timestamptz default now(),
  created_at      timestamptz default now()
);
-- Fast search indexes
create index if not exists items_category_idx on public.items(category);
create index if not exists items_price_idx    on public.items(price_usd) where price_usd is not null;
create index if not exists items_arb_idx      on public.items(arb_spread_pct desc nulls last) where arb_spread_pct is not null;
create index if not exists items_name_trgm    on public.items using gin(market_hash_name gin_trgm_ops);
create index if not exists items_weapon_idx   on public.items(weapon_type);

-- âââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
-- PORTFOLIOS
-- âââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
create table if not exists public.portfolios (
  id          uuid default uuid_generate_v4() primary key,
  user_id     uuid references auth.users on delete cascade not null,
  name        text not null default 'Main',
  description text,
  is_default  boolean default false,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
alter table public.portfolios enable row level security;
create policy "portfolios_own" on public.portfolios for all using (auth.uid() = user_id);

-- âââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
-- HOLDINGS
-- âââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
create table if not exists public.holdings (
  id              uuid default uuid_generate_v4() primary key,
  portfolio_id    uuid references public.portfolios on delete cascade not null,
  user_id         uuid references auth.users on delete cascade not null,
  -- Item reference
  item_id         text references public.items(id),  -- null for custom items
  -- Denormalized for display (custom items + resilience)
  item_name       text not null,
  item_condition  text,
  item_category   text,
  is_stattrak     boolean default false,
  -- Position
  quantity        int not null default 1 check (quantity > 0),
  cost_basis      numeric(12,2) not null default 0,  -- per unit
  acquired_at     date not null default current_date,
  -- Item attributes
  float_value     numeric(8,6),
  pattern_id      int,    -- paint_seed
  -- Organization
  storage_unit    text,
  group_label     text,
  note            text,
  -- Stickers: [{slot,name,price,wear}]
  stickers        jsonb default '[]'::jsonb,
  -- Cached current price (refreshed on price update)
  last_price      numeric(12,2),
  price_source    text default 'skinstrack',
  price_updated_at timestamptz,
  -- Steam asset ID (from inventory import)
  steam_asset_id  text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);
alter table public.holdings enable row level security;
create policy "holdings_own" on public.holdings for all using (auth.uid() = user_id);
create index holdings_portfolio_idx on public.holdings(portfolio_id);
create index holdings_item_idx      on public.holdings(item_id) where item_id is not null;
create index holdings_user_idx      on public.holdings(user_id);

-- âââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
-- TRANSACTIONS (immutable ledger)
-- âââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
create table if not exists public.transactions (
  id              uuid default uuid_generate_v4() primary key,
  portfolio_id    uuid references public.portfolios on delete cascade not null,
  user_id         uuid references auth.users on delete cascade not null,
  holding_id      uuid references public.holdings on delete set null,
  type            text not null check (type in ('buy', 'sell', 'transfer_in', 'transfer_out')),
  item_name       text not null,
  item_condition  text,
  quantity        int not null default 1,
  price_per_unit  numeric(12,2) not null,
  -- Sell-specific
  fee_platform    text,
  fee_pct         numeric(5,2),
  fee_amount      numeric(12,2),
  gross_proceeds  numeric(12,2),
  net_proceeds    numeric(12,2),
  cost_basis      numeric(12,2),  -- cost per unit at time of sale
  realized_pnl    numeric(12,2),
  note            text,
  transacted_at   date not null default current_date,
  created_at      timestamptz default now()
);
alter table public.transactions enable row level security;
create policy "transactions_own" on public.transactions for all using (auth.uid() = user_id);
create index txn_portfolio_idx on public.transactions(portfolio_id);
create index txn_user_date_idx on public.transactions(user_id, transacted_at desc);

-- âââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
-- PRICE HISTORY (per-item daily snapshots from Skinstrack)
-- âââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
create table if not exists public.price_history (
  id          bigserial primary key,
  item_id     text not null references public.items(id) on delete cascade,
  -- Prices across markets
  price_usd       numeric(12,2),
  price_steam     numeric(12,2),
  price_buff      numeric(12,2),
  price_skinport  numeric(12,2),
  -- Volume
  volume_24h  int,
  -- Arbitrage snapshot
  arb_spread_pct numeric(7,3),
  -- Source + timing
  source      text not null default 'skinstrack',
  snapped_at  date not null default current_date,
  created_at  timestamptz default now(),
  unique(item_id, snapped_at, source)
);
create index ph_item_date_idx on public.price_history(item_id, snapped_at desc);
create index ph_date_idx      on public.price_history(snapped_at desc);

-- âââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
-- PORTFOLIO SNAPSHOTS (daily NAV history)
-- âââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
create table if not exists public.portfolio_snapshots (
  id              bigserial primary key,
  portfolio_id    uuid references public.portfolios on delete cascade not null,
  user_id         uuid references auth.users on delete cascade not null,
  total_value     numeric(14,2) not null,
  cost_basis      numeric(14,2) not null,
  unrealized_pnl  numeric(14,2),
  realized_pnl    numeric(14,2) default 0,
  position_count  int,
  snapped_at      date not null default current_date,
  created_at      timestamptz default now(),
  unique(portfolio_id, snapped_at)
);
alter table public.portfolio_snapshots enable row level security;
create policy "snapshots_own" on public.portfolio_snapshots for all using (auth.uid() = user_id);
create index snap_pf_date_idx on public.portfolio_snapshots(portfolio_id, snapped_at desc);

-- âââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
-- WATCHLIST
-- âââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
create table if not exists public.watchlist (
  id          uuid default uuid_generate_v4() primary key,
  user_id     uuid references auth.users on delete cascade not null,
  item_id     text references public.items(id) on delete cascade,
  item_name   text not null,
  note        text,
  alert_buy   numeric(12,2),   -- alert when price <= this
  alert_sell  numeric(12,2),   -- alert when price >= this
  added_at    timestamptz default now(),
  unique(user_id, item_id)
);
alter table public.watchlist enable row level security;
create policy "watchlist_own" on public.watchlist for all using (auth.uid() = user_id);

-- âââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
-- SCANNER RESULTS CACHE (materialized for fast reads)
-- Updated by cron after each price refresh
-- âââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
create table if not exists public.scanner_cache (
  item_id             text primary key references public.items(id) on delete cascade,
  -- Scores (0â100)
  score_total         int not null default 0,
  score_price_vs_avg  int default 0,   -- price vs 7/30d avg
  score_arb           int default 0,   -- cross-market spread
  score_volume        int default 0,   -- liquidity
  score_trend         int default 0,   -- momentum
  score_float         int default 0,   -- float premium signal
  -- Human-readable signals
  signals             jsonb default '[]'::jsonb,
  verdict             text,            -- "Strong Buy" | "Buy" | "Watch" | "Fair" | "Avoid"
  -- Snapshot of key data at time of scoring
  price_usd           numeric(12,2),
  arb_spread_pct      numeric(7,3),
  volume_24h          int,
  price_vs_7d_pct     numeric(7,3),
  price_vs_30d_pct    numeric(7,3),
  -- Metadata
  scored_at           timestamptz default now()
);
create index scanner_score_idx    on public.scanner_cache(score_total desc);
create index scanner_verdict_idx  on public.scanner_cache(verdict);
create index scanner_arb_idx      on public.scanner_cache(arb_spread_pct desc) where arb_spread_pct is not null;

-- âââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
-- SAVED SCANNER FILTERS (per user)
-- âââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
create table if not exists public.saved_filters (
  id          uuid default uuid_generate_v4() primary key,
  user_id     uuid references auth.users on delete cascade not null,
  name        text not null,
  -- Filter state stored as JSON
  filters     jsonb not null default '{}'::jsonb,
  is_default  boolean default false,
  created_at  timestamptz default now()
);
alter table public.saved_filters enable row level security;
create policy "filters_own" on public.saved_filters for all using (auth.uid() = user_id);

-- âââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
-- UPDATED_AT triggers
-- âââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger set_profiles_updated   before update on public.profiles   for each row execute procedure public.set_updated_at();
create trigger set_portfolios_updated before update on public.portfolios  for each row execute procedure public.set_updated_at();
create trigger set_holdings_updated   before update on public.holdings    for each row execute procedure public.set_updated_at();
create trigger set_items_updated      before update on public.items       for each row execute procedure public.set_updated_at();

-- âââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
-- BOOTSTRAP: create default portfolio + settings on profile create
-- âââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
create or replace function public.bootstrap_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.portfolios (user_id, name, is_default)
  values (new.id, 'Main', true)
  on conflict do nothing;

  insert into public.user_settings (user_id)
  values (new.id)
  on conflict do nothing;

  return new;
end;
$$;
drop trigger if exists on_profile_created on public.profiles;
create trigger on_profile_created
  after insert on public.profiles
  for each row execute procedure public.bootstrap_new_user();

-- âââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
-- HELPER FUNCTION: update holdings prices from items table
-- Called after each price refresh
-- âââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
create or replace function public.sync_holding_prices()
returns void language plpgsql security definer as $$
begin
  update public.holdings h
  set
    last_price = i.price_usd,
    price_source = 'skinstrack',
    price_updated_at = now()
  from public.items i
  where h.item_id = i.id
    and i.price_usd is not null;
end;
$$;
