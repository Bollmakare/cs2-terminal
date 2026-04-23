-- ============================================================
-- CS2 Terminal â Migration 004: Fix & Complete
-- Fixes table name mismatches between API routes and DB.
-- Run AFTER 001, 002, 003.
-- ============================================================

-- ââ Fix 1: alerts API uses 'price_alerts' but table is 'alerts' ââ
-- Create a view so both names work, then add the missing columns
-- the API expects (threshold, notify_in_app, cooldown_min, note)
create or replace view public.price_alerts as
  select
    id,
    user_id,
    alert_type,
    item_id,
    item_name,
    -- Map old column names to what the API sends/expects
    target_price                                    as threshold,
    target_price,
    target_pct,
    target_score,
    ref_price,
    notify_inapp                                    as notify_in_app,
    notify_email,
    is_active,
    last_checked_at,
    triggered_at,
    trigger_value                                   as last_price_seen,
    trigger_count,
    cooldown_min,
    null::text                                      as note,
    created_at
  from public.alerts;

-- Make the view insertable
create or replace rule price_alerts_insert as
  on insert to public.price_alerts do instead
  insert into public.alerts (
    user_id, alert_type, item_id, item_name,
    target_price, target_pct, target_score, ref_price,
    notify_inapp, notify_email, is_active, cooldown_min
  ) values (
    new.user_id,
    new.alert_type,
    new.item_id,
    new.item_name,
    coalesce(new.threshold, new.target_price),
    new.target_pct,
    new.target_score,
    new.ref_price,
    coalesce(new.notify_in_app, true),
    coalesce(new.notify_email, false),
    coalesce(new.is_active, true),
    coalesce(new.cooldown_min, 60)
  );

create or replace rule price_alerts_update as
  on update to public.price_alerts do instead
  update public.alerts set
    is_active       = new.is_active,
    target_price    = coalesce(new.threshold, new.target_price),
    notify_inapp    = coalesce(new.notify_in_app, notify_inapp),
    notify_email    = coalesce(new.notify_email, notify_email)
  where id = old.id and user_id = old.user_id;

create or replace rule price_alerts_delete as
  on delete to public.price_alerts do instead
  delete from public.alerts where id = old.id and user_id = old.user_id;

-- ââ Fix 2: notifications API uses 'alert_notifications' but table is 'notifications' ââ
create or replace view public.alert_notifications as
  select
    id,
    user_id,
    alert_id,
    item_name,
    title || ': ' || body  as message,
    title,
    body,
  2 trigger_value           as price_at_trigger,
    is_read,
    created_at
  from public.notifications;

create or replace rule alert_notifications_insert as
  on insert to public.alert_notifications do instead
  insert into public.notifications (
    user_id, alert_id, item_name, title, body, trigger_value, is_read
  ) values (
    new.user_id,
    new.alert_id,
    new.item_name,
    coalesce(new.title, new.message, 'Alert'),
    coalesce(new.body, new.message, ''),
    new.price_at_trigger,
    coalesce(new.is_read, false)
  );

create or replace rule alert_notifications_update as
  on update to public.alert_notifications do instead
  update public.notifications set is_read = new.is_read where id = old.id;

create or replace rule alert_notifications_delete as
  on delete to public.alert_notifications do instead
  delete from public.notifications where id = old.id;

-- ââ Ensure cases_data RLS is enabled ââââââââââââââââââââââ
-- (cases_data has no user_id â it's public catalog data, read-only for all users)
alter table public.cases_data enable row level security;
drop policy if exists "cases_public_read" on public.cases_data;
create policy "cases_public_read" on public.cases_data
  for select using (true);
drop policy if exists "cases_service_write" on public.cases_data;
create policy "cases_service_write" on public.cases_data
  for all using (auth.role() = 'service_role');

-- ââ Ensure market_index RLS ââââââââââââââââââââââââââââââââ
alter table public.market_index enable row level security;
drop policy if exists "market_index_public_read" on public.market_index;
create policy "market_index_public_read" on public.market_index
  for select using (true);
drop policy if exists "market_index_service_write" on public.market_index;
create policy "market_index_service_write" on public.market_index
  for all using (auth.role() = 'service_role');

-- ââ Ensure scanner_cache RLS âââââââââââââââââââââââââââââââ
alter table public.scanner_cache enable row level security;
drop policy if exists "scanner_public_read" on public.scanner_cache;
create policy "scanner_public_read" on public.scanner_cache
  for select using (true);
drop policy if exists "scanner_service_write" on public.scanner_cache;
create policy "scanner_service_write" on public.scanner_cache
  for all using (auth.role() = 'service_role');

-- ââ Ensure portfolio_risk_metrics RLS âââââââââââââââââââââ
-- (already set in 003, but make idempotent)
alter table public.portfolio_risk_metrics enable row level security;
drop policy if exists "risk_own" on public.portfolio_risk_metrics;
create policy "risk_own" on public.portfolio_risk_metrics
  for all using (auth.uid() = user_id);

-- ââ Ensure tradeup_contracts RLS ââââââââââââââââââââââââââ
alter table public.tradeup_contracts enable row level security;
drop policy if exists "tradeup_own" on public.tradeup_contracts;
create policy "tradeup_own" on public.tradeup_contracts
  for all using (auth.uid() = user_id);

-- ââ Ensure float_analysis is readable âââââââââââââââââââââ
alter table public.float_analysis enable row level security;
drop policy if exists "float_public_read" on public.float_analysis;
create policy "float_public_read" on public.float_analysis
  for select using (true);
drop policy if exists "float_service_write" on public.float_analysis;
create policy "float_service_write" on public.float_analysis
  for all using (auth.role() = 'service_role');

-- ââ Realtime: enable publications for live dashboard ââââââ
-- These tables will broadcast changes via Supabase Realtime
-- Enable in Dashboard â Database â Replication, or via SQL:
begin;
  -- Add holdings to realtime (live P&L updates)
  alter publication supabase_realtime add table public.holdings;
  -- Add scanner_cache to realtime (live score updates)
  alter publication supabase_realtime add table public.scanner_cache;
  -- Add notifications to realtime (live alert bell)
  alter publication supabase_realtime add table public.notifications;
  -- Add price_history (market index updates)
  alter publication supabase_realtime add table public.price_history;
exception when others then
  -- Ignore if already added (idempotent)
  null;
end;

-- ââ Supabase Realtime Row Filter ââââââââââââââââââââââââââ
-- Note: For holdings and notifications, row-level filtering
-- is handled by Supabase RLS. Enable "row level security"
-- in Dashboard â Database â Replication for each table.

comment on view public.price_alerts is
  'Compatibility view: maps "alerts" table to the name used by /api/alerts/* routes';
comment on view public.alert_notifications is
  'Compatibility view: maps "notifications" table to the name used by /api/alerts/notifications/* routes';
