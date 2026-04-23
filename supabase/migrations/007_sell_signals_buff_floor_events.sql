-- ============================================================
-- CS2 Terminal â Migration 007: Sell Signals, Buff Floor, Event Calendar
-- Run AFTER migrations 001â006.
-- ============================================================

-- ââ Buff buy order floor on items ââââââââââââââââââââââââ
-- buff_price = what sellers are asking (ask)
-- buff_buy_order = what buyers are willing to pay (bid = true floor)
alter table public.items
  add column if not exists buff_buy_order    numeric(12,2),  -- highest Buff buy order (bid)
  add column if not exists buff_bid_ask_gap  numeric(7,3),   -- (buff_price - buff_buy_order) / buff_buy_order * 100
  add column if not exists steam_buy_order   numeric(12,2);  -- Steam highest buyer price

-- ââ Sell signal cache per holding ââââââââââââââââââââââââ
-- Computed alongside scanner scores, one row per holding
create table if not exists public.sell_signals (
  holding_id      uuid primary key references public.holdings(id) on delete cascade,
  user_id         uuid references auth.users on delete cascade not null,
  -- Signal strength
  urgency         text not null default 'low',  -- 'high' | 'medium' | 'low'
  sell_score      int  not null default 0,       -- 0-100 how strongly to consider selling
  -- Trigger reasons (array of signal objects)
  reasons         jsonb default '[]'::jsonb,
  -- Snapshot data
  current_price   numeric(12,2),
  cost_basis      numeric(12,2),
  unrealized_pct  numeric(7,3),
  days_held       int,
  -- Metadata
  computed_at     timestamptz default now()
);
create index ss_user_urgency on public.sell_signals(user_id, urgency, sell_score desc);
create index ss_computed_at  on public.sell_signals(computed_at desc);

-- ââ Event calendar ââââââââââââââââââââââââââââââââââââââââ
-- CS2 market events that move prices: Majors, operations, Steam sales
create table if not exists public.market_events (
  id              bigserial primary key,
  event_type      text not null,    -- 'major' | 'operation' | 'case_release' | 'steam_sale' | 'patch' | 'other'
  title           text not null,
  description     text,
  starts_at       date not null,
  ends_at         date,
  -- Price impact metadata
  expected_impact text,             -- 'bullish' | 'bearish' | 'mixed' | 'neutral'
  affected_categories text[],       -- ['knife','rifle','case','souvenir'] etc.
  impact_magnitude int,             -- 1-5 scale: 1=minor, 5=major market move
  -- Source
  source          text default 'manual',   -- 'manual' | 'valve_rss' | 'community'
  url             text,
  is_confirmed    boolean default false,   -- false = rumored/speculative
  created_at      timestamptz default now()
);
create index me_starts_idx on public.market_events(starts_at);
create index me_type_idx   on public.market_events(event_type, starts_at);

-- ââ Seed known 2025-2026 CS2 events ââââââââââââââââââââââ
insert into public.market_events
  (event_type, title, description, starts_at, ends_at, expected_impact, affected_categories, impact_magnitude, source, is_confirmed)
values
  -- PGL Bucharest 2025 Major
  ('major', 'PGL CS2 Major Bucharest 2025',
   'CS2 Major in Bucharest. Souvenir packages release during play-offs. Capsule prices spike on team performance.',
   '2025-05-05', '2025-05-25', 'mixed',
   ARRAY['souvenir','sticker','case'], 4, 'manual', true),

  -- BLAST Spring 2025
  ('major', 'BLAST Spring Major 2025',
   'BLAST Premier Spring Final. High viewership = sticker demand.',
   '2025-06-14', '2025-06-22', 'bullish',
   ARRAY['sticker','souvenir'], 2, 'manual', false),

  -- Steam Summer Sale (historical: late June)
  ('steam_sale', 'Steam Summer Sale 2025',
   'Historical: prices drop 8-15% as players liquidate skins to buy games. Good time to buy, bad time to sell.',
   '2025-06-26', '2025-07-10', 'bearish',
   ARRAY['rifle','pistol','knife','gloves'], 3, 'manual', false),

  -- Steam Autumn Sale (historical: late November)
  ('steam_sale', 'Steam Autumn Sale 2025',
   'Second largest Steam sale of the year. Same liquidation effect as Summer Sale.',
   '2025-11-26', '2025-12-03', 'bearish',
   ARRAY['rifle','pistol','knife','gloves'], 3, 'manual', false),

  -- IEM Cologne 2025
  ('major', 'IEM Cologne 2025',
   'One of CS2''s most watched events. Cologne autograph capsules historically high demand.',
   '2025-07-13', '2025-07-27', 'mixed',
   ARRAY['sticker','souvenir'], 3, 'manual', false),

  -- Possible operation (speculative - operations every ~8-12 months)
  ('operation', 'CS2 Operation 2025 (speculative)',
   'Based on historical cadence, a new operation is possible in late 2025. New collections dump prices on similar existing skins. New case items spike initially then correct.',
   '2025-09-01', '2025-12-31', 'mixed',
   ARRAY['rifle','pistol','knife','gloves','case'], 5, 'manual', false),

  -- BLAST Fall Major 2025 (speculative)
  ('major', 'CS2 Fall Major 2025 (speculative)',
   'Second Major of 2025 expected Q4. Location TBD.',
   '2025-10-15', '2025-11-05', 'mixed',
   ARRAY['souvenir','sticker'], 4, 'manual', false),

  -- Steam Winter Sale (historical: late December)
  ('steam_sale', 'Steam Winter Sale 2025',
   'Largest Steam sale. Significant skin liquidation. Best buying opportunity of the year for patient investors.',
   '2025-12-19', '2026-01-02', 'bearish',
   ARRAY['rifle','pistol','knife','gloves','case'], 4, 'manual', false)

on conflict do nothing;
