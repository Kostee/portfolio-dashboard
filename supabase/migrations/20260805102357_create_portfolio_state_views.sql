begin;

-- ============================================================
-- CURRENT UNIT POSITIONS
-- ============================================================

create or replace view public.portfolio_current_unit_positions
with (security_invoker = true)
as
select
  entries.workspace_id,

  entries.account_id,
  accounts.owner_id,
  owners.display_name as owner_name,

  accounts.provider_id,
  providers.name as provider_name,

  accounts.name as account_name,
  accounts.base_currency as account_currency,

  entries.instrument_id,
  instruments.name as instrument_name,
  instruments.ticker as instrument_ticker,
  instruments.exchange as instrument_exchange,
  instruments.default_currency as instrument_currency,

  sum(entries.quantity_delta)::numeric(28, 10)
    as quantity,

  min(operations.operation_date)
    as first_activity_date,

  max(operations.operation_date)
    as last_activity_date

from public.portfolio_operation_entries as entries

join public.portfolio_operations as operations
  on operations.id = entries.operation_id
  and operations.workspace_id = entries.workspace_id

join public.accounts as accounts
  on accounts.id = entries.account_id
  and accounts.workspace_id = entries.workspace_id

join public.owners as owners
  on owners.id = accounts.owner_id
  and owners.workspace_id = accounts.workspace_id

join public.providers as providers
  on providers.id = accounts.provider_id
  and providers.workspace_id = accounts.workspace_id

join public.instruments as instruments
  on instruments.id = entries.instrument_id
  and instruments.workspace_id = entries.workspace_id

where operations.status = 'posted'
  and instruments.tracking_mode = 'units'

group by
  entries.workspace_id,
  entries.account_id,
  accounts.owner_id,
  owners.display_name,
  accounts.provider_id,
  providers.name,
  accounts.name,
  accounts.base_currency,
  entries.instrument_id,
  instruments.name,
  instruments.ticker,
  instruments.exchange,
  instruments.default_currency

having sum(entries.quantity_delta) <> 0;

revoke all
  on public.portfolio_current_unit_positions
  from anon;

grant select
  on public.portfolio_current_unit_positions
  to authenticated, service_role;

-- ============================================================
-- CURRENT CASH BALANCES
-- ============================================================

create or replace view public.portfolio_current_cash_balances
with (security_invoker = true)
as
select
  entries.workspace_id,

  entries.account_id,
  accounts.owner_id,
  owners.display_name as owner_name,

  accounts.provider_id,
  providers.name as provider_name,

  accounts.name as account_name,
  accounts.base_currency as account_currency,

  entries.currency,

  sum(entries.cash_delta)::numeric(28, 10)
    as cash_balance,

  case
    when count(entries.base_cash_delta) = count(*)
      then sum(entries.base_cash_delta)::numeric(28, 10)
    else null
  end as base_cash_balance,

  min(operations.operation_date)
    as first_activity_date,

  max(operations.operation_date)
    as last_activity_date

from public.portfolio_operation_entries as entries

join public.portfolio_operations as operations
  on operations.id = entries.operation_id
  and operations.workspace_id = entries.workspace_id

join public.accounts as accounts
  on accounts.id = entries.account_id
  and accounts.workspace_id = entries.workspace_id

join public.owners as owners
  on owners.id = accounts.owner_id
  and owners.workspace_id = accounts.workspace_id

join public.providers as providers
  on providers.id = accounts.provider_id
  and providers.workspace_id = accounts.workspace_id

where operations.status = 'posted'
  and entries.cash_delta <> 0

group by
  entries.workspace_id,
  entries.account_id,
  accounts.owner_id,
  owners.display_name,
  accounts.provider_id,
  providers.name,
  accounts.name,
  accounts.base_currency,
  entries.currency

having sum(entries.cash_delta) <> 0;

revoke all
  on public.portfolio_current_cash_balances
  from anon;

grant select
  on public.portfolio_current_cash_balances
  to authenticated, service_role;

-- ============================================================
-- CURRENT REPORTED BALANCES
-- ============================================================

create or replace view public.portfolio_current_reported_balances
with (security_invoker = true)
as
select
  entries.workspace_id,

  entries.account_id,
  accounts.owner_id,
  owners.display_name as owner_name,

  accounts.provider_id,
  providers.name as provider_name,

  accounts.name as account_name,
  accounts.base_currency as account_currency,

  entries.instrument_id,
  instruments.name as instrument_name,
  instruments.ticker as instrument_ticker,

  entries.currency,

  sum(entries.value_delta)::numeric(28, 10)
    as reported_balance,

  case
    when count(entries.base_value_delta) = count(*)
      then sum(entries.base_value_delta)::numeric(28, 10)
    else null
  end as base_reported_balance,

  min(operations.operation_date)
    as first_activity_date,

  max(operations.operation_date)
    as last_activity_date

from public.portfolio_operation_entries as entries

join public.portfolio_operations as operations
  on operations.id = entries.operation_id
  and operations.workspace_id = entries.workspace_id

join public.accounts as accounts
  on accounts.id = entries.account_id
  and accounts.workspace_id = entries.workspace_id

join public.owners as owners
  on owners.id = accounts.owner_id
  and owners.workspace_id = accounts.workspace_id

join public.providers as providers
  on providers.id = accounts.provider_id
  and providers.workspace_id = accounts.workspace_id

join public.instruments as instruments
  on instruments.id = entries.instrument_id
  and instruments.workspace_id = entries.workspace_id

where operations.status = 'posted'
  and instruments.tracking_mode = 'balance'

group by
  entries.workspace_id,
  entries.account_id,
  accounts.owner_id,
  owners.display_name,
  accounts.provider_id,
  providers.name,
  accounts.name,
  accounts.base_currency,
  entries.instrument_id,
  instruments.name,
  instruments.ticker,
  entries.currency

having sum(entries.value_delta) <> 0;

revoke all
  on public.portfolio_current_reported_balances
  from anon;

grant select
  on public.portfolio_current_reported_balances
  to authenticated, service_role;

-- ============================================================
-- SUPPORTING INDEXES
-- ============================================================

create index if not exists
  portfolio_entries_unit_state_idx
on public.portfolio_operation_entries (
  workspace_id,
  account_id,
  instrument_id
)
where instrument_id is not null;

create index if not exists
  portfolio_entries_cash_state_idx
on public.portfolio_operation_entries (
  workspace_id,
  account_id,
  currency
)
where cash_delta <> 0;

commit;