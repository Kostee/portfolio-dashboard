begin;

-- ============================================================
-- REPORT RUNS
-- ============================================================

create table public.portfolio_report_runs (
  id uuid primary key
    default gen_random_uuid(),

  workspace_id uuid not null
    references public.workspaces(id)
    on delete cascade,

  report_type text not null,

  as_of_date date not null,

  revision integer not null,

  status text not null
    default 'prepared',

  base_currency char(3) not null,

  item_count integer not null
    default 0,

  total_value_base numeric(28, 10)
    not null
    default 0,

  prepared_at timestamptz not null
    default now(),

  generated_at timestamptz,

  created_by uuid,

  created_at timestamptz not null
    default now(),

  constraint
    portfolio_report_runs_type_check
  check (
    report_type in (
      'monthly',
      'weekly'
    )
  ),

  constraint
    portfolio_report_runs_status_check
  check (
    status in (
      'prepared',
      'generated',
      'voided'
    )
  ),

  constraint
    portfolio_report_runs_revision_check
  check (
    revision > 0
  ),

  constraint
    portfolio_report_runs_item_count_check
  check (
    item_count >= 0
  ),

  constraint
    portfolio_report_runs_workspace_type_date_revision_key
  unique (
    workspace_id,
    report_type,
    as_of_date,
    revision
  )
);

create index
  portfolio_report_runs_workspace_date_idx
on public.portfolio_report_runs (
  workspace_id,
  as_of_date desc,
  revision desc
);

alter table
  public.portfolio_report_runs
enable row level security;

create policy
  portfolio_report_runs_select
on public.portfolio_report_runs
for select
to authenticated
using (
  private.can_edit_workspace(
    workspace_id
  )
);

create policy
  portfolio_report_runs_insert
on public.portfolio_report_runs
for insert
to authenticated
with check (
  private.can_edit_workspace(
    workspace_id
  )
);

create policy
  portfolio_report_runs_update
on public.portfolio_report_runs
for update
to authenticated
using (
  private.can_edit_workspace(
    workspace_id
  )
)
with check (
  private.can_edit_workspace(
    workspace_id
  )
);

create policy
  portfolio_report_runs_delete
on public.portfolio_report_runs
for delete
to authenticated
using (
  private.can_edit_workspace(
    workspace_id
  )
);

revoke all
  on public.portfolio_report_runs
  from anon;

grant select, insert, update, delete
  on public.portfolio_report_runs
  to authenticated;

grant all
  on public.portfolio_report_runs
  to service_role;


-- ============================================================
-- IMMUTABLE REPORT ITEMS
-- ============================================================

create table public.portfolio_report_items (
  id uuid primary key
    default gen_random_uuid(),

  workspace_id uuid not null
    references public.workspaces(id)
    on delete cascade,

  report_run_id uuid not null
    references public.portfolio_report_runs(id)
    on delete cascade,

  item_type text not null,

  source_snapshot_id uuid not null,
  source_snapshot_date date not null,

  account_id uuid not null,

  owner_id uuid not null,
  owner_name text not null,

  provider_id uuid not null,
  provider_name text not null,

  account_name text not null,
  account_type text not null,
  account_currency char(3) not null,

  instrument_id uuid not null,
  instrument_name text not null,
  instrument_ticker text,

  instrument_kind text not null,
  tracking_mode text not null,

  asset_class_id uuid,
  asset_class_name text,
  asset_class_sort_order integer,

  quantity numeric(28, 10),
  unit_price numeric(28, 10),

  market_value numeric(28, 10)
    not null,

  currency char(3) not null,

  market_value_base numeric(28, 10)
    not null,

  created_at timestamptz not null
    default now(),

  constraint
    portfolio_report_items_type_check
  check (
    item_type in (
      'units_position',
      'reported_balance'
    )
  ),

  constraint
    portfolio_report_items_market_value_check
  check (
    market_value >= 0
  ),

  constraint
    portfolio_report_items_market_value_base_check
  check (
    market_value_base >= 0
  ),

  constraint
    portfolio_report_items_run_item_key
  unique (
    report_run_id,
    item_type,
    account_id,
    instrument_id
  )
);

create index
  portfolio_report_items_run_idx
on public.portfolio_report_items (
  report_run_id,
  asset_class_sort_order,
  instrument_name
);

create index
  portfolio_report_items_workspace_date_idx
on public.portfolio_report_items (
  workspace_id,
  source_snapshot_date desc
);

alter table
  public.portfolio_report_items
enable row level security;

create policy
  portfolio_report_items_select
on public.portfolio_report_items
for select
to authenticated
using (
  private.can_edit_workspace(
    workspace_id
  )
);

create policy
  portfolio_report_items_insert
on public.portfolio_report_items
for insert
to authenticated
with check (
  private.can_edit_workspace(
    workspace_id
  )
);

create policy
  portfolio_report_items_update
on public.portfolio_report_items
for update
to authenticated
using (
  private.can_edit_workspace(
    workspace_id
  )
)
with check (
  private.can_edit_workspace(
    workspace_id
  )
);

create policy
  portfolio_report_items_delete
on public.portfolio_report_items
for delete
to authenticated
using (
  private.can_edit_workspace(
    workspace_id
  )
);

revoke all
  on public.portfolio_report_items
  from anon;

grant select, insert, update, delete
  on public.portfolio_report_items
  to authenticated;

grant all
  on public.portfolio_report_items
  to service_role;


-- ============================================================
-- CREATE AN IMMUTABLE MONTHLY REPORT SOURCE
-- ============================================================

create function
  public.create_monthly_report_run(
    p_workspace_id uuid,
    p_as_of_date date
  )
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_base_currency char(3);

  v_revision integer;
  v_report_run_id uuid;

  v_missing_unit_count integer;
  v_missing_reported_count integer;

  v_item_count integer;
  v_total_value_base
    numeric(28, 10);
begin
  if auth.uid() is null then
    raise exception
      'Authentication is required.';
  end if;

  if p_workspace_id is null then
    raise exception
      'Workspace is required.';
  end if;

  if p_as_of_date is null then
    raise exception
      'Report date is required.';
  end if;

  if not private.can_edit_workspace(
    p_workspace_id
  ) then
    raise exception
      'The current user cannot edit this workspace.';
  end if;

  select
    workspaces.base_currency
  into
    v_base_currency
  from public.workspaces
    as workspaces
  where workspaces.id =
    p_workspace_id
  limit 1;

  if v_base_currency is null then
    raise exception
      'The selected workspace is unavailable.';
  end if;

  -- Serialize revision creation for one workspace and date.
  perform pg_advisory_xact_lock(
    hashtextextended(
      p_workspace_id::text
      || ':monthly:'
      || p_as_of_date::text,
      0
    )
  );

  -- Every non-zero units position must have an exact,
  -- quantity-matched valuation on the report date.
  select count(*)
  into v_missing_unit_count
  from public.get_portfolio_unit_positions_as_of(
    p_workspace_id,
    p_as_of_date
  ) as positions
  where positions.snapshot_id is null
     or positions.valuation_date
          is distinct from p_as_of_date
     or positions.valuation_status
          is distinct from 'matched'
     or positions.valuation_market_value
          is null
     or positions.valuation_currency
          is null
     or positions.valuation_market_value_base
          is null;

  if v_missing_unit_count > 0 then
    raise exception
      'All units-based positions require an exact, matched valuation on the report date.';
  end if;

  -- Every active PPK account must have an exact PPK
  -- snapshot on the report date.
  select count(*)
  into v_missing_reported_count
  from public.accounts as accounts

  cross join public.instruments
    as instruments

  where accounts.workspace_id =
    p_workspace_id

    and accounts.is_active = true

    and accounts.account_type::text =
      'ppk'

    and instruments.workspace_id =
      p_workspace_id

    and instruments.is_active = true

    and instruments.tracking_mode::text =
      'balance'

    and instruments.instrument_kind::text =
      'ppk_fund'

    and not exists (
      select 1
      from public.get_portfolio_reported_balances_as_of(
        p_workspace_id,
        p_as_of_date
      ) as balances

      where balances.account_id =
        accounts.id

        and balances.instrument_id =
          instruments.id

        and balances.snapshot_date =
          p_as_of_date

        and balances.reported_balance
          is not null

        and balances.base_reported_balance
          is not null
    );

  if v_missing_reported_count > 0 then
    raise exception
      'Every PPK account requires an exact reported-balance snapshot on the report date.';
  end if;

  select
    coalesce(
      max(runs.revision),
      0
    ) + 1
  into
    v_revision
  from public.portfolio_report_runs
    as runs
  where runs.workspace_id =
    p_workspace_id

    and runs.report_type =
      'monthly'

    and runs.as_of_date =
      p_as_of_date;

  insert into
    public.portfolio_report_runs (
      workspace_id,
      report_type,
      as_of_date,
      revision,
      status,
      base_currency,
      created_by
    )
  values (
    p_workspace_id,
    'monthly',
    p_as_of_date,
    v_revision,
    'prepared',
    v_base_currency,
    auth.uid()
  )
  returning id
  into v_report_run_id;


  -- Freeze units-based positions.
  insert into
    public.portfolio_report_items (
      workspace_id,
      report_run_id,
      item_type,

      source_snapshot_id,
      source_snapshot_date,

      account_id,

      owner_id,
      owner_name,

      provider_id,
      provider_name,

      account_name,
      account_type,
      account_currency,

      instrument_id,
      instrument_name,
      instrument_ticker,

      instrument_kind,
      tracking_mode,

      asset_class_id,
      asset_class_name,
      asset_class_sort_order,

      quantity,
      unit_price,

      market_value,
      currency,
      market_value_base
    )
  select
    p_workspace_id,
    v_report_run_id,
    'units_position',

    positions.snapshot_id,
    positions.valuation_date,

    positions.account_id,

    positions.owner_id,
    positions.owner_name,

    positions.provider_id,
    positions.provider_name,

    positions.account_name,
    accounts.account_type::text,
    positions.account_currency,

    positions.instrument_id,
    positions.instrument_name,
    positions.instrument_ticker,

    instruments.instrument_kind::text,
    instruments.tracking_mode::text,

    instruments.asset_class_id,
    asset_classes.name,
    asset_classes.sort_order,

    positions.quantity,
    positions.valuation_unit_price,

    positions.valuation_market_value,
    positions.valuation_currency,
    positions.valuation_market_value_base

  from public.get_portfolio_unit_positions_as_of(
    p_workspace_id,
    p_as_of_date
  ) as positions

  join public.accounts
    as accounts
    on accounts.id =
      positions.account_id

    and accounts.workspace_id =
      positions.workspace_id

  join public.instruments
    as instruments
    on instruments.id =
      positions.instrument_id

    and instruments.workspace_id =
      positions.workspace_id

  left join public.asset_classes
    as asset_classes
    on asset_classes.id =
      instruments.asset_class_id

    and asset_classes.workspace_id =
      positions.workspace_id;


  -- Freeze all exact reported-balance snapshots.
  insert into
    public.portfolio_report_items (
      workspace_id,
      report_run_id,
      item_type,

      source_snapshot_id,
      source_snapshot_date,

      account_id,

      owner_id,
      owner_name,

      provider_id,
      provider_name,

      account_name,
      account_type,
      account_currency,

      instrument_id,
      instrument_name,
      instrument_ticker,

      instrument_kind,
      tracking_mode,

      asset_class_id,
      asset_class_name,
      asset_class_sort_order,

      quantity,
      unit_price,

      market_value,
      currency,
      market_value_base
    )
  select
    p_workspace_id,
    v_report_run_id,
    'reported_balance',

    balances.snapshot_id,
    balances.snapshot_date,

    balances.account_id,

    balances.owner_id,
    balances.owner_name,

    balances.provider_id,
    balances.provider_name,

    balances.account_name,
    accounts.account_type::text,
    balances.account_currency,

    balances.instrument_id,
    balances.instrument_name,
    balances.instrument_ticker,

    instruments.instrument_kind::text,
    instruments.tracking_mode::text,

    instruments.asset_class_id,
    asset_classes.name,
    asset_classes.sort_order,

    null,
    null,

    balances.reported_balance,
    balances.currency,
    balances.base_reported_balance

  from public.get_portfolio_reported_balances_as_of(
    p_workspace_id,
    p_as_of_date
  ) as balances

  join public.accounts
    as accounts
    on accounts.id =
      balances.account_id

    and accounts.workspace_id =
      balances.workspace_id

  join public.instruments
    as instruments
    on instruments.id =
      balances.instrument_id

    and instruments.workspace_id =
      balances.workspace_id

  left join public.asset_classes
    as asset_classes
    on asset_classes.id =
      instruments.asset_class_id

    and asset_classes.workspace_id =
      balances.workspace_id

  where balances.snapshot_date =
    p_as_of_date

    and balances.reported_balance
      is not null

    and balances.base_reported_balance
      is not null;


  select
    count(*),
    coalesce(
      sum(items.market_value_base),
      0
    )::numeric(28, 10)
  into
    v_item_count,
    v_total_value_base
  from public.portfolio_report_items
    as items
  where items.report_run_id =
    v_report_run_id;

  if v_item_count = 0 then
    raise exception
      'The report source does not contain any invested assets.';
  end if;

  update public.portfolio_report_runs
  set
    item_count =
      v_item_count,

    total_value_base =
      v_total_value_base

  where id =
    v_report_run_id;

  return v_report_run_id;
end;
$$;

revoke all on function
  public.create_monthly_report_run(
    uuid,
    date
  )
from public;

grant execute on function
  public.create_monthly_report_run(
    uuid,
    date
  )
to authenticated;


-- ============================================================
-- REPORT HISTORY VIEW
-- ============================================================

create view
  public.portfolio_monthly_report_history
with (
  security_invoker = true
)
as
select
  runs.workspace_id,
  runs.id as report_run_id,

  runs.as_of_date,
  runs.revision,
  runs.status,

  runs.base_currency,
  runs.item_count,
  runs.total_value_base,

  runs.prepared_at,
  runs.generated_at,
  runs.created_at

from public.portfolio_report_runs
  as runs

where runs.report_type =
  'monthly';

revoke all
  on public.portfolio_monthly_report_history
  from anon;

grant select
  on public.portfolio_monthly_report_history
  to authenticated, service_role;

commit;