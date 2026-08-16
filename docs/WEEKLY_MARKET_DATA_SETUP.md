# Weekly market-data sync

Portfolio Dashboard includes an optional weekly workflow for collecting generic market prices and reference FX rates.

The workflow is implemented by:

```text
supabase/functions/sync-weekly-market-data/index.ts
scripts/setup-weekly-market-data-cron.sql.template
```

Database support is created by the tracked Supabase migrations.

## What the workflow stores

Automatic market data is stored separately from portfolio quantities.

The workflow writes generic records to:

- `instrument_prices`,
- `exchange_rates`,
- `market_data_sync_runs`,
- `market_data_sync_items`.

It does not silently create or overwrite monthly portfolio snapshots.

The monthly market-data review route derives proposals from:

```text
ledger quantity
Ã— automatic market close
Ã— automatic FX where required
```

An administrator or editor explicitly accepts ready proposals before they become report-date position snapshots.

## Supported data sources

The current implementation can use:

- EODHD,
- Alpha Vantage,
- Twelve Data,
- Bitvavo public market data,
- NBP reference FX rates.

Provider selection and symbols are deployment-specific configuration.

The public repository intentionally does not contain mappings for a real portfolio.

Only configure a provider symbol after verifying it against that provider's own instrument catalogue. A syntactically valid but incorrect symbol can create a financially incorrect valuation.

## Secrets

The Edge Function authenticates scheduled calls with:

```text
MARKET_SYNC_CRON_SECRET
```

Depending on the providers enabled for a deployment, configure the relevant API keys:

```text
EODHD_API_KEY
ALPHA_VANTAGE_API_KEY
TWELVE_DATA_API_KEY
```

Bitvavo market candles and NBP reference rates use public endpoints in the current implementation.

Set secrets through Supabase or another appropriate secret store. Do not commit real values.

Example:

```bash
npx supabase secrets set MARKET_SYNC_CRON_SECRET=YOUR_RANDOM_SECRET
npx supabase secrets set EODHD_API_KEY=YOUR_EODHD_KEY
npx supabase secrets set ALPHA_VANTAGE_API_KEY=YOUR_ALPHA_VANTAGE_KEY
npx supabase secrets set TWELVE_DATA_API_KEY=YOUR_TWELVE_DATA_KEY
```

## Deploy the Edge Function

For a linked hosted Supabase project:

```bash
npx supabase functions deploy sync-weekly-market-data
```

The repository's Supabase configuration defines the function's JWT verification behaviour. The scheduled endpoint also validates the dedicated market-sync secret inside the function.

## Scheduled execution

Use:

```text
scripts/setup-weekly-market-data-cron.sql.template
```

Create a private working copy of the template and replace only the documented placeholders.

The template uses:

- Supabase Vault for cron-call configuration,
- `pg_cron` for scheduling,
- `pg_net` for the HTTP request.

Do not commit a filled-in copy of the template.

The function performs its own Europe/Warsaw schedule checks, so the paired UTC cron invocations can remain DST-safe.

## Manual dry run

A dry run can be used to test provider connectivity and parsing without writing market prices, FX rates or sync-run records.

Example request body:

```json
{
  "trigger": "manual",
  "force": true,
  "dryRun": true,
  "targetSaturday": "YYYY-MM-DD"
}
```

Use a completed Saturday appropriate to your deployment and send the request with the configured market-sync secret.

Never place the real secret in source code, documentation or shell history that will be committed.

## Audit a run

Recent sync runs can be inspected with:

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

Detailed provider results are available in `market_data_sync_items`.

A provider failure remains explicit. The workflow must not present a failed or stale fetch as fresh market data.

## Monthly report workflow

Open:

```text
/portfolio/reports/monthly
```

For the selected report date, use **Review automatic market data** to open:

```text
/portfolio/reports/monthly/market-data
```

The review page shows the ledger quantity, fetched close, source date/provider, native value, FX information where required, base-currency value and readiness status.

Accept only proposals whose source and value have been reviewed.

Positions not covered by an automatic valuation source remain manual.

Government-bond valuation is handled by its own optional Edge Function:

```text
sync-government-bond-valuations
```

See `SELF_HOSTING.md` for the overall deployment and secret-management workflow.

## Validation

For changes to this workflow, run:

```bash
npm run lint
npm run build
npx supabase db lint --local --level warning --fail-on error
```

When database migrations change, also rebuild the local database from zero:

```bash
npx supabase db reset
```
