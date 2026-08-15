begin;

-- ============================================================
-- HISTORICAL NBP FX RATES
-- ============================================================
--
-- Backfill daily EUR/PLN and USD/PLN rates required by
-- historical foreign-currency ledger entries.
--
-- Rates are official NBP Table A mid rates for the exact
-- operation dates.
-- ============================================================

with nbp_rates (
  rate_date,
  from_currency,
  to_currency,
  rate,
  table_no
) as (
  values
    (date '2026-06-15', 'EUR', 'PLN', 4.2447::numeric, '113/A/NBP/2026'),
    (date '2026-06-15', 'USD', 'PLN', 3.6588::numeric, '113/A/NBP/2026'),
    (date '2026-06-17', 'USD', 'PLN', 3.6542::numeric, '115/A/NBP/2026'),
    (date '2026-06-22', 'EUR', 'PLN', 4.2693::numeric, '118/A/NBP/2026'),
    (date '2026-06-22', 'USD', 'PLN', 3.7282::numeric, '118/A/NBP/2026'),
    (date '2026-06-25', 'USD', 'PLN', 3.7720::numeric, '121/A/NBP/2026'),
    (date '2026-06-29', 'EUR', 'PLN', 4.2890::numeric, '123/A/NBP/2026'),
    (date '2026-06-29', 'USD', 'PLN', 3.7636::numeric, '123/A/NBP/2026'),
    (date '2026-07-01', 'EUR', 'PLN', 4.2976::numeric, '125/A/NBP/2026'),
    (date '2026-07-03', 'EUR', 'PLN', 4.2857::numeric, '127/A/NBP/2026'),
    (date '2026-07-06', 'USD', 'PLN', 3.7540::numeric, '128/A/NBP/2026'),
    (date '2026-07-15', 'EUR', 'PLN', 4.3275::numeric, '135/A/NBP/2026'),
    (date '2026-07-15', 'USD', 'PLN', 3.7879::numeric, '135/A/NBP/2026'),
    (date '2026-07-17', 'USD', 'PLN', 3.7951::numeric, '137/A/NBP/2026'),
    (date '2026-07-20', 'USD', 'PLN', 3.7906::numeric, '138/A/NBP/2026'),
    (date '2026-07-21', 'USD', 'PLN', 3.7885::numeric, '139/A/NBP/2026'),
    (date '2026-07-27', 'EUR', 'PLN', 4.3139::numeric, '143/A/NBP/2026'),
    (date '2026-07-27', 'USD', 'PLN', 3.7835::numeric, '143/A/NBP/2026'),
    (date '2026-07-31', 'USD', 'PLN', 3.7425::numeric, '147/A/NBP/2026'),
    (date '2026-08-03', 'USD', 'PLN', 3.7330::numeric, '148/A/NBP/2026'),
    (date '2026-08-05', 'USD', 'PLN', 3.7320::numeric, '150/A/NBP/2026'),
    (date '2026-08-10', 'EUR', 'PLN', 4.3037::numeric, '153/A/NBP/2026'),
    (date '2026-08-10', 'USD', 'PLN', 3.7226::numeric, '153/A/NBP/2026')
),
required_workspace_rates as (
  select distinct
    operations.workspace_id,
    rates.rate_date,
    rates.from_currency,
    rates.to_currency,
    rates.rate,
    rates.table_no
  from nbp_rates rates
  join public.portfolio_operations operations
    on operations.operation_date = rates.rate_date
   and operations.status::text = 'posted'
  join public.portfolio_operation_entries entries
    on entries.workspace_id = operations.workspace_id
   and entries.operation_id = operations.id
   and entries.currency = rates.from_currency
   and entries.cash_delta <> 0
   and entries.base_cash_delta is null
)
insert into public.exchange_rates (
  workspace_id,
  rate_date,
  from_currency,
  to_currency,
  rate,
  source,
  notes
)
select
  required.workspace_id,
  required.rate_date,
  required.from_currency,
  required.to_currency,
  required.rate,
  'import',
  'Official NBP Table A historical mid rate; '
    || required.table_no
    || '; ledger FX backfill.'
from required_workspace_rates required
where not exists (
  select 1
  from public.exchange_rates existing
  where existing.workspace_id =
      required.workspace_id
    and existing.rate_date =
      required.rate_date
    and existing.from_currency =
      required.from_currency
    and existing.to_currency =
      required.to_currency
);

-- ============================================================
-- LEDGER BASE-CURRENCY BACKFILL
-- ============================================================
--
-- Existing explicit FX rates, if any, take precedence.
-- Otherwise the exact-date NBP rate inserted above is used.
--
-- Existing populated base-currency values are never overwritten.
-- ============================================================

with eligible_entries as (
  select
    entries.id,
    coalesce(
      entries.fx_rate_to_base,
      rates.rate
    ) as effective_fx_rate
  from public.portfolio_operation_entries entries
  join public.portfolio_operations operations
    on operations.workspace_id =
        entries.workspace_id
   and operations.id =
        entries.operation_id
  join public.exchange_rates rates
    on rates.workspace_id =
        entries.workspace_id
   and rates.rate_date =
        operations.operation_date
   and rates.from_currency =
        entries.currency
   and rates.to_currency =
        'PLN'
  where operations.status::text =
      'posted'
    and entries.currency in (
      'EUR',
      'USD'
    )
    and entries.cash_delta <> 0
    and entries.base_cash_delta
        is null
)
update public.portfolio_operation_entries entries
set
  fx_rate_to_base =
    eligible.effective_fx_rate,

  base_cash_delta =
    round(
      entries.cash_delta *
      eligible.effective_fx_rate,
      10
    ),

  base_value_delta =
    case
      when entries.base_value_delta
        is not null
      then entries.base_value_delta
      else round(
        entries.value_delta *
        eligible.effective_fx_rate,
        10
      )
    end,

  updated_at = now()
from eligible_entries eligible
where entries.id =
  eligible.id;

commit;