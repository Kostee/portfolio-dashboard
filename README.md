# Portfolio Dashboard

A private, self-hostable investment portfolio tracking and reporting dashboard.

The application is designed for manually maintained portfolios and focuses on:

- transaction history,
- current holdings calculated from initial positions and transactions,
- manual valuation updates,
- weekly trading reports,
- monthly portfolio visualizations,
- dividend summaries,
- XIRR calculation,
- JSON backup and restore.

## Project goals

Portfolio Dashboard is intended to be:

- private by default,
- accessible from desktop and mobile browsers,
- self-hostable,
- independent from broker integrations,
- transparent in how portfolio values and performance metrics are calculated.

The public repository contains application code, database migrations, documentation and demonstration data only.

Real portfolio data, account holders, credentials, backups and production configuration are not stored in this repository.

## Planned stack

- Next.js
- TypeScript
- Tailwind CSS
- Supabase PostgreSQL
- Supabase Authentication
- Vercel or another compatible hosting platform

## Core data principle

Current holdings are calculated using:

```text
initial holdings + transactions = current quantities
current quantities × latest valuation updates = current portfolio value
````

Historical portfolio value points are stored separately for periods preceding the detailed transaction history.

## Planned reports

### Weekly

* Added and sold instruments
* New assets by asset class

### Monthly

* Polish stocks portfolio structure
* International portfolio structure
* Assets by account
* Assets over time
* Asset class structure

### Performance

* Portfolio XIRR
* Nominal portfolio result
* Dividend summaries by month, year, instrument and account

## Privacy

The application is designed for private deployments.

Do not commit:

* production environment variables,
* real portfolio exports,
* private seed files,
* backups,
* authentication secrets,
* personal account or transaction data.

See `.gitignore` and `.env.example` before deploying.

## Development

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Run linting:

```bash
npm run lint
```

Create a production build:

```bash
npm run build
```

## Status

Early development.

The current stage focuses on defining the domain model, reporting rules and privacy boundaries before implementing persistence and user-facing features.

## License

MIT