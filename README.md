# Portfolio Dashboard

A self-hosted investment portfolio ledger, valuation and reporting application built with Next.js and Supabase.

Portfolio Dashboard is designed for investors who want to maintain their own source-of-truth portfolio data instead of depending on a broker-specific integration.

It combines a transaction ledger, current portfolio state, historical reporting and optional automated market-data workflows in one workspace.

## Highlights

- workspace-scoped portfolio configuration,
- owners, accounts, providers, asset classes and instruments,
- opening portfolio state,
- funding routes and external cash flows,
- trades, internal transfers and currency exchanges,
- editable trade operations,
- current positions calculated from the ledger,
- manual and automatic valuations,
- contribution tracking and XIRR,
- weekly operation reports,
- monthly portfolio reports and visualizations,
- daily market-open tracking,
- automated weekly market-data synchronization,
- optional provider fallbacks,
- automatic government-bond valuation workflow,
- Supabase Row Level Security and authentication.

The public repository contains application code, schema migrations, automation logic and documentation only.

It intentionally does **not** contain production portfolio holdings, transactions, private provider mappings, credentials, backups or account-holder data.

## Architecture

```text
Browser
  |
  v
Next.js / React
  |
  v
Supabase
  |- PostgreSQL
  |- Authentication
  |- Row Level Security
  |- Edge Functions
  |- Vault
  |- pg_cron
  `- pg_net
```

The portfolio ledger is the source of truth for current quantities:

```text
opening state
+ buys
- sells
+/- transfers
= current quantities
```

Valuations are stored separately from quantities, allowing portfolio state to be reconstructed for reporting without changing the underlying ledger.

## Market-data workflows

The application supports deployment-specific market-data mappings.

Current integrations include:

- EODHD,
- Alpha Vantage,
- Twelve Data,
- Bitvavo public market data,
- NBP reference FX rates.

Provider symbols and fallback mappings are intentionally not seeded by the public repository. They must be configured for each deployment.

Three Supabase Edge Functions are included:

```text
sync-weekly-market-data
sync-daily-market-opens
sync-government-bond-valuations
```

SQL templates for scheduling these workflows are available in `scripts/`.

## Quick start

Requirements:

- Node.js 20 or newer,
- Docker,
- Git.

Clone the repository and install dependencies:

```bash
git clone https://github.com/Kostee/portfolio-dashboard.git
cd portfolio-dashboard
npm ci
```

Start the local Supabase stack:

```bash
npx supabase start
```

Create the local Next.js environment file from the example:

```bash
cp .env.example .env.local
```

Use the local Supabase URL and browser-safe client key reported by the Supabase CLI.

Rebuild the database from the tracked migrations:

```bash
npx supabase db reset
```

Start the application:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

For a hosted deployment, Edge Functions, scheduled workflows and provider secrets, see [`SELF_HOSTING.md`](SELF_HOSTING.md).

## Development

Run ESLint:

```bash
npm run lint
```

Create a production build:

```bash
npm run build
```

Lint the local database:

```bash
npx supabase db lint --local --level warning --fail-on error
```

Rebuild the local database from zero:

```bash
npx supabase db reset
```

## Documentation

Detailed internal documentation is available under `docs/`.

Useful starting points:

- `docs/DATA_MODEL.md` â€” portfolio database model,
- `docs/REPORT_RULES.md` â€” reporting and calculation rules,
- `docs/CHART_STYLE.md` â€” visualization rules,
- `docs/WEEKLY_MARKET_DATA_SETUP.md` â€” weekly market-data workflow,
- `docs/PROVIDER_NOTES.md` â€” provider responsibilities.

## Privacy model

Portfolio Dashboard is intended to be deployed with private user data outside the Git repository.

Never commit:

- `.env` files containing real credentials,
- Supabase service-role or secret keys,
- provider API keys,
- production portfolio exports,
- database backups,
- filled-in cron setup templates,
- real private seed datasets.

The tracked `.env.example` contains placeholders only.

See [`SECURITY.md`](SECURITY.md) before deploying the application publicly.

## Project status

The application is actively developed and already includes the core portfolio ledger, reporting pipeline and automated market-data workflows.

The public repository starts with an empty portfolio. Deployment-specific financial data must be supplied by the operator.

## License

MIT
