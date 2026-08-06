begin;

-- ============================================================
-- UNIT POSITIONS AS OF DATE
-- ============================================================

create function public.get_portfolio_unit_positions_as_of(
  p_workspace_id uuid,
  p_as_of_date date
)
returns table (
  workspace_id uuid,
  as_of_date date,

  account_id uuid,
  owner_id uuid,
  owner_name text,

  provider_id uuid,
  provider_name text,

  account_name text,
  account_currency text,

  instrument_id uuid,
  instrument_name text,
  instrument_ticker text,
  instrument_exchange text,
  instrument_currency text,

  quantity numeric,
  first_activity_date date,
  last_activity_date date,

  snapshot_id uuid,
  valuation_date date,
  valuation_quantity numeric,
  valuation_unit_price numeric,
  valuation_market_value numeric,
  valuation_currency text,
  valuation_market_value_base numeric,

  valuation_status text,
  valuation_quantity_difference numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  with positions as (
    select
      entries.workspace_id,
      entries.account_id,
      entries.instrument_id,

      sum(
        entries.quantity_delta
      )::numeric(28, 10) as quantity,

      min(
        operations.operation_date
      ) as first_activity_date,

      max(
        operations.operation_date
      ) as last_activity_date

    from public.portfolio_operation_entries
      as entries

    join public.portfolio_operations
      as operations
      on operations.id =
        entries.operation_id
      and operations.workspace_id =
        entries.workspace_id

    where entries.workspace_id =
      p_workspace_id

      and operations.status = 'posted'

      and operations.operation_date <=
        p_as_of_date

      and entries.instrument_id
        is not null

    group by
      entries.workspace_id,
      entries.account_id,
      entries.instrument_id

    having sum(
      entries.quantity_delta
    ) <> 0
  )

  select
    positions.workspace_id,
    p_as_of_date,

    positions.account_id,
    accounts.owner_id,
    owners.display_name,

    accounts.provider_id,
    providers.name,

    accounts.name,
    accounts.base_currency::text,

    positions.instrument_id,
    instruments.name,
    instruments.ticker,
    instruments.exchange,
    instruments.default_currency::text,

    positions.quantity,
    positions.first_activity_date,
    positions.last_activity_date,

    latest_snapshot.id,
    latest_snapshot.snapshot_date,
    latest_snapshot.quantity,
    latest_snapshot.unit_price,
    latest_snapshot.market_value,
    latest_snapshot.currency::text,
    latest_snapshot.market_value_base,

    case
      when latest_snapshot.id is null then
        'missing'

      when latest_snapshot.quantity is null then
        'missing_quantity'

      when abs(
        latest_snapshot.quantity -
        positions.quantity
      ) <= 0.00000001 then
        'matched'

      else
        'quantity_mismatch'
    end,

    case
      when latest_snapshot.quantity is null
        then null

      else (
        latest_snapshot.quantity -
        positions.quantity
      )::numeric(28, 10)
    end

  from positions

  join public.accounts as accounts
    on accounts.id =
      positions.account_id
    and accounts.workspace_id =
      positions.workspace_id

  join public.owners as owners
    on owners.id =
      accounts.owner_id
    and owners.workspace_id =
      accounts.workspace_id

  join public.providers as providers
    on providers.id =
      accounts.provider_id
    and providers.workspace_id =
      accounts.workspace_id

  join public.instruments as instruments
    on instruments.id =
      positions.instrument_id
    and instruments.workspace_id =
      positions.workspace_id

  left join lateral (
    select snapshots.*
    from public.position_snapshots
      as snapshots

    where snapshots.workspace_id =
      positions.workspace_id

      and snapshots.account_id =
        positions.account_id

      and snapshots.instrument_id =
        positions.instrument_id

      and snapshots.snapshot_date <=
        p_as_of_date

    order by
      snapshots.snapshot_date desc,
      snapshots.updated_at desc,
      snapshots.id desc

    limit 1
  ) as latest_snapshot
    on true

  where instruments.tracking_mode = 'units';
$$;

revoke all on function
  public.get_portfolio_unit_positions_as_of(
    uuid,
    date
  )
from public;

grant execute on function
  public.get_portfolio_unit_positions_as_of(
    uuid,
    date
  )
to authenticated;


-- ============================================================
-- CASH BALANCES AS OF DATE
-- ============================================================

create function public.get_portfolio_cash_balances_as_of(
  p_workspace_id uuid,
  p_as_of_date date
)
returns table (
  workspace_id uuid,
  as_of_date date,

  account_id uuid,
  owner_id uuid,
  owner_name text,

  provider_id uuid,
  provider_name text,

  account_name text,
  account_currency text,

  currency text,
  cash_balance numeric,
  base_cash_balance numeric,

  first_activity_date date,
  last_activity_date date
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    entries.workspace_id,
    p_as_of_date,

    entries.account_id,
    accounts.owner_id,
    owners.display_name,

    accounts.provider_id,
    providers.name,

    accounts.name,
    accounts.base_currency::text,

    entries.currency::text,

    sum(
      entries.cash_delta
    )::numeric(28, 10),

    case
      when count(
        entries.base_cash_delta
      ) = count(*) then
        sum(
          entries.base_cash_delta
        )::numeric(28, 10)

      else null
    end,

    min(
      operations.operation_date
    ),

    max(
      operations.operation_date
    )

  from public.portfolio_operation_entries
    as entries

  join public.portfolio_operations
    as operations
    on operations.id =
      entries.operation_id
    and operations.workspace_id =
      entries.workspace_id

  join public.accounts as accounts
    on accounts.id =
      entries.account_id
    and accounts.workspace_id =
      entries.workspace_id

  join public.owners as owners
    on owners.id =
      accounts.owner_id
    and owners.workspace_id =
      accounts.workspace_id

  join public.providers as providers
    on providers.id =
      accounts.provider_id
    and providers.workspace_id =
      accounts.workspace_id

  where entries.workspace_id =
    p_workspace_id

    and operations.status = 'posted'

    and operations.operation_date <=
      p_as_of_date

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

  having sum(
    entries.cash_delta
  ) <> 0;
$$;

revoke all on function
  public.get_portfolio_cash_balances_as_of(
    uuid,
    date
  )
from public;

grant execute on function
  public.get_portfolio_cash_balances_as_of(
    uuid,
    date
  )
to authenticated;


-- ============================================================
-- REPORTED BALANCES AS OF DATE
-- ============================================================

create function public.get_portfolio_reported_balances_as_of(
  p_workspace_id uuid,
  p_as_of_date date
)
returns table (
  workspace_id uuid,
  as_of_date date,

  account_id uuid,
  owner_id uuid,
  owner_name text,

  provider_id uuid,
  provider_name text,

  account_name text,
  account_currency text,

  instrument_id uuid,
  instrument_name text,
  instrument_ticker text,

  snapshot_id uuid,
  snapshot_date date,

  currency text,
  reported_balance numeric,
  base_reported_balance numeric,

  first_snapshot_date date
)
language sql
stable
security invoker
set search_path = ''
as $$
  with ranked_snapshots as (
    select
      snapshots.*,

      min(
        snapshots.snapshot_date
      ) over (
        partition by
          snapshots.workspace_id,
          snapshots.account_id,
          snapshots.instrument_id
      ) as first_snapshot_date,

      row_number() over (
        partition by
          snapshots.workspace_id,
          snapshots.account_id,
          snapshots.instrument_id

        order by
          snapshots.snapshot_date desc,
          snapshots.updated_at desc,
          snapshots.id desc
      ) as snapshot_rank

    from public.position_snapshots
      as snapshots

    join public.instruments
      as filtered_instruments
      on filtered_instruments.id =
        snapshots.instrument_id
      and filtered_instruments.workspace_id =
        snapshots.workspace_id

    where snapshots.workspace_id =
      p_workspace_id

      and snapshots.snapshot_date <=
        p_as_of_date

      and filtered_instruments.tracking_mode =
        'balance'
  )

  select
    ranked.workspace_id,
    p_as_of_date,

    ranked.account_id,
    accounts.owner_id,
    owners.display_name,

    accounts.provider_id,
    providers.name,

    accounts.name,
    accounts.base_currency::text,

    ranked.instrument_id,
    instruments.name,
    instruments.ticker,

    ranked.id,
    ranked.snapshot_date,

    ranked.currency::text,
    ranked.market_value::numeric(28, 10),
    ranked.market_value_base::numeric(28, 10),

    ranked.first_snapshot_date

  from ranked_snapshots as ranked

  join public.accounts as accounts
    on accounts.id =
      ranked.account_id
    and accounts.workspace_id =
      ranked.workspace_id

  join public.owners as owners
    on owners.id =
      accounts.owner_id
    and owners.workspace_id =
      accounts.workspace_id

  join public.providers as providers
    on providers.id =
      accounts.provider_id
    and providers.workspace_id =
      accounts.workspace_id

  join public.instruments as instruments
    on instruments.id =
      ranked.instrument_id
    and instruments.workspace_id =
      ranked.workspace_id

  where ranked.snapshot_rank = 1;
$$;

revoke all on function
  public.get_portfolio_reported_balances_as_of(
    uuid,
    date
  )
from public;

grant execute on function
  public.get_portfolio_reported_balances_as_of(
    uuid,
    date
  )
to authenticated;

commit;