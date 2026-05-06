# VAULT — Supabase Edge Functions

## Deploy

```bash
# Install Supabase CLI if needed
npm install -g supabase

# Login and link to the project
supabase login
supabase link --project-ref dwtyuihbyasxqpyotqxm

# Deploy both functions
supabase functions deploy refresh-cs2-prices
supabase functions deploy refresh-pokemon-prices
```

## Set up Cron Schedules (Supabase Dashboard)

1. Go to **Database → Extensions** → enable `pg_cron` and `pg_net`
2. Go to **SQL Editor** and run:

```sql
-- CS2: every 6 hours
select cron.schedule(
  'vault-refresh-cs2',
  '0 */6 * * *',
  $$
  select net.http_post(
    url := 'https://dwtyuihbyasxqpyotqxm.supabase.co/functions/v1/refresh-cs2-prices',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Pokémon: every 12 hours
select cron.schedule(
  'vault-refresh-pokemon',
  '0 */12 * * *',
  $$
  select net.http_post(
    url := 'https://dwtyuihbyasxqpyotqxm.supabase.co/functions/v1/refresh-pokemon-prices',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);
```

Or use the **Supabase Dashboard → Edge Functions → [function] → Schedule** tab
to set the cron expression directly (no SQL needed).

## Manual Trigger (testing)

```bash
supabase functions invoke refresh-cs2-prices
supabase functions invoke refresh-pokemon-prices
```

Or via curl:
```bash
curl -X POST https://dwtyuihbyasxqpyotqxm.supabase.co/functions/v1/refresh-cs2-prices \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>"
```

## How it works

| Function | Schedule | What it does |
|---|---|---|
| `refresh-cs2-prices` | Every 6h | One PriceEmpire bulk call → updates all CS2 items → writes snapshot per user |
| `refresh-pokemon-prices` | Every 12h | pokemontcg.io per card (300ms delay) → updates all Pokémon cards → writes snapshot per user |

Usage is tracked in `api_usage` (service='pricempire', user_id=NULL for cron rows).
The app status bar reads from this table.
