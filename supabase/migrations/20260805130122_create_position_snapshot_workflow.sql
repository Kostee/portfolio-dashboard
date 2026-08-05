begin;

-- Jeden snapshot danego instrumentu na rachunku i dzień.
create unique index if not exists
  position_snapshots_workspace_account_instrument_date_uidx
on public.position_snapshots (
  workspace_id,
  account_id,
  instrument_id,
  snapshot_date
);

create index if not exists
  position_snapshots_workspace_date_idx
on public.position_snapshots (
  workspace_id,
  snapshot_date desc
);

-- ============================================================
-- UPSERT POSITION SNAPSHOT
-- ============================================================

create function public.upsert_position_snapshot(
  p_account_id uuid,
  p_instrument_id uuid,
  p_snapshot_date date,
  p_market_value numeric,
  p_currency text,
  p_quantity numeric default null,
  p_unit_price numeric default null,
  p_market_value_base numeric default null,
  p_notes text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_account_workspace_id uuid;
  v_instrument_workspace_id uuid;
  v_workspace_id uuid;

  v_workspace_base_currency char(3);
  v_tracking_mode text;

  v_currency char(3);
  v_market_value_base numeric(28, 10);
  v_fx_rate_to_base numeric(28, 10);

  v_quantity numeric(28, 10);
  v_unit_price numeric(28, 10);
  v_notes text;

  v_snapshot_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  if p_account_id is null then
    raise exception 'Account is required.';
  end if;

  if p_instrument_id is null then
    raise exception 'Instrument is required.';
  end if;

  if p_snapshot_date is null then
    raise exception 'Snapshot date is required.';
  end if;

  if p_market_value is null or p_market_value < 0 then
    raise exception
      'Market value cannot be negative.';
  end if;

  if p_currency is null
     or upper(btrim(p_currency)) !~ '^[A-Z]{3}$' then
    raise exception
      'Currency must use a three-letter code.';
  end if;

  if p_quantity is not null and p_quantity < 0 then
    raise exception
      'Quantity cannot be negative.';
  end if;

  if p_unit_price is not null and p_unit_price < 0 then
    raise exception
      'Unit price cannot be negative.';
  end if;

  if p_market_value_base is not null
     and p_market_value_base < 0 then
    raise exception
      'Base-currency value cannot be negative.';
  end if;

  v_currency := upper(btrim(p_currency));
  v_notes := nullif(btrim(p_notes), '');

  select
    accounts.workspace_id,
    workspaces.base_currency
  into
    v_account_workspace_id,
    v_workspace_base_currency
  from public.accounts as accounts
  join public.workspaces as workspaces
    on workspaces.id = accounts.workspace_id
  where accounts.id = p_account_id
    and accounts.is_active = true
  limit 1;

  if v_account_workspace_id is null then
    raise exception
      'The selected account is unavailable.';
  end if;

  select
    instruments.workspace_id,
    instruments.tracking_mode::text
  into
    v_instrument_workspace_id,
    v_tracking_mode
  from public.instruments as instruments
  where instruments.id = p_instrument_id
    and instruments.is_active = true
  limit 1;

  if v_instrument_workspace_id is null then
    raise exception
      'The selected instrument is unavailable.';
  end if;

  if v_account_workspace_id <> v_instrument_workspace_id then
    raise exception
      'Account and instrument must belong to the same workspace.';
  end if;

  v_workspace_id := v_account_workspace_id;

  if not private.can_edit_workspace(v_workspace_id) then
    raise exception
      'The current user cannot edit this workspace.';
  end if;

  if v_tracking_mode = 'units' then
    if p_quantity is null then
      raise exception
        'Quantity is required for a units-based instrument.';
    end if;

    v_quantity := p_quantity;
    v_unit_price := p_unit_price;
  else
    v_quantity := null;
    v_unit_price := null;
  end if;

  if v_currency = v_workspace_base_currency then
    v_market_value_base := p_market_value;
    v_fx_rate_to_base := 1;
  elsif p_market_value_base is not null then
    v_market_value_base := p_market_value_base;

    v_fx_rate_to_base :=
      case
        when p_market_value = 0 then null
        else p_market_value_base / p_market_value
      end;
  else
    v_market_value_base := null;
    v_fx_rate_to_base := null;
  end if;

  insert into public.position_snapshots (
    workspace_id,
    account_id,
    instrument_id,
    snapshot_date,
    quantity,
    unit_price,
    market_value,
    currency,
    fx_rate_to_base,
    market_value_base,
    source,
    notes,
    created_by
  )
  values (
    v_workspace_id,
    p_account_id,
    p_instrument_id,
    p_snapshot_date,
    v_quantity,
    v_unit_price,
    p_market_value,
    v_currency,
    v_fx_rate_to_base,
    v_market_value_base,
    'manual',
    v_notes,
    auth.uid()
  )
  on conflict (
    workspace_id,
    account_id,
    instrument_id,
    snapshot_date
  )
  do update set
    quantity = excluded.quantity,
    unit_price = excluded.unit_price,
    market_value = excluded.market_value,
    currency = excluded.currency,
    fx_rate_to_base = excluded.fx_rate_to_base,
    market_value_base = excluded.market_value_base,
    source = excluded.source,
    notes = excluded.notes,
    updated_at = now()
  returning id into v_snapshot_id;

  return v_snapshot_id;
end;
$$;

revoke all on function public.upsert_position_snapshot(
  uuid,
  uuid,
  date,
  numeric,
  text,
  numeric,
  numeric,
  numeric,
  text
) from public;

grant execute on function public.upsert_position_snapshot(
  uuid,
  uuid,
  date,
  numeric,
  text,
  numeric,
  numeric,
  numeric,
  text
) to authenticated;

-- ============================================================
-- SNAPSHOT HISTORY
-- ============================================================

create or replace view public.portfolio_position_snapshot_history
with (security_invoker = true)
as
select
  snapshots.workspace_id,

  snapshots.id as snapshot_id,
  snapshots.snapshot_date,

  snapshots.account_id,
  accounts.owner_id,
  owners.display_name as owner_name,

  accounts.provider_id,
  providers.name as provider_name,

  accounts.name as account_name,
  accounts.base_currency as account_currency,

  snapshots.instrument_id,
  instruments.name as instrument_name,
  instruments.ticker as instrument_ticker,
  instruments.tracking_mode,

  snapshots.quantity,
  snapshots.unit_price,
  snapshots.market_value,
  snapshots.currency,
  snapshots.fx_rate_to_base,
  snapshots.market_value_base,
  snapshots.source,
  snapshots.notes,
  snapshots.created_at,
  snapshots.updated_at

from public.position_snapshots as snapshots

join public.accounts as accounts
  on accounts.id = snapshots.account_id
  and accounts.workspace_id = snapshots.workspace_id

join public.owners as owners
  on owners.id = accounts.owner_id
  and owners.workspace_id = accounts.workspace_id

join public.providers as providers
  on providers.id = accounts.provider_id
  and providers.workspace_id = accounts.workspace_id

join public.instruments as instruments
  on instruments.id = snapshots.instrument_id
  and instruments.workspace_id = snapshots.workspace_id;

revoke all
  on public.portfolio_position_snapshot_history
  from anon;

grant select
  on public.portfolio_position_snapshot_history
  to authenticated, service_role;

-- ============================================================
-- LATEST SNAPSHOT PER ACCOUNT AND INSTRUMENT
-- ============================================================

create or replace view public.portfolio_latest_position_snapshots
with (security_invoker = true)
as
select distinct on (
  history.workspace_id,
  history.account_id,
  history.instrument_id
)
  history.*,

  min(history.snapshot_date) over (
    partition by
      history.workspace_id,
      history.account_id,
      history.instrument_id
  ) as first_snapshot_date

from public.portfolio_position_snapshot_history as history

order by
  history.workspace_id,
  history.account_id,
  history.instrument_id,
  history.snapshot_date desc,
  history.updated_at desc,
  history.snapshot_id desc;

revoke all
  on public.portfolio_latest_position_snapshots
  from anon;

grant select
  on public.portfolio_latest_position_snapshots
  to authenticated, service_role;

-- ============================================================
-- CURRENT REPORTED BALANCES = LATEST SNAPSHOT
-- ============================================================

drop view if exists
  public.portfolio_current_reported_balances;

create view public.portfolio_current_reported_balances
with (security_invoker = true)
as
select
  latest.workspace_id,

  latest.account_id,
  latest.owner_id,
  latest.owner_name,

  latest.provider_id,
  latest.provider_name,

  latest.account_name,
  latest.account_currency,

  latest.instrument_id,
  latest.instrument_name,
  latest.instrument_ticker,

  latest.currency,

  latest.market_value::numeric(28, 10)
    as reported_balance,

  latest.market_value_base::numeric(28, 10)
    as base_reported_balance,

  latest.first_snapshot_date
    as first_activity_date,

  latest.snapshot_date
    as last_activity_date

from public.portfolio_latest_position_snapshots as latest

where latest.tracking_mode = 'balance';

revoke all
  on public.portfolio_current_reported_balances
  from anon;

grant select
  on public.portfolio_current_reported_balances
  to authenticated, service_role;

commit;