begin;

-- ============================================================
-- WEEKLY / CUSTOM-RANGE OPERATION REPORTS
--
-- "Weekly" describes the workflow, not a fixed seven-day range.
-- A report may cover any inclusive [from_date, to_date] range.
-- Regenerating exactly the same range replaces its frozen items
-- and increments revision.
-- ============================================================

create table public.portfolio_weekly_report_runs (
  id uuid primary key
    default gen_random_uuid(),

  workspace_id uuid not null
    references public.workspaces(id)
    on delete cascade,

  from_date date not null,
  to_date date not null,

  revision integer not null
    default 1
    check (revision > 0),

  base_currency text not null,

  external_contributions_base
    numeric(28, 10) not null
    default 0,

  bought_base
    numeric(28, 10) not null
    default 0,

  sold_base
    numeric(28, 10) not null
    default 0,

  net_trading_base
    numeric(28, 10) not null
    default 0,

  /*
   * Frozen FX metadata used when operation
   * entries did not already contain a base value.
   *
   * Example element:
   * {
   *   "currency": "USD",
   *   "operationDate": "2026-08-10",
   *   "rateDate": "2026-08-10",
   *   "rateToBase": 3.75,
   *   "source": "NBP_A"
   * }
   */
  fx_rates jsonb not null
    default '[]'::jsonb,

  item_count integer not null
    default 0
    check (item_count >= 0),

  generated_at timestamptz not null
    default now(),

  created_at timestamptz not null
    default now(),

  updated_at timestamptz not null
    default now(),

  constraint
    portfolio_weekly_report_runs_date_range_check
    check (from_date <= to_date),

  constraint
    portfolio_weekly_report_runs_range_key
    unique (
      workspace_id,
      from_date,
      to_date
    )
);


create table public.portfolio_weekly_report_items (
  id uuid primary key
    default gen_random_uuid(),

  workspace_id uuid not null
    references public.workspaces(id)
    on delete cascade,

  report_run_id uuid not null
    references public.portfolio_weekly_report_runs(id)
    on delete cascade,

  instrument_id uuid not null
    references public.instruments(id),

  instrument_name text not null,
  instrument_ticker text,

  asset_class_id uuid
    references public.asset_classes(id),

  asset_class_name text not null,
  asset_class_code text,
  asset_class_color text not null,
  asset_class_sort_order integer not null
    default 999,

  buy_quantity
    numeric(28, 10) not null
    default 0,

  sell_quantity
    numeric(28, 10) not null
    default 0,

  net_quantity
    numeric(28, 10) not null
    default 0,

  bought_base
    numeric(28, 10) not null
    default 0,

  sold_base
    numeric(28, 10) not null
    default 0,

  /*
   * Positive = net purchase.
   * Negative = net sale.
   */
  net_value_base
    numeric(28, 10) not null
    default 0,

  operation_count integer not null
    default 0
    check (operation_count >= 0),

  /*
   * Audit-only frozen references to the source
   * portfolio_operations included in this item.
   */
  operation_ids jsonb not null
    default '[]'::jsonb,

  created_at timestamptz not null
    default now(),

  constraint
    portfolio_weekly_report_items_instrument_key
    unique (
      report_run_id,
      instrument_id
    )
);


create index
  portfolio_weekly_report_runs_workspace_dates_idx
on public.portfolio_weekly_report_runs (
  workspace_id,
  from_date desc,
  to_date desc
);


create index
  portfolio_weekly_report_items_run_idx
on public.portfolio_weekly_report_items (
  report_run_id
);


create index
  portfolio_weekly_report_items_asset_class_idx
on public.portfolio_weekly_report_items (
  report_run_id,
  asset_class_sort_order,
  asset_class_name
);


-- ============================================================
-- RLS
-- ============================================================

alter table
  public.portfolio_weekly_report_runs
enable row level security;

alter table
  public.portfolio_weekly_report_items
enable row level security;


create policy
  portfolio_weekly_report_runs_member_access
on public.portfolio_weekly_report_runs
for all
to authenticated
using (
  exists (
    select 1
    from public.workspace_members
      as members
    where members.workspace_id =
      portfolio_weekly_report_runs.workspace_id
  )
)
with check (
  exists (
    select 1
    from public.workspace_members
      as members
    where members.workspace_id =
      portfolio_weekly_report_runs.workspace_id
  )
);


create policy
  portfolio_weekly_report_items_member_access
on public.portfolio_weekly_report_items
for all
to authenticated
using (
  exists (
    select 1
    from public.workspace_members
      as members
    where members.workspace_id =
      portfolio_weekly_report_items.workspace_id
  )
)
with check (
  exists (
    select 1
    from public.workspace_members
      as members
    where members.workspace_id =
      portfolio_weekly_report_items.workspace_id
  )
);


grant
  select,
  insert,
  update,
  delete
on public.portfolio_weekly_report_runs
to authenticated;

grant
  select,
  insert,
  update,
  delete
on public.portfolio_weekly_report_items
to authenticated;


-- ============================================================
-- ATOMIC CREATE / REPLACE
-- ============================================================

create function
  public.replace_weekly_operation_report(
    p_workspace_id uuid,
    p_from_date date,
    p_to_date date,
    p_bought_base numeric,
    p_sold_base numeric,
    p_fx_rates jsonb,
    p_items jsonb
  )
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_role text;

  v_base_currency text;

  v_report_run_id uuid;
  v_existing_revision integer;

  v_cumulative_before numeric;
  v_cumulative_end numeric;

  v_external_contributions numeric;

  v_item_count integer;
begin
  if auth.uid() is null then
    raise exception
      'Authentication is required.';
  end if;

  if p_from_date is null
     or p_to_date is null
     or p_from_date > p_to_date then
    raise exception
      'Invalid weekly report date range.';
  end if;

  if p_bought_base is null
     or p_bought_base < 0
     or p_sold_base is null
     or p_sold_base < 0 then
    raise exception
      'Invalid weekly report trading totals.';
  end if;

  if p_items is null
     or jsonb_typeof(p_items) <> 'array' then
    raise exception
      'Weekly report items must be a JSON array.';
  end if;

  if p_fx_rates is null
     or jsonb_typeof(p_fx_rates) <> 'array' then
    raise exception
      'Weekly report FX rates must be a JSON array.';
  end if;


  select
    members.role::text
  into
    v_role
  from public.workspace_members
    as members
  where members.workspace_id =
    p_workspace_id
  limit 1;

  if v_role is null then
    raise exception
      'Workspace membership is required.';
  end if;

  if v_role not in (
    'admin',
    'editor'
  ) then
    raise exception
      'Editor access is required.';
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
      'Workspace not found.';
  end if;


  -- ----------------------------------------------------------
  -- External contributions in the selected inclusive range.
  --
  -- Using the existing cumulative-contribution engine ensures
  -- that Funding Routes and linked destination deposits keep
  -- exactly the same semantics as the rest of the application.
  -- ----------------------------------------------------------

  select
    cumulative_value
  into
    v_cumulative_end
  from private.calculate_cumulative_contributions_as_of(
    p_workspace_id,
    p_to_date
  );


  select
    cumulative_value
  into
    v_cumulative_before
  from private.calculate_cumulative_contributions_as_of(
    p_workspace_id,
    p_from_date - 1
  );


  v_external_contributions :=
    coalesce(
      v_cumulative_end,
      0
    )
    -
    coalesce(
      v_cumulative_before,
      0
    );


  v_item_count :=
    jsonb_array_length(
      p_items
    );


  -- ----------------------------------------------------------
  -- Existing exact range: replace it and increment revision.
  -- ----------------------------------------------------------

  select
    runs.id,
    runs.revision
  into
    v_report_run_id,
    v_existing_revision
  from public.portfolio_weekly_report_runs
    as runs
  where runs.workspace_id =
      p_workspace_id
    and runs.from_date =
      p_from_date
    and runs.to_date =
      p_to_date
  for update;


  if v_report_run_id is null then
    insert into
      public.portfolio_weekly_report_runs (
        workspace_id,
        from_date,
        to_date,
        revision,
        base_currency,
        external_contributions_base,
        bought_base,
        sold_base,
        net_trading_base,
        fx_rates,
        item_count,
        generated_at,
        created_at,
        updated_at
      )
    values (
      p_workspace_id,
      p_from_date,
      p_to_date,
      1,
      v_base_currency,
      v_external_contributions,
      p_bought_base,
      p_sold_base,
      p_bought_base -
        p_sold_base,
      p_fx_rates,
      v_item_count,
      now(),
      now(),
      now()
    )
    returning id
    into v_report_run_id;

  else
    update
      public.portfolio_weekly_report_runs
    set
      revision =
        v_existing_revision + 1,

      base_currency =
        v_base_currency,

      external_contributions_base =
        v_external_contributions,

      bought_base =
        p_bought_base,

      sold_base =
        p_sold_base,

      net_trading_base =
        p_bought_base -
        p_sold_base,

      fx_rates =
        p_fx_rates,

      item_count =
        v_item_count,

      generated_at =
        now(),

      updated_at =
        now()

    where id =
      v_report_run_id;


    delete from
      public.portfolio_weekly_report_items
    where report_run_id =
      v_report_run_id;
  end if;


  -- ----------------------------------------------------------
  -- Freeze one NET item per instrument.
  -- ----------------------------------------------------------

  insert into
    public.portfolio_weekly_report_items (
      workspace_id,
      report_run_id,

      instrument_id,
      instrument_name,
      instrument_ticker,

      asset_class_id,
      asset_class_name,
      asset_class_code,
      asset_class_color,
      asset_class_sort_order,

      buy_quantity,
      sell_quantity,
      net_quantity,

      bought_base,
      sold_base,
      net_value_base,

      operation_count,
      operation_ids
    )

  select
    p_workspace_id,
    v_report_run_id,

    source.instrument_id,
    source.instrument_name,
    source.instrument_ticker,

    source.asset_class_id,
    source.asset_class_name,
    source.asset_class_code,
    source.asset_class_color,
    source.asset_class_sort_order,

    source.buy_quantity,
    source.sell_quantity,
    source.net_quantity,

    source.bought_base,
    source.sold_base,
    source.net_value_base,

    source.operation_count,
    source.operation_ids

  from jsonb_to_recordset(
    p_items
  ) as source (
    instrument_id uuid,
    instrument_name text,
    instrument_ticker text,

    asset_class_id uuid,
    asset_class_name text,
    asset_class_code text,
    asset_class_color text,
    asset_class_sort_order integer,

    buy_quantity numeric,
    sell_quantity numeric,
    net_quantity numeric,

    bought_base numeric,
    sold_base numeric,
    net_value_base numeric,

    operation_count integer,
    operation_ids jsonb
  );


  return v_report_run_id;
end;
$$;


revoke all on function
  public.replace_weekly_operation_report(
    uuid,
    date,
    date,
    numeric,
    numeric,
    jsonb,
    jsonb
  )
from public;


grant execute on function
  public.replace_weekly_operation_report(
    uuid,
    date,
    date,
    numeric,
    numeric,
    jsonb,
    jsonb
  )
to authenticated;


comment on table
  public.portfolio_weekly_report_runs
is
  'Frozen operation-chart reports for arbitrary inclusive date ranges. Exact-range regeneration replaces the previous frozen report and increments revision.';


comment on table
  public.portfolio_weekly_report_items
is
  'Frozen per-instrument net trading aggregates used by weekly/custom-range operation charts.';


comment on function
  public.replace_weekly_operation_report(
    uuid,
    date,
    date,
    numeric,
    numeric,
    jsonb,
    jsonb
  )
is
  'Atomically creates or replaces one custom-range operation report, freezes per-instrument aggregates, and calculates external contributions with the existing contribution engine.';


commit;