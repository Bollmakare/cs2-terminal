-- ============================================================
-- CS2 Terminal â Migration 005: Automatic Price Refresh
-- Runs price refresh automatically via Supabase pg_cron.
-- This means data updates even if nobody visits the site.
--
-- REQUIREMENTS:
--   1. Enable the pg_cron extension in Supabase Dashboard:
--      Database â Extensions â search "pg_cron" â Enable
--   2. Enable the pg_net extension (for HTTP calls):
--      Database â Extensions â search "pg_net" â Enable
--   3. Set your app URL and cron secret as Supabase secrets:
--      Run these in SQL Editor (replace with real values):
--        select vault.create_secret('app_url', 'https://your-app.vercel.app');
--        select vault.create_secret('cron_secret', 'your-cron-secret-value');
--
-- Run AFTER migrations 001â004.
-- ============================================================

-- ââ Create the refresh function âââââââââââââââââââââââââââ
-- This function calls your Next.js /api/prices/refresh endpoint
-- directly from inside Supabase, using pg_net for HTTP.
create or replace function public.trigger_price_refresh()
returns void
language plpgsql
security definer
as $$
declare
  app_url    text;
  cron_sec   text;
  request_id bigint;
begin
  -- Get secrets from Supabase Vault
  begin
    select decrypted_secret into app_url
    from vault.decrypted_secrets
    where name = 'app_url';

    select decrypted_secret into cron_sec
    from vault.decrypted_secrets
    where name = 'cron_secret';
  exception when others then
    raise warning '[cron] Could not read secrets from vault: %', sqlerrm;
    return;
  end;

  if app_url is null or cron_sec is null then
    raise warning '[cron] app_url or cron_secret not set in vault â skipping';
    return;
  end if;

  -- Fire the HTTP POST to the refresh endpoint
  select net.http_post(
    url     := app_url || '/api/prices/refresh',
    headers := jsonb_build_object(
      'Content-Type',    'application/json',
      'x-cron-secret',   cron_sec
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 55000
  ) into request_id;

  raise notice '[cron] Price refresh triggered â request_id=%', request_id;
end;
$$;

-- ââ Schedule: every 2 hours âââââââââââââââââââââââââââââââ
-- Remove existing jobs first (idempotent)
select cron.unschedule('cs2-price-refresh') where exists (
  select 1 from cron.job where jobname = 'cs2-price-refresh'
);

select cron.schedule(
  'cs2-price-refresh',          -- job name
  '0 */2 * * *',                -- every 2 hours at :00
  $$ select public.trigger_price_refresh(); $$
);

-- ââ Alert check function ââââââââââââââââââââââââââââââââââ
create or replace function public.trigger_alert_check()
returns void
language plpgsql
security definer
as $$
declare
  app_url  text;
  cron_sec text;
begin
  begin
    select decrypted_secret into app_url
    from vault.decrypted_secrets where name = 'app_url';

    select decrypted_secret into cron_sec
    from vault.decrypted_secrets where name = 'cron_secret';
  exception when others then
    return;
  end;

  if app_url is null or cron_sec is null then return; end if;

  perform net.http_post(
    url     := app_url || '/api/alerts/notifications',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'x-cron-secret', cron_sec
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
end;
$$;

-- ââ Schedule: every 5 minutes âââââââââââââââââââââââââââââ
select cron.unschedule('cs2-alert-check') where exists (
  select 1 from cron.job where jobname = 'cs2-alert-check'
);

select cron.schedule(
  'cs2-alert-check',
  '*/5 * * * *',
  $$ select public.trigger_alert_check(); $$
);

-- ââ News refresh function âââââââââââââââââââââââââââââââââ
create or replace function public.trigger_news_refresh()
returns void
language plpgsql
security definer
as $$
declare
  app_url  text;
  cron_sec text;
begin
  begin
    select decrypted_secret into app_url
    from vault.decrypted_secrets where name = 'app_url';

    select decrypted_secret into cron_sec
    from vault.decrypted_secrets where name = 'cron_secret';
  exception when others then
    return;
  end;

  if app_url is null or cron_sec is null then return; end if;

  perform net.http_post(
    url     := app_url || '/api/news',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'x-cron-secret', cron_sec
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 15000
  );
end;
$$;

-- ââ Schedule: every 4 hours âââââââââââââââââââââââââââââââ
select cron.unschedule('cs2-news-refresh') where exists (
  select 1 from cron.job where jobname = 'cs2-news-refresh'
);

select cron.schedule(
  'cs2-news-refresh',
  '30 */4 * * *',               -- every 4 hours at :30 (offset from price refresh)
  $$ select public.trigger_news_refresh(); $$
);

-- ââ Verify jobs are registered ââââââââââââââââââââââââââââ
-- After running this migration, verify with:
--   select jobname, schedule, active from cron.job;
-- You should see 3 rows.

comment on function public.trigger_price_refresh() is
  'Called by pg_cron every 2h to refresh CS2 skin prices from Skinstrack API';
comment on function public.trigger_alert_check() is
  'Called by pg_cron every 5m to evaluate user price alerts';
comment on function public.trigger_news_refresh() is
  'Called by pg_cron every 4h to fetch CS2 news from RSS feeds';
