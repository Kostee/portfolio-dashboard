# Project Specification

> Historical design document. This file records the original product requirements and early scope decisions. It is useful as design context, but it is not the current feature matrix. See `README.md`, `SELF_HOSTING.md` and the application code for the current implementation.

## 1. Overview

Portfolio Dashboard is a private, self-hostable web application for manually tracking an investment portfolio and generating recurring portfolio reports.

The application is intended for a small private household portfolio and should be accessible from:

- desktop browsers,
- iPhone,
- Android devices,
- Windows,
- macOS.

The application is not intended to replace a broker, trading platform or live market-data terminal.

Its primary purpose is to:

- store portfolio history,
- track transactions,
- calculate current holdings,
- store manual valuation updates,
- generate weekly and monthly reports,
- calculate portfolio performance,
- provide a consistent visual reporting workflow.

## 2. Core principles

### 2.1 Private by default

The production deployment must require authentication.

No portfolio data should be publicly accessible.

The application should also use appropriate metadata such as:

```text
noindex, nofollow
````

to discourage search-engine indexing.

Search-engine blocking is not treated as a security mechanism. Authentication and database access rules are required.

### 2.2 Public code, private data

The source code repository may remain public and serve as a portfolio project.

The public repository must not contain:

* real account holders,
* real accounts,
* production credentials,
* authentication secrets,
* production environment variables,
* real portfolio transactions,
* real valuation history,
* real portfolio exports,
* private backups.

The repository may include fictional demonstration data.

### 2.3 Manual data entry first

The first versions of the application will rely on manual data entry.

Broker integrations, automatic transaction imports and live market-data integrations are explicitly outside the initial scope.

### 2.4 Data model before visual polish

Correct portfolio calculations and a stable domain model are more important than reproducing existing charts pixel-for-pixel.

Charts should remain visually consistent, readable and close to the existing reporting style, without requiring unnecessarily complex custom graphics in the first version.

## 3. Users and access

The production application is intended for two private household members.

Real user identities must be stored only in the production database.

The public codebase should use generic concepts such as:

* user,
* owner,
* household member.

Initial authentication requirements:

* email and password login,
* no public registration,
* accounts created manually by the administrator,
* authenticated access only,
* no social login required.

## 4. Main application areas

The application should provide the following main sections.

### 4.1 Dashboard

The dashboard should summarize:

* total portfolio value,
* latest valuation date,
* total value by asset class,
* total value by account,
* recent transactions,
* recent valuation updates,
* latest XIRR,
* missing or outdated instrument prices.

### 4.2 Transactions

Users should be able to:

* add a transaction,
* edit a transaction,
* delete a transaction,
* filter transactions by date,
* filter transactions by account,
* filter transactions by instrument,
* filter transactions by type,
* view transaction history.

Each transaction must have a required date and may have an optional execution time.

### 4.3 Holdings

The application should calculate current holdings from:

```text
initial holdings + transactions = current quantities
```

The holdings view should show:

* instrument,
* asset class,
* account,
* owner,
* provider,
* current quantity,
* latest unit price,
* valuation currency,
* current value in original currency,
* current value in PLN,
* date of the latest valuation update.

The same instrument may exist on more than one account.

### 4.4 Instruments

Each instrument must belong to exactly one asset class.

The instrument dictionary should store:

* name,
* ticker,
* asset class,
* default currency,
* active or inactive status.

The application should remember the asset-class assignment when new transactions are created.

### 4.5 Accounts

Every account must contain three required concepts:

* owner,
* provider,
* account name.

Example structure:

```text
Owner · Provider · Account name
```

Possible account names or types include:

* PLN,
* USD,
* IKE,
* IKZE,
* OKI,
* PPK,
* Bonds,
* BTC.

The field `provider` is preferred over `broker`, because an account may be maintained by a broker, bank, investment fund provider or cryptocurrency platform.

### 4.6 Valuation updates

Users should manually record historical unit prices for instruments.

Each valuation update should contain:

* instrument,
* date,
* optional time,
* unit price,
* currency.

The application should preserve the full valuation history per instrument.

The current value of a holding is calculated as:

```text
current quantity × latest available unit price
```

### 4.7 Reports

The application should generate weekly and monthly reports.

Generated reports should be stored in the application history and may be exported as PNG files.

### 4.8 Performance

The application should calculate:

* portfolio XIRR,
* total portfolio value,
* nominal portfolio result,
* simple return,
* cumulative contributions,
* dividend totals.

PPK accounts are included in displayed total portfolio value but excluded from XIRR calculations.

### 4.9 Settings

The settings area should allow management of:

* asset classes,
* asset-class colors,
* providers,
* accounts,
* exchange channels,
* application data export,
* application data import.

## 5. Transaction types

The initial transaction types are:

### 5.1 Buy

A buy transaction:

* increases instrument quantity,
* is included in weekly transaction reports,
* stores quantity,
* stores transaction value,
* stores currency,
* is assigned to an account.

### 5.2 Sell

A sell transaction:

* decreases instrument quantity,
* is included in weekly transaction reports,
* stores quantity,
* stores transaction value,
* stores currency,
* is assigned to an account.

The application should prevent accidental negative holdings unless an explicit correction workflow is used.

### 5.3 External deposit

An external deposit represents new capital entering the portfolio.

It:

* is included in contribution totals,
* is included in XIRR cash flows,
* is included in weekly contribution summaries,
* does not directly change instrument quantities.

### 5.4 Internal transfer

An internal transfer moves existing portfolio money between accounts.

It:

* is stored historically,
* is not treated as a new contribution,
* is not included in XIRR cash flows,
* is not included in weekly contribution totals,
* does not directly change instrument quantities.

A transfer from a PLN brokerage account to an IKE or IKZE account is an internal transfer.

### 5.5 Dividend

A dividend:

* is stored historically,
* is excluded from standard weekly buy and sell charts,
* may be summarized by month,
* may be summarized by year,
* may be summarized by instrument,
* may be summarized by account.

### 5.6 FX conversion

An FX conversion records an exchange between two currencies.

It should store:

* source amount,
* source currency,
* target amount,
* target currency,
* implied exchange rate,
* exchange channel,
* date,
* optional time.

Exchange channels such as Revolut or Walutomat are not portfolio accounts.

### 5.7 Position adjustment

A position adjustment is used only to reconcile calculated holdings with an external source.

It should require:

* instrument,
* account,
* quantity adjustment,
* reason,
* date.

Adjustments should remain clearly distinguishable from ordinary buy and sell transactions.

## 6. Asset classes

The default asset classes are:

* Polish Stocks,
* Global ETFs,
* Treasury Bonds,
* Semiconductors,
* Bitcoin & Crypto,
* US REITs,
* PPK Employment Plan.

Asset classes must be configurable.

Users should be able to:

* add an asset class,
* rename an asset class,
* change its display order,
* change its chart color,
* deactivate an unused asset class.

All active asset classes should be available in portfolio-structure reports.

Report names must not assume that exactly seven asset classes exist.

## 7. Currency handling

The main reporting currency is PLN.

An instrument may be valued in:

* PLN,
* EUR,
* USD,
* another supported currency added later.

For transactions following a recorded FX conversion, the application should be able to use the implied exchange rate.

For portfolio-wide reports, users should initially be able to provide report exchange rates manually.

Automatic exchange-rate retrieval may be added later if it is:

* simple,
* free,
* reliable,
* easy to replace with manual values.

Manual exchange rates must remain available even after automatic retrieval is introduced.

## 8. Historical data strategy

The application supports two historical periods.

### 8.1 Aggregated historical period

For periods before detailed transaction tracking, the application stores:

* contribution history points,
* portfolio value history points,
* PPK value history.

This data is sufficient for:

* historical portfolio-value charts,
* historical contribution charts,
* XIRR calculations.

### 8.2 Detailed historical period

From a configurable baseline date, the application stores:

* initial holdings,
* all transactions,
* valuation updates,
* current calculated holdings.

The baseline date must not be hardcoded in the public application.

## 9. Source of truth

A manually entered portfolio snapshot is not the primary source of truth for current holdings.

Current quantities are calculated from:

```text
initial holdings + buys - sells + position adjustments
```

Current values are calculated from:

```text
current quantities × latest valuation updates
```

Historical report outputs may be stored as generated records, but they do not replace the underlying transaction and valuation history.

## 10. Weekly reports

### 10.1 Added and sold instruments

The report should:

* accept a date range,
* aggregate transactions by instrument across accounts,
* show buys as positive values,
* show sells as negative values,
* sort instruments by absolute transaction value,
* use asset-class colors,
* display quantities,
* display total purchases,
* display total sales,
* display net balance,
* display total external deposits for the selected period,
* display the selected date range.

Dividends, internal transfers and FX conversions are excluded.

### 10.2 New assets by asset class

The report should:

* aggregate net transaction value by asset class,
* use asset-class colors,
* display the selected date range,
* display total external deposits.

In version 1, negative asset classes should be described using a clear textual note below or beside the chart.

A hatched overlay representation for negative asset classes may be added in version 2.

## 11. Monthly reports

The application should generate the following reports.

### 11.1 Polish stocks portfolio structure

Displays individual Polish stock positions ranked by current value.

### 11.2 International portfolio structure

Groups international positions by major asset class, including:

* Global ETFs,
* US REITs,
* Semiconductors,
* other configurable international asset classes.

### 11.3 Assets by account

Displays current portfolio value by account.

### 11.4 Assets over time

Displays:

* total portfolio value,
* cumulative contributions,
* historical nominal result.

### 11.5 Asset class structure

Displays the current portfolio allocation across all active asset classes.

## 12. XIRR

The application should calculate one primary portfolio XIRR.

The user-facing interface does not need to label it as “excluding PPK”.

The calculation must:

* include external deposits as cash outflows,
* exclude internal transfers,
* exclude PPK accounts from the terminal portfolio value,
* exclude PPK contributions,
* use the selected current portfolio valuation date,
* support historical contribution points from before detailed transaction tracking.

The displayed total portfolio value should still include PPK.

The application should allow the underlying XIRR cash-flow vector to be inspected for verification.

## 13. Data export and backup

The application should support:

* complete JSON export,
* complete JSON import,
* schema versioning,
* validation before import,
* confirmation before replacing existing data.

The export should be designed for:

* machine processing,
* backup,
* migration,
* LLM-assisted analysis.

Spreadsheet-oriented exports are not required in the first version.

## 14. Chart export

Generated charts should be:

* viewable inside the application,
* stored in report history,
* exportable as PNG,
* usable on desktop and mobile browsers.

Exact Matplotlib reproduction is not required.

The initial chart design should prioritize:

* readable labels,
* consistent colors,
* clean white backgrounds,
* restrained styling,
* good mobile responsiveness.

## 15. Initial non-goals

The first version will not include:

* broker login integrations,
* automatic broker transaction imports,
* live market prices,
* tax calculations,
* trading recommendations,
* price alerts,
* public portfolio sharing,
* public user registration,
* social features,
* multi-tenant commercial accounts,
* native iOS or Android applications.

## 16. Deployment target

The application should support deployment using:

* a public GitHub repository for source code,
* a managed web-hosting platform,
* a managed PostgreSQL database,
* private authentication,
* a custom domain,
* automatic HTTPS.

The architecture should remain portable enough to move to another compatible hosting provider later.

## 17. Availability target

The application is intended for personal use and should normally be available from any internet-connected device.

The practical target is more than 95% availability.

No formal enterprise SLA is required for the initial version.

## 18. Version 1 completion criteria

Version 1 is considered usable when it supports:

* authenticated access,
* owner and account management,
* provider management,
* asset-class management,
* instrument management,
* initial holdings,
* transaction entry,
* valuation updates,
* current holdings calculation,
* weekly reports,
* monthly reports,
* portfolio XIRR,
* dividend summaries,
* JSON backup and restore,
* PNG chart export,
* responsive desktop and mobile use.