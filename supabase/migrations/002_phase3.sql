-- ============================================================
-- CS2 Terminal â Schema v3 additions
-- Run AFTER 001_schema.sql
-- ============================================================

-- âââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
-- CASES DATA
-- Seeded + updated by cron. Drop rates, EV, supply signals.
-- âââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
create table if not exists public.cases_data (
  id                text primary key,              -- slug e.g. 'case-recoil'
  name              text not null,                 -- 'Recoil Case'
  market_hash_name  text not null,                 -- Steam name
  is_active         boolean default true,          -- still in drop pool
  release_date      date,
  -- Current pricing (synced from items table)
  price_usd         numeric(10,2),
  price_7d_avg      numeric(10,2),
  price_30d_avg     numeric(10,2),
  price_7d_change   numeric(7,3),
  -- Supply/demand signals
  volume_24h        int,
  -- EV data (static, manually curated + editable)
  key_price_usd     numeric(8,2) default 2.49,
  -- Expected value per rarity tier (avg item value Ã drop rate)
  ev_milspec        numeric(10,4),  -- 79.92% drop rate
  ev_restricted     numeric(10,4),  -- 15.98%
  ev_classified     numeric(10,4),  -- 3.20%
  ev_covert         numeric(10,4),  -- 0.64%
  ev_rare_special   numeric(10,4),  -- 0.26% (knife/glove)
  ev_total          numeric(10,4),  -- sum of all tiers
  -- Computed from current prices
  roi_pct           numeric(7,3),
  break_even_case   numeric(10,2),
  -- Skin list metadata
  covert_names      text[],
  rare_names        text[],
  -- Icon
  icon_url          text,
  updated_at        timestamptz default now()
);
create index if not exists cases_active_idx on public.cases_data(is_active, roi_pct desc nulls last);

-- âââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
-- ALERTS (persistent price + scanner alerts)
-- âââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
create table if not exists public.alerts (
  id              uuid default uuid_generate_v4() primary key,
  user_id         uuid references auth.users on delete cascade not null,
  -- What to watch
  alert_type      text not null check (alert_type in (
    'price_below',    -- item price drops below target
    'price_above',    -- item price rises above target
    'price_pct_drop', -- item price drops by X% from ref
    'price_pct_rise', -- item price rises by X% from ref
    'scanner_score',  -- item hits scanner score threshold
    'case_roi',       -- case ROI crosses threshold
    'holding_pnl'     -- holding P&L crosses threshold
  )),
  -- Item reference
  item_id         text references public.items(id) on delete cascade,
  item_name       text not null,
  -- Threshold values
  target_price    numeric(12,2),
  target_pct      numeric(7,2),
  target_score    int,ld
  ref_price       numeric(12,2),   -- reference price for pct alerts
  -- Delivery
  notify_inapp    boolean default true,
  notify_email    boolean default false,
  -- State
  is_active       boolean default true,
  last_checked_at timestamptz,
  triggered_at    timestamptz,
  trigger_value   numeric(12,2),   -- price/score when triggered
  trigger_count   int default 0,   -- how many times fired
  -- After triggering, auto-pause for this many minutes (0 = fire once)
  cooldown_min    int default 60,
  created_at      timestamptz default now()
);
alter table public.alerts enable row level security;
create policy "alerts_own" on public.alerts for all using (auth.uid() = user_id);
create index alerts_user_active_idx on public.alerts(user_id, is_active) where is_active = true;
create index alerts_item_idx on public.alerts(item_id) where item_id is not null;

-- âââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
-- ALERT NOTIFICATIONS (in-app notification log)
-- âââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
create table if not exists public.notifications (
  id          uuid default uuid_generate_v4() primary key,
  user_id     uuid references auth.users on delete cascade not null,
  alert_id    uuid references public.alerts on delete cascade,
  title       text not null,
  body        text not null,
  item_name   text,
  trigger_value numeric(12,2),
  is_read     boolean default false,
  created_at  timestamptz default now()
);
alter table public.notifications enable row level security;
create policy "notifications_own" on public.notifications for all using (auth.uid() = user_id);
create index notif_user_unread_idx on public.notifications(user_id, is_read, created_at desc);

-- âââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
-- NEWS CACHE (RSS/scrape cache to avoid hammering sources)
-- âââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
create table if not exists public.news_cache (
  id          text primary key,           -- hash of URL or GUID
  source      text not null,             -- 'valve_blog' | 'cs2_subreddit' | 'manual'
  title       text not null,
  summary     text,
  url         text,
  published_at timestamptz,
  tags        text[] default '{}',       -- ['patch', 'operation', 'major', 'case', 'collection']
  fetched_at  timestamptz default now()
);
create index news_published_idx on public.news_cache(published_at desc);
create index news_source_idx    on public.news_cache(source, published_at desc);

-- âââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
-- WHAT-IF SCENARIOS (saved portfolio what-if states)
-- âââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
create table if not exists public.whatif_scenarios (
  id            uuid default uuid_generate_v4() primary key,
  user_id       uuid references auth.users on delete cascade not null,
  portfolio_id  uuid references public.portfolios on delete cascade not null,
  name          text not null,
  -- Overrides: {item_id: price_override}
  price_overrides jsonb not null default '{}'::jsonb,
  created_at    timestamptz default now()
);
alter table public.whatif_scenarios enable row level security;
create policy "whatif_own" on public.whatif_scenarios for all using (auth.uid() = user_id);

-- âââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
-- ALERT CHECK FUNCTION (called by cron or edge function)
-- Checks all active alerts, inserts notifications when triggered
-- âââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
create or replace function public.check_alerts()
returns int language plpgsql security definer as $$
declare
  alert_rec   record;
  current_price numeric;
  triggered   boolean;
  notif_title text;
  notif_body  text;
  fired_count int := 0;
begin
  for alert_rec in
    select a.*, i.price_usd, i.market_hash_name
    from public.alerts a
    left join public.items i on i.id = a.item_id
    where a.is_active = true
      and (
        a.last_checked_at is null
        or a.last_checked_at < now() - interval '5 minutes'
      )
  loop
    current_price := alert_rec.price_usd;
    triggered := false;
    notif_title := '';
    notif_body := '';

    if current_price is null then continue; end if;

    case alert_rec.alert_type
      when 'price_below' then
        if alert_rec.target_price is not null and current_price <= alert_rec.target_price then
          triggered := true;
          notif_title := 'ð¢ Buy alert: ' || alert_rec.item_name;
          notif_body  := 'Price hit $' || round(current_price, 2)::text || ' (target â¤ $' || round(alert_rec.target_price, 2)::text || ')';
        end if;
      when 'price_above' then
        if alert_rec.target_price is not null and current_price >= alert_rec.target_price then
          triggered := true;
          notif_title := 'ð´ Sell alert: ' || alert_rec.item_name;
          notif_body  := 'Price hit $' || round(current_price, 2)::text || ' (target â¥ $' || round(alert_rec.target_price, 2)::text || ')';
        end if;
      when 'price_pct_drop' then
        if alert_rec.ref_price is not null and alert_rec.target_pct is not null then
          declare drop_pct numeric;
          begin
            drop_pct := ((alert_rec.ref_price - current_price) / alert_rec.ref_price) * 100;
            if drop_pct >= alert_rec.target_pct then
              triggered := true;
              notif_title := 'ð Price drop: ' || alert_rec.item_name;
              notif_body  := 'Down ' || round(drop_pct, 1)::text || '% from $' || round(alert_rec.ref_price, 2)::text;
            end if;
          end;
        end if;
      else null;
    end case;

    -- Update last_checked_at regardless
    update public.alerts set last_checked_at = now() where id = alert_rec.id;

    -- If triggered and past cooldown
    if triggered then
      if alert_rec.triggered_at is null
         or alert_rec.triggered_at < now() - (alert_rec.cooldown_min || ' minutes')::interval
      then
        -- Insert notification
        insert into public.notifications (user_id, alert_id, title, body, item_name, trigger_value)
        values (alert_rec.user_id, alert_rec.id, notif_title, notif_body, alert_rec.item_name, current_price);

        -- Update alert state
        update public.alerts
        set triggered_at = now(),
            trigger_value = current_price,
            trigger_count = trigger_count + 1
        where id = alert_rec.id;

        fired_count := fired_count + 1;
      end if;
    end if;
  end loop;

  return fired_count;
end;
$$;

-- âââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
-- SEED: cases data with real drop rates and EV
-- âââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
insert into public.cases_data (id, name, market_hash_name, is_active, release_date, key_price_usd,
  ev_milspec, ev_restricted, ev_classified, ev_covert, ev_rare_special,
  covert_names, rare_names) values
-- Active cases (in current drop pool as of 2024)
('case-kilowatt',   'Kilowatt Case',          'Kilowatt Case',            true, '2024-02-06', 2.49, 0.12, 0.55, 2.40, 22.00, 95.00,  ARRAY['M4A1-S | Emphorosaur-S','AK-47 | Inheritance'],                       ARRAY['Karambit','Bayonet','Flip Knife','Gut Knife','M9 Bayonet','Shadow Daggers','Falchion Knife','Bowie Knife','Butterfly Knife','Huntsman Knife','Stiletto Knife','Ursus Knife','Navaja Knife','Talon Knife','Classic Knife','Paracord Knife','Survival Knife','Nomad Knife','Skeleton Knife']),
('case-gallery',    'Gallery Case',           'Gallery Case',             true, '2024-09-30', 2.49, 0.10, 0.45, 2.10, 18.00, 85.00,  ARRAY['USP-S | Printstream','AWP | Chromatic Aberration'],                    ARRAY['Karambit','Bayonet','Flip Knife','Gut Knife','M9 Bayonet']),
('case-fever',      'CS2 Fever Case',         'CS2 Fever Case',           true, '2025-01-22', 2.49, 0.11, 0.50, 2.20, 19.00, 88.00,  ARRAY['AK-47 | Nightwish','M4A4 | Poly Mag'],                                 ARRAY['Karambit','Bayonet','Flip Knife','Gut Knife','M9 Bayonet']),
('case-recoil',     'Recoil Case',            'Recoil Case',              true, '2022-07-01', 2.49, 0.09, 0.38, 1.60, 13.50, 68.00,  ARRAY['AK-47 | Ice Coaled','Desert Eagle | Spray-Paint'],                     ARRAY['Karambit','Bayonet','Flip Knife','Gut Knife','M9 Bayonet']),
('case-revolution', 'Revolution Case',        'Revolution Case',          true, '2023-02-09', 2.49, 0.10, 0.42, 1.75, 14.50, 72.00,  ARRAY['AK-47 | Head Shot','M4A4 | Temukau'],                                   ARRAY['Karambit','Bayonet','Flip Knife','Gut Knife','M9 Bayonet']),
('case-snakebite',  'Snakebite Case',         'Snakebite Case',           true, '2021-05-03', 2.49, 0.08, 0.35, 1.45, 11.50, 62.00,  ARRAY['M4A4 | In Living Color','Glock-18 | Snack Attack'],                    ARRAY['Classic Knife','Paracord Knife','Survival Knife','Nomad Knife','Skeleton Knife']),
('case-fracture',   'Fracture Case',          'Fracture Case',            true, '2020-08-06', 2.49, 0.09, 0.38, 1.55, 12.00, 65.00,  ARRAY['AK-47 | Legion of Anubis','Desert Eagle | Printstream'],               ARRAY['Karambit','Bayonet','Flip Knife','Gut Knife','M9 Bayonet']),
('case-riptide',    'Riptide Case',           'Riptide Case',             true, '2021-09-21', 2.49, 0.09, 0.38, 1.58, 12.50, 67.00,  ARRAY['AK-47 | Hydroponic','M4A1-S | Rumble'],                                ARRAY['Karambit','Bayonet','Flip Knife','Gut Knife','M9 Bayonet']),
-- Discontinued high-value
('case-bravo',      'Operation Bravo Case',   'Operation Bravo Case',     false,'2013-09-19', 2.49, 1.20, 4.80, 19.20, 152.00, 2400.00, ARRAY['AK-47 | Fire Serpent','M4A4 | Howl'],                      2        ARRAY['Karambit','Bayonet','Flip Knife','Gut Knife','M9 Bayonet']),
('case-glove',      'Glove Case',             'Glove Case',               false,'2016-11-28', 2.49, 0.45, 1.80, 7.50, 60.00, 920.00,  ARRAY['AK-47 | Bloodsport','M4A1-S | Master Piece'],                          ARRAY['Bloodhound Gloves','Hand Wraps','Moto Gloves','Specialist Gloves','Sport Gloves','Driver Gloves']),
('case-hydra',      'Operation Hydra Case',   'Operation Hydra Case',     false,'2017-05-23', 2.49, 0.38, 1.52, 6.30, 50.00, 780.00,  ARRAY['AK-47 | Neon Revolution','P250 | See Ya Later'],                        ARRAY['Karambit','Bayonet','Flip Knife','Gut Knife','M9 Bayonet'])
on conflict (id) do update set
  ev_milspec = excluded.ev_milspec,
  ev_restricted = excluded.ev_restricted,
  ev_classified = excluded.ev_classified,
  ev_covert = excluded.ev_covert,
  ev_rare_special = excluded.ev_rare_special,
  covert_names = excluded.covert_names,
  rare_names = excluded.rare_names;

-- Compute EV totals
update public.cases_data set
  ev_total = (ev_milspec * 0.7992) + (ev_restricted * 0.1598) + (ev_classified * 0.032) + (ev_covert * 0.0064) + (ev_rare_special * 0.0026),
  updated_at = now();

-- âââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
-- SEED: static news items (bootstrap â real RSS added later)
-- âââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
insert into public.news_cache (id, source, title, summary, url, published_at, tags) values
('valve-cs2-launch',      'valve_blog',  'CS2 officially replaces CS:GO',               'Counter-Strike 2 released as free update, replacing CS:GO entirely.',          'https://www.counter-strike.net/cs2', '2023-09-27 00:00:00+00', ARRAY['launch','patch']),
('valve-cs2-premier',     'valve_blog',  'Premier mode and ratings system introduced',  'New skill-based Premier mode with CS rating system launches with CS2.',        'https://www.counter-strike.net', '2023-09-27 00:00:00+00', ARRAY['patch','competitive']),
('case-kilowatt-release', 'valve_blog',  'Kilowatt Case now available',                 'New Kilowatt Case drops featuring AK-47 Inheritance and M4A1-S Emphorosaur.', 'https://www.counter-strike.net', '2024-02-06 00:00:00+00', ARRAY['case','collection']),
('gallery-case-2024',     'valve_blog',  'Gallery Case added to active drop pool',      'Gallery Case featuring new knife collection now drops in matches.',            'https://www.counter-strike.net', '2024-09-30 00:00:00+00', ARRAY['case']),
('fever-case-2025',       'valve_blog',  'CS2 Fever Case launches January 2025',        'New Fever Case featuring AK-47 Nightwish available in the item shop.',         'https://www.counter-strike.net', '2025-01-22 00:00:00+00', ARRAY['case']),
('rm-shanghai-2024',      'valve_blog',  'PGL Major Shanghai 2024 â $1.25M prize pool', 'PGL Shanghai Major set for September 2024 with record prize pool.',            'https://www.counter-strike.net', '2024-09-08 00:00:00+00', ARRAY['major','esports']),
('cs2-subticket',         'valve_blog',  'CS2 sub-tick update improves hit registration','Valve ships major netcode update improving hit reg and movement.',            'https://www.counter-strike.net', '2024-03-12 00:00:00+00', ARRAY['patch']),
('dust2-return',          'valve_blog',  'Dust2 returns to Active Duty pool',           'Classic map Dust2 returns with updated lighting and minor layout tweaks.',     'https://www.counter-strike.net', '2024-06-10 00:00:00+00', ARRAY['patch','map'])
on conflict (id) do nothing;
