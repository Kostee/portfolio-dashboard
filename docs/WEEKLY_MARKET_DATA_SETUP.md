# Weekly market-data sync setup

This package adds a weekly Saturday market-data workflow for the portfolio dashboard.

## What it does

Every Saturday at approximately 08:30 Europe/Warsaw:

- listed GPW, Xetra and LSE holdings: latest completed close no later than Friday,
- U.S. holdings: latest completed close no later than Friday,
- BTC: Friday BTC/EUR daily close from Bitvavo,
- USD/PLN and EUR/PLN: latest NBP table A middle rate available through Friday.

The source date is stored as the actual market/rate date.
The Saturday report date remains separate.

The sync stores generic market data in:

- `instrument_prices`,
- `exchange_rates`.

It does **not** silently create monthly report snapshots.

The companion monthly market-data page shows proposals based on:

`ledger quantity × latest automatic close × latest automatic FX`

and lets an admin/editor explicitly accept all ready proposals for the selected report date. The acceptance creates exact-date `position_snapshots`.

Government bonds and PPK stay manual.

## Provider strategy and limits

This production-oriented version deliberately avoids unofficial Yahoo endpoints.

For the current held portfolio, the Saturday request budget is split across documented free EOD providers:

- GPW holdings: EODHD Free Starter,
- U.S. holdings + Xetra/LSE ETFs: Alpha Vantage `TIME_SERIES_DAILY`,
- BTC: Bitvavo public candles,
- FX: NBP public API.

The Edge Function fetches only instruments actually held on the selected Saturday, even though mappings for sold-out historical instruments remain in the catalog.

With the current portfolio the normal run is expected to use approximately:

- EODHD: about 18 GPW calls, below the 20/day free limit,
- Alpha Vantage: about 16 calls, below the 25/day free limit,
- Bitvavo: 1 call,
- NBP: 1 table request returning both USD/PLN and EUR/PLN.

A provider failure is recorded explicitly in `market_data_sync_items`; the workflow never pretends a failed fetch is fresh data.

## Files

Copy these files to the same paths in the repository:

```text
supabase/migrations/20260807160000_add_automatic_market_data_source.sql
supabase/migrations/20260807160100_prepare_weekly_market_data_sync.sql
supabase/functions/sync-weekly-market-data/index.ts
src/app/portfolio/reports/monthly/market-data/actions.ts
src/app/portfolio/reports/monthly/market-data/page.tsx
scripts/setup-weekly-market-data-cron.sql.template
docs/MONTHLY_PAGE_LINK_PATCH.md
```

## Recommended branch

Start only from a clean working tree:

```powershell
git status --short
git branch --show-current
```

Then:

```powershell
git switch main
git pull
git switch -c feat/weekly-market-data-sync
```

## 1. Apply the database migrations

First dry-run:

```powershell
npx supabase db push --linked --dry-run
```

Then:

```powershell
npx supabase db push --linked
npx supabase migration list --linked
npx supabase db lint --linked --level warning --fail-on error
```

Regenerate generated database types:

```powershell
npx supabase gen types typescript --linked --schema public | Set-Content -Encoding utf8 .\src\types\database.types.ts
```

Check that the new objects are present:

```powershell
Select-String `
  -Path .\src\types\database.types.ts `
  -Pattern "market_data_sync_runs:|market_data_sync_items:|market_data_instrument_sources:|get_monthly_market_proposals|apply_monthly_market_proposals"
```

## 2. Configure Edge Function secrets

Create a strong random cron secret in PowerShell:

```powershell
$bytes = New-Object byte[] 32
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
$marketSyncSecret = [Convert]::ToHexString($bytes).ToLower()
$marketSyncSecret
```

Keep the printed value private.

Set the required Edge secret:

```powershell
npx supabase secrets set MARKET_SYNC_CRON_SECRET="$marketSyncSecret"
```

Create free API keys at EODHD and Alpha Vantage, then set both without committing them anywhere:

```powershell
npx supabase secrets set EODHD_API_KEY="YOUR_EODHD_KEY"
npx supabase secrets set ALPHA_VANTAGE_API_KEY="YOUR_ALPHA_VANTAGE_KEY"
```

Both keys are required for the normal current-portfolio sync. Provider failures remain visible and can still be valued manually.

## 3. Deploy the Edge Function

The function is invoked by `pg_net`, not by a signed-in browser user. We disable the platform JWT gate and authenticate the request inside the function with the dedicated random `MARKET_SYNC_CRON_SECRET` header.

```powershell
npx supabase functions deploy sync-weekly-market-data --use-api --no-verify-jwt
```

## 4. Dry-run the live function

Get your project URL and publishable key from Supabase Dashboard -> Settings -> API.

Do not paste them into source code.

A dry run reads the database and calls the external providers, but does not write prices/rates/sync runs.

PowerShell:

```powershell
$projectUrl = "https://YOUR_PROJECT_REF.supabase.co"
$publishableKey = "YOUR_PUBLISHABLE_KEY"

$headers = @{
  apikey = $publishableKey
  "x-market-sync-secret" = $marketSyncSecret
  "Content-Type" = "application/json"
}

$body = @{
  trigger = "manual"
  force = $true
  dryRun = $true
  targetSaturday = "2026-08-08"
} | ConvertTo-Json

Invoke-RestMethod `
  -Method Post `
  -Uri "$projectUrl/functions/v1/sync-weekly-market-data" `
  -Headers $headers `
  -Body $body
```

Before the U.S. session is finished, this dry-run is only a connectivity/parser test. It does not store anything.

## 5. Optional historical write test

To test a complete already-finished week without touching the upcoming report date, use:

```powershell
$body = @{
  trigger = "manual"
  force = $true
  dryRun = $false
  targetSaturday = "2026-08-01"
} | ConvertTo-Json

Invoke-RestMethod `
  -Method Post `
  -Uri "$projectUrl/functions/v1/sync-weekly-market-data" `
  -Headers $headers `
  -Body $body
```

This writes the prior Friday's market data and creates a sync run for 2026-08-01.

## 6. Configure the Saturday cron

The custom `MARKET_SYNC_CRON_SECRET` is the security boundary for this endpoint. The publishable key in the HTTP request is only a normal Supabase API header.

Open:

```text
scripts/setup-weekly-market-data-cron.sql.template
```

Copy it to a **private temporary file**, replace only:

```text
YOUR_PROJECT_REF
YOUR_SUPABASE_PUBLISHABLE_KEY
YOUR_MARKET_SYNC_CRON_SECRET
```

Run the filled SQL in Supabase SQL Editor. Hosted Supabase already exposes Vault; the template enables only `pg_cron` and `pg_net` and stores the three cron-call secrets through `vault.create_secret(...)`.

Do not commit the filled copy.

Two GMT jobs are created:

```text
06:30 Saturday
07:30 Saturday
```

The Edge Function checks `Europe/Warsaw`. Only the invocation that corresponds to 08:30 Polish time proceeds; the other returns a no-op. This handles CET/CEST automatically.

## 7. Verify tomorrow's run

After 08:30 Europe/Warsaw:

```sql
select
  target_saturday,
  status,
  market_data_through_date,
  instrument_success_count,
  instrument_failure_count,
  fx_success_count,
  fx_failure_count,
  started_at,
  completed_at
from public.market_data_sync_runs
order by target_saturday desc
limit 5;
```

For the detailed provider audit:

```sql
select
  item_type,
  provider,
  provider_symbol,
  source_date,
  value,
  currency,
  status,
  error_message
from public.market_data_sync_items
where run_id = (
  select id
  from public.market_data_sync_runs
  where target_saturday = '2026-08-08'
  order by created_at desc
  limit 1
)
order by item_type, provider_symbol;
```

Check stored FX:

```sql
select
  rate_date,
  from_currency,
  to_currency,
  rate,
  source,
  notes
from public.exchange_rates
where
  from_currency in ('USD', 'EUR')
  and to_currency = 'PLN'
order by rate_date desc, from_currency
limit 10;
```

Check latest automatic prices:

```sql
select
  i.ticker,
  i.exchange,
  ip.price_date,
  ip.price,
  ip.currency,
  ip.source,
  ip.notes
from public.instrument_prices ip
join public.instruments i
  on i.workspace_id = ip.workspace_id
  and i.id = ip.instrument_id
where ip.source = 'automatic'
order by ip.price_date desc, i.ticker;
```

## 8. Monthly report workflow

Apply the tiny navigation patch from:

```text
docs/MONTHLY_PAGE_LINK_PATCH.md
```

Then the normal monthly-report page contains a `Review automatic market data` button for the currently selected report date.

You can also open the route directly:

```text
/portfolio/reports/monthly/market-data?asOf=2026-08-08
```

The page shows:

- ledger quantity,
- fetched unit close,
- source date/provider,
- native market value,
- FX rate/date where relevant,
- PLN market value,
- status.

After reviewing the values, press:

```text
Accept N automatic proposals
```

The app writes exact 2026-08-08 `position_snapshots` only for proposals that are ready and not already confirmed.

Then return to:

```text
/portfolio/reports/monthly?asOf=2026-08-08
```

At that point, listed assets + BTC should already be ready. You should normally have to enter only:

- the government-bond value,
- Jakub PPK,
- Natalia PPK.

Any provider failure remains visible and must be resolved or entered manually.

## 9. Validate the app

```powershell
npm run lint
npm run build
git diff --check
git status --short
```

Then run locally:

```powershell
npm run dev
```

## 10. Commit after successful verification

```powershell
git add `
  supabase/migrations/20260807160000_add_automatic_market_data_source.sql `
  supabase/migrations/20260807160100_prepare_weekly_market_data_sync.sql `
  supabase/functions/sync-weekly-market-data/index.ts `
  src/app/portfolio/reports/monthly/market-data/actions.ts `
  src/app/portfolio/reports/monthly/market-data/page.tsx `
  scripts/setup-weekly-market-data-cron.sql.template `
  docs/WEEKLY_MARKET_DATA_SETUP.md `
  docs/MONTHLY_PAGE_LINK_PATCH.md `
  src/types/database.types.ts

git diff --cached --check

git commit -m "feat: add weekly market data sync"
git push -u origin feat/weekly-market-data-sync
```
