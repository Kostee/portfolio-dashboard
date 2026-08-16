# Self-hosting

Portfolio Dashboard separates application code from deployment-specific portfolio data and secrets.

A typical deployment consists of:

```text
Next.js frontend
        |
        v
Supabase project
  |- PostgreSQL
  |- Auth
  |- Edge Functions
  |- Vault
  |- pg_cron
  `- pg_net
```

The easiest supported workflow is:

1. local development with the Supabase CLI and Docker,
2. a hosted Supabase project for production,
3. any compatible Next.js hosting platform for the frontend.

## 1. Requirements

Install:

- Git,
- Node.js 20 or newer,
- Docker,
- a Supabase account for hosted deployments.

The Supabase CLI is already included as a development dependency, so commands can be run through `npx supabase`.

## 2. Local development

Clone the repository:

```bash
git clone https://github.com/Kostee/portfolio-dashboard.git
cd portfolio-dashboard
```

Install dependencies:

```bash
npm ci
```

Start Supabase:

```bash
npx supabase start
```

The CLI prints the local API URL and browser-safe client credentials.

Copy the environment template:

### macOS / Linux

```bash
cp .env.example .env.local
```

### PowerShell

```powershell
Copy-Item .env.example .env.local
```

Fill in:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<local browser-safe key>
```

Recreate the database from all migrations and the public seed file:

```bash
npx supabase db reset
```

Start Next.js:

```bash
npm run dev
```

The application is available at:

```text
http://localhost:3000
```

Local Supabase Studio is available at the URL printed by `npx supabase start`.

## 3. Database deployment

Create a new Supabase project.

Authenticate the CLI:

```bash
npx supabase login
```

Link the repository:

```bash
npx supabase link --project-ref YOUR_PROJECT_REF
```

Apply the tracked migrations:

```bash
npx supabase db push
```

The public migration history intentionally does not seed a real investment portfolio.

After deployment, configure your own workspace, owners, accounts, providers, asset classes and instruments through the application.

## 4. Frontend environment

Configure these variables in the Next.js hosting environment:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_BROWSER_SAFE_KEY
```

Do not expose an admin, secret or service-role key through a `NEXT_PUBLIC_*` variable.

Configure the Supabase Auth Site URL and allowed redirect URLs for the domain hosting the frontend.

## 5. Edge Functions

The repository contains:

```text
sync-weekly-market-data
sync-daily-market-opens
sync-government-bond-valuations
```

Deploy them with:

```bash
npx supabase functions deploy sync-weekly-market-data
npx supabase functions deploy sync-daily-market-opens
npx supabase functions deploy sync-government-bond-valuations
```

Hosted Supabase Edge Functions provide the normal Supabase runtime environment automatically.

The application-specific function secrets are described below.

## 6. Market-data secrets

Generate a strong random value for the market-sync authentication secret and configure it together with whichever market-data providers you intend to use.

Example:

```bash
npx supabase secrets set MARKET_SYNC_CRON_SECRET=YOUR_RANDOM_SECRET
npx supabase secrets set EODHD_API_KEY=YOUR_EODHD_KEY
npx supabase secrets set ALPHA_VANTAGE_API_KEY=YOUR_ALPHA_VANTAGE_KEY
npx supabase secrets set TWELVE_DATA_API_KEY=YOUR_TWELVE_DATA_KEY
```

Provider keys are optional in the sense that you only need keys for providers enabled by your deployment-specific mappings.

Bitvavo market data and NBP reference FX data are accessed through public endpoints and do not require provider API secrets in the current implementation.

Never commit a file containing real values for these secrets.

## 7. Government-bond workflow secret

The government-bond valuation Edge Function uses a separate authentication secret:

```bash
npx supabase secrets set BOND_VALUATION_CRON_SECRET=YOUR_RANDOM_SECRET
```

Actual holdings and deployment-specific bond configuration must remain outside the public repository.

## 8. Provider mappings

Market-data provider mappings are deployment-specific.

The public migrations create the necessary schema but intentionally do not seed mappings for a real portfolio.

Configure mappings only after confirming the exact symbol against the selected provider.

Do not guess provider symbols: an incorrect symbol can create a valid-looking but financially incorrect valuation.

## 9. Scheduled automation

The repository contains SQL templates under `scripts/`.

### Weekly market data

Start with:

```text
scripts/setup-weekly-market-data-cron.sql.template
```

This creates the Vault entries used to call the weekly Edge Function and installs DST-safe scheduled jobs.

Replace only the documented placeholders with values from your own deployment.

Do not commit the filled-in file.

### Daily market opens

Then use:

```text
scripts/setup-daily-market-open-cron.sql.template
```

This workflow reuses the market-sync Vault configuration and schedules Europe and U.S. opening-price attempts.

### Government bonds

Finally, if required, use:

```text
scripts/setup-government-bond-valuation-cron.sql.template
```

It adds the separate bond-workflow secret and schedules the function weekly. The Edge Function performs its own date gating before writing a valuation.

Run the filled-in SQL through your project's Supabase SQL Editor.

Keep all real secret values outside Git.

## 10. Production checks

Before deployment:

```bash
npm run lint
npm run build
npx supabase db lint --linked --level warning --fail-on error
```

For a local clean-room database test:

```bash
npx supabase db reset
```

## 11. Backups

Portfolio data is deployment data, not source code.

Back up the production database using the facilities appropriate to your Supabase deployment.

Do not store production database dumps or portfolio exports inside this Git repository.

## 12. Fully self-hosted Supabase

The application does not depend on a broker-specific backend and can also be adapted to a fully self-hosted Supabase installation.

When using a standalone Supabase deployment rather than the managed platform, ensure that:

- the database migrations are applied,
- Auth and Row Level Security are enabled,
- the three Edge Functions receive the required runtime environment,
- provider and cron secrets are supplied securely,
- scheduled function invocation is configured with equivalent PostgreSQL networking and scheduling facilities.

The SQL templates in `scripts/` target the hosted Supabase Vault/`pg_cron`/`pg_net` workflow and may require adaptation for another infrastructure layout.
