begin;

create or replace view public.portfolio_operation_legs
with (security_invoker = true)
as
select
  operations.workspace_id,

  operations.id as operation_id,
  entries.id as entry_id,

  operations.operation_date,
  operations.executed_at,

  case
    when operations.executed_at is null then null
    else timezone(
      workspaces.timezone,
      operations.executed_at
    )
  end as executed_at_local,

  case
    when operations.executed_at is null then null
    else timezone(
      workspaces.timezone,
      operations.executed_at
    )::time(0)
  end as operation_time_local,

  operations.operation_type,
  operations.status,
  operations.source,
  operations.description,
  operations.notes,

  entries.sequence_no,

  owners.id as owner_id,
  owners.display_name as owner_name,

  providers.id as provider_id,
  providers.name as provider_name,

  accounts.id as account_id,
  accounts.name as account_name,
  accounts.base_currency as account_base_currency,

  entries.instrument_id,
  instruments.name as instrument_name,
  instruments.ticker as instrument_ticker,

  entries.component,
  entries.quantity_delta,
  entries.cash_delta,
  entries.value_delta,
  entries.currency,
  entries.unit_price,
  entries.fx_rate_to_base,
  entries.base_cash_delta,
  entries.base_value_delta,

  operations.created_at as operation_created_at
from public.portfolio_operations as operations
join public.workspaces as workspaces
  on workspaces.id = operations.workspace_id
join public.portfolio_operation_entries as entries
  on entries.workspace_id = operations.workspace_id
  and entries.operation_id = operations.id
join public.accounts as accounts
  on accounts.workspace_id = entries.workspace_id
  and accounts.id = entries.account_id
join public.owners as owners
  on owners.workspace_id = accounts.workspace_id
  and owners.id = accounts.owner_id
join public.providers as providers
  on providers.workspace_id = accounts.workspace_id
  and providers.id = accounts.provider_id
left join public.instruments as instruments
  on instruments.workspace_id = entries.workspace_id
  and instruments.id = entries.instrument_id;

revoke all on public.portfolio_operation_legs from anon;

grant select
  on public.portfolio_operation_legs
  to authenticated, service_role;

commit;