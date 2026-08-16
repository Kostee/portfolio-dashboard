-- -----------------------------------------------------------------------------
-- Monthly report XIRR v1
--
-- Goals:
--   * keep legacy/manual XIRR snapshots unchanged;
--   * freeze an auditable cash-flow vector for every new monthly report revision;
--   * exclude PPK from XIRR;
--   * include non-PPK free cash in the terminal value without adding cash to the
--     five monthly charts or to monthly readiness;
--   * make report creation + XIRR freezing atomic through a wrapper RPC.
-- -----------------------------------------------------------------------------

alter table public.portfolio_xirr_snapshots
  add column if not exists terminal_invested_value_base numeric(28, 10),
  add column if not exists terminal_cash_value_base numeric(28, 10);

alter table public.portfolio_xirr_snapshots
  drop constraint if exists portfolio_xirr_snapshots_terminal_invested_value_check;

alter table public.portfolio_xirr_snapshots
  add constraint portfolio_xirr_snapshots_terminal_invested_value_check
  check (
    terminal_invested_value_base is null
    or terminal_invested_value_base >= 0
  );

comment on column public.portfolio_xirr_snapshots.terminal_invested_value_base is
  'Frozen non-PPK invested-asset value used as part of the XIRR terminal value.';

comment on column public.portfolio_xirr_snapshots.terminal_cash_value_base is
  'Frozen non-PPK free-cash value used as part of the XIRR terminal value. May be negative.';

create table if not exists public.portfolio_xirr_cash_flow_items (
  id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null
    references public.workspaces(id)
    on delete cascade,

  xirr_snapshot_id uuid not null
    references public.portfolio_xirr_snapshots(id)
    on delete cascade,

  sequence_no integer not null,
  flow_date date not null,

  flow_kind text not null,
  amount_base numeric(28, 10) not null,
  base_currency char(3) not null,

  source_kind text not null,

  legacy_external_flow_id uuid
    references public.portfolio_legacy_external_flows(id)
    on delete set null,

  operation_id uuid
    references public.portfolio_operations(id)
    on delete set null,

  description text,

  created_at timestamptz not null default now(),

  constraint portfolio_xirr_cash_flow_items_snapshot_sequence_key
    unique (xirr_snapshot_id, sequence_no),

  constraint portfolio_xirr_cash_flow_items_flow_kind_check
    check (
      flow_kind in (
        'contribution',
        'withdrawal',
        'terminal_value'
      )
    ),

  constraint portfolio_xirr_cash_flow_items_source_kind_check
    check (
      source_kind in (
        'legacy_flow',
        'operation',
        'terminal_value'
      )
    ),

  constraint portfolio_xirr_cash_flow_items_amount_check
    check (amount_base <> 0),

  constraint portfolio_xirr_cash_flow_items_currency_check
    check (base_currency ~ '^[A-Z]{3}$'),

  constraint portfolio_xirr_cash_flow_items_source_shape_check
    check (
      (
        source_kind = 'legacy_flow'
        and legacy_external_flow_id is not null
        and operation_id is null
      )
      or
      (
        source_kind = 'operation'
        and legacy_external_flow_id is null
        and operation_id is not null
      )
      or
      (
        source_kind = 'terminal_value'
        and legacy_external_flow_id is null
        and operation_id is null
      )
    ),

  constraint portfolio_xirr_cash_flow_items_sign_check
    check (
      (flow_kind = 'contribution' and amount_base < 0)
      or
      (flow_kind in ('withdrawal', 'terminal_value') and amount_base > 0)
    )
);

create index if not exists portfolio_xirr_cash_flow_items_workspace_date_idx
  on public.portfolio_xirr_cash_flow_items (
    workspace_id,
    flow_date,
    sequence_no
  );

create index if not exists portfolio_xirr_cash_flow_items_snapshot_idx
  on public.portfolio_xirr_cash_flow_items (
    xirr_snapshot_id,
    sequence_no
  );

comment on table public.portfolio_xirr_cash_flow_items is
  'Immutable cash-flow vector frozen for a report-linked XIRR snapshot. Contributions are negative, withdrawals and terminal value are positive.';

alter table public.portfolio_xirr_cash_flow_items
  enable row level security;

alter table public.portfolio_xirr_cash_flow_items
  force row level security;

drop policy if exists portfolio_xirr_cash_flow_items_select
  on public.portfolio_xirr_cash_flow_items;

create policy portfolio_xirr_cash_flow_items_select
  on public.portfolio_xirr_cash_flow_items
  for select
  to authenticated
  using (
    private.is_workspace_member(workspace_id)
  );

drop policy if exists portfolio_xirr_cash_flow_items_manage
  on public.portfolio_xirr_cash_flow_items;

create policy portfolio_xirr_cash_flow_items_manage
  on public.portfolio_xirr_cash_flow_items
  for all
  to authenticated
  using (
    private.can_edit_workspace(workspace_id)
  )
  with check (
    private.can_edit_workspace(workspace_id)
  );

grant select, insert, update, delete
  on public.portfolio_xirr_cash_flow_items
  to authenticated;

-- -----------------------------------------------------------------------------
-- Numerical helpers
-- -----------------------------------------------------------------------------

create or replace function private.xirr_xnpv(
  p_rate double precision,
  p_dates date[],
  p_amounts numeric[]
)
returns double precision
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_count integer;
  v_index integer;
  v_first_date date;
  v_years double precision;
  v_result double precision := 0;
begin
  if p_rate <= -1 then
    raise exception 'XIRR rate must be greater than -1.';
  end if;

  v_count := array_length(p_dates, 1);

  if v_count is null
     or v_count < 2
     or array_length(p_amounts, 1) is distinct from v_count then
    raise exception 'XIRR requires equally sized date and amount arrays with at least two values.';
  end if;

  v_first_date := p_dates[1];

  for v_index in 1..v_count loop
    if p_dates[v_index] is null
       or p_amounts[v_index] is null then
      raise exception 'XIRR input cannot contain null dates or amounts.';
    end if;

    v_years :=
      (p_dates[v_index] - v_first_date)::double precision
      / 365.0;

    v_result :=
      v_result
      + p_amounts[v_index]::double precision
        / exp(
            ln(1.0 + p_rate)
            * v_years
          );
  end loop;

  return v_result;
end;
$$;

create or replace function private.calculate_xirr(
  p_dates date[],
  p_amounts numeric[]
)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_count integer;

  v_low double precision := -0.999999999;
  v_high double precision := 1.0;
  v_mid double precision;

  v_low_value double precision;
  v_high_value double precision;
  v_mid_value double precision;

  v_iteration integer;
  v_has_negative boolean := false;
  v_has_positive boolean := false;
begin
  v_count := array_length(p_dates, 1);

  if v_count is null
     or v_count < 2
     or array_length(p_amounts, 1) is distinct from v_count then
    raise exception 'XIRR requires equally sized date and amount arrays with at least two values.';
  end if;

  select
    bool_or(value < 0),
    bool_or(value > 0)
  into
    v_has_negative,
    v_has_positive
  from unnest(p_amounts) as values_table(value);

  if not coalesce(v_has_negative, false)
     or not coalesce(v_has_positive, false) then
    raise exception 'XIRR requires at least one negative and one positive cash flow.';
  end if;

  v_low_value := private.xirr_xnpv(
    v_low,
    p_dates,
    p_amounts
  );

  v_high_value := private.xirr_xnpv(
    v_high,
    p_dates,
    p_amounts
  );

  -- Expand the positive bound until the root is bracketed.
  for v_iteration in 1..60 loop
    exit when
      v_low_value = 0
      or v_high_value = 0
      or sign(v_low_value) <> sign(v_high_value);

    v_high := (v_high * 2.0) + 1.0;

    if v_high > 1000000000.0 then
      exit;
    end if;

    v_high_value := private.xirr_xnpv(
      v_high,
      p_dates,
      p_amounts
    );
  end loop;

  if v_low_value = 0 then
    return v_low::numeric;
  end if;

  if v_high_value = 0 then
    return v_high::numeric;
  end if;

  if sign(v_low_value) = sign(v_high_value) then
    raise exception 'XIRR root could not be bracketed for the supplied cash flows.';
  end if;

  -- Deterministic bisection. 200 iterations are far beyond the precision
  -- needed for persisted portfolio reporting.
  for v_iteration in 1..200 loop
    v_mid := (v_low + v_high) / 2.0;

    v_mid_value := private.xirr_xnpv(
      v_mid,
      p_dates,
      p_amounts
    );

    if abs(v_mid_value) <= 0.00000001
       or abs(v_high - v_low) <= 0.000000000001 then
      return v_mid::numeric;
    end if;

    if sign(v_low_value) = sign(v_mid_value) then
      v_low := v_mid;
      v_low_value := v_mid_value;
    else
      v_high := v_mid;
      v_high_value := v_mid_value;
    end if;
  end loop;

  return ((v_low + v_high) / 2.0)::numeric;
end;
$$;

comment on function private.calculate_xirr(date[], numeric[]) is
  'Calculates annualized XIRR using actual day differences / 365 and deterministic bisection.';

-- -----------------------------------------------------------------------------
-- Terminal-value helper
-- -----------------------------------------------------------------------------

create or replace function private.get_report_xirr_terminal_components(
  p_report_run_id uuid
)
returns table (
  invested_value_base numeric,
  cash_value_base numeric,
  terminal_value_base numeric,
  missing_fx_count integer
)
language sql
stable
set search_path = ''
as $$
  with report as (
    select
      runs.id,
      runs.workspace_id,
      runs.as_of_date,
      runs.base_currency::text as base_currency
    from public.portfolio_report_runs as runs
    where runs.id = p_report_run_id
      and runs.report_type = 'monthly'
    limit 1
  ),

  invested as (
    select
      coalesce(
        sum(items.market_value_base)
          filter (
            where items.account_type <> 'ppk'
              and coalesce(
                asset_classes.include_in_xirr,
                true
              ) = true
          ),
        0
      )::numeric(28, 10) as invested_value_base
    from report
    join public.portfolio_report_items as items
      on items.report_run_id = report.id
     and items.workspace_id = report.workspace_id
    left join public.asset_classes as asset_classes
      on asset_classes.id = items.asset_class_id
     and asset_classes.workspace_id = items.workspace_id
  ),

  native_cash as (
    select
      cash.account_id,
      cash.currency,
      cash.cash_balance,
      report.workspace_id,
      report.as_of_date,
      report.base_currency
    from report
    join public.get_portfolio_cash_balances_as_of(
      report.workspace_id,
      report.as_of_date
    ) as cash
      on true
    join public.accounts as accounts
      on accounts.id = cash.account_id
     and accounts.workspace_id = cash.workspace_id
    where accounts.account_type::text <> 'ppk'
      and cash.cash_balance <> 0
  ),

  implied_rates as (
    select
      items.currency::text as currency,
      (
        sum(items.market_value_base)
        / nullif(sum(items.market_value), 0)
      )::numeric(28, 10) as rate
    from report
    join public.portfolio_report_items as items
      on items.report_run_id = report.id
     and items.workspace_id = report.workspace_id
    where items.currency::text <> report.base_currency
      and items.market_value > 0
      and items.market_value_base > 0
    group by items.currency
  ),

  valued_cash as (
    select
      native_cash.account_id,
      native_cash.currency,
      native_cash.cash_balance,

      case
        when native_cash.currency = native_cash.base_currency then
          native_cash.cash_balance::numeric(28, 10)

        when exact_snapshot.market_value_base is not null
             and abs(
               exact_snapshot.amount - native_cash.cash_balance
             ) <= 0.00000001 then
          exact_snapshot.market_value_base::numeric(28, 10)

        when implied_rates.rate is not null then
          (
            native_cash.cash_balance
            * implied_rates.rate
          )::numeric(28, 10)

        when direct_rate.rate is not null then
          (
            native_cash.cash_balance
            * direct_rate.rate
          )::numeric(28, 10)

        when inverse_rate.rate is not null
             and inverse_rate.rate <> 0 then
          (
            native_cash.cash_balance
            / inverse_rate.rate
          )::numeric(28, 10)

        else null
      end as cash_value_base

    from native_cash

    left join public.cash_balance_snapshots as exact_snapshot
      on exact_snapshot.workspace_id = native_cash.workspace_id
     and exact_snapshot.account_id = native_cash.account_id
     and exact_snapshot.snapshot_date = native_cash.as_of_date
     and exact_snapshot.currency::text = native_cash.currency

    left join implied_rates
      on implied_rates.currency = native_cash.currency

    left join lateral (
      select rates.rate
      from public.exchange_rates as rates
      where rates.workspace_id = native_cash.workspace_id
        and rates.from_currency::text = native_cash.currency
        and rates.to_currency::text = native_cash.base_currency
        and rates.rate_date <= native_cash.as_of_date
      order by rates.rate_date desc, rates.updated_at desc, rates.id desc
      limit 1
    ) as direct_rate
      on true

    left join lateral (
      select rates.rate
      from public.exchange_rates as rates
      where rates.workspace_id = native_cash.workspace_id
        and rates.from_currency::text = native_cash.base_currency
        and rates.to_currency::text = native_cash.currency
        and rates.rate_date <= native_cash.as_of_date
      order by rates.rate_date desc, rates.updated_at desc, rates.id desc
      limit 1
    ) as inverse_rate
      on true
  ),

  cash_summary as (
    select
      coalesce(
        sum(valued_cash.cash_value_base),
        0
      )::numeric(28, 10) as cash_value_base,

      count(*) filter (
        where valued_cash.cash_value_base is null
      )::integer as missing_fx_count
    from valued_cash
  )

  select
    invested.invested_value_base,
    cash_summary.cash_value_base,
    (
      invested.invested_value_base
      + cash_summary.cash_value_base
    )::numeric(28, 10) as terminal_value_base,
    cash_summary.missing_fx_count
  from invested
  cross join cash_summary;
$$;

comment on function private.get_report_xirr_terminal_components(uuid) is
  'Returns the non-PPK invested value plus non-PPK free cash for a frozen monthly report. Cash FX uses an exact cash snapshot first, then report-implied FX, then the latest stored exchange rate.';

-- -----------------------------------------------------------------------------
-- External cash-flow helper
-- -----------------------------------------------------------------------------

create or replace function private.get_report_xirr_external_flows(
  p_report_run_id uuid
)
returns table (
  flow_date date,
  flow_kind text,
  amount_base numeric,
  source_kind text,
  legacy_external_flow_id uuid,
  operation_id uuid,
  description text
)
language sql
stable
set search_path = ''
as $$
  with report as (
    select
      runs.workspace_id,
      runs.as_of_date,
      workspaces.detailed_tracking_start_date
    from public.portfolio_report_runs as runs
    join public.workspaces as workspaces
      on workspaces.id = runs.workspace_id
    where runs.id = p_report_run_id
      and runs.report_type = 'monthly'
    limit 1
  ),

  legacy as (
    select
      flows.flow_date,
      flows.flow_type as flow_kind,

      case flows.flow_type
        when 'contribution' then -flows.amount_base
        when 'withdrawal' then flows.amount_base
      end::numeric(28, 10) as amount_base,

      'legacy_flow'::text as source_kind,
      flows.id as legacy_external_flow_id,
      null::uuid as operation_id,

      coalesce(
        nullif(btrim(flows.notes), ''),
        flows.external_reference
      ) as description

    from report
    join public.portfolio_legacy_external_flows as flows
      on flows.workspace_id = report.workspace_id
    where flows.flow_date <= report.as_of_date
      and (
        report.detailed_tracking_start_date is null
        or flows.flow_date <= report.detailed_tracking_start_date
      )
  ),

  detailed as (
    select
      operations.operation_date as flow_date,

      case operations.operation_type::text
        when 'deposit' then 'contribution'
        when 'withdrawal' then 'withdrawal'
      end as flow_kind,

      (
        -sum(entries.base_cash_delta)
      )::numeric(28, 10) as amount_base,

      'operation'::text as source_kind,
      null::uuid as legacy_external_flow_id,
      operations.id as operation_id,

      coalesce(
        nullif(btrim(operations.description), ''),
        operations.external_reference,
        operations.operation_type::text
      ) as description

    from report
    join public.portfolio_operations as operations
      on operations.workspace_id = report.workspace_id
    join public.portfolio_operation_entries as entries
      on entries.workspace_id = operations.workspace_id
     and entries.operation_id = operations.id
    join public.accounts as accounts
      on accounts.workspace_id = entries.workspace_id
     and accounts.id = entries.account_id

    where operations.status::text = 'posted'
      and operations.operation_type::text in (
        'deposit',
        'withdrawal'
      )
      and operations.operation_date <= report.as_of_date
      and (
        report.detailed_tracking_start_date is null
        or operations.operation_date > report.detailed_tracking_start_date
      )
      and accounts.account_type::text <> 'ppk'
      and entries.cash_delta <> 0

    group by
      operations.id,
      operations.operation_date,
      operations.operation_type,
      operations.description,
      operations.external_reference

    having sum(entries.base_cash_delta) <> 0
  )

  select * from legacy
  union all
  select * from detailed;
$$;

comment on function private.get_report_xirr_external_flows(uuid) is
  'Builds report XIRR external flows: legacy pre-ledger contributions/withdrawals plus posted detailed deposit/withdrawal operations after the workspace detailed-tracking start date. PPK accounts are excluded.';

-- -----------------------------------------------------------------------------
-- Freeze one report-linked XIRR snapshot and its vector
-- -----------------------------------------------------------------------------

create or replace function private.freeze_monthly_report_xirr(
  p_report_run_id uuid
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_as_of_date date;
  v_base_currency char(3);

  v_existing_snapshot_id uuid;
  v_snapshot_id uuid;

  v_invested_value_base numeric(28, 10);
  v_cash_value_base numeric(28, 10);
  v_terminal_value_base numeric(28, 10);
  v_missing_fx_count integer;

  v_dates date[];
  v_amounts numeric[];
  v_cash_flow_count integer;
  v_xirr_rate numeric;

  v_missing_base_flow_count integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  select
    runs.workspace_id,
    runs.as_of_date,
    runs.base_currency
  into
    v_workspace_id,
    v_as_of_date,
    v_base_currency
  from public.portfolio_report_runs as runs
  where runs.id = p_report_run_id
    and runs.report_type = 'monthly'
  limit 1;

  if v_workspace_id is null then
    raise exception 'The monthly report run is unavailable.';
  end if;

  if not private.can_edit_workspace(v_workspace_id) then
    raise exception 'The current user cannot edit this workspace.';
  end if;

  select snapshots.id
  into v_existing_snapshot_id
  from public.portfolio_xirr_snapshots as snapshots
  where snapshots.report_run_id = p_report_run_id
  limit 1;

  if v_existing_snapshot_id is not null then
    return v_existing_snapshot_id;
  end if;

  select
    components.invested_value_base,
    components.cash_value_base,
    components.terminal_value_base,
    components.missing_fx_count
  into
    v_invested_value_base,
    v_cash_value_base,
    v_terminal_value_base,
    v_missing_fx_count
  from private.get_report_xirr_terminal_components(
    p_report_run_id
  ) as components;

  if v_terminal_value_base is null
     or v_terminal_value_base <= 0 then
    raise exception 'The XIRR terminal value must be positive.';
  end if;

  if coalesce(v_missing_fx_count, 0) > 0 then
    raise exception 'One or more non-PPK cash balances cannot be converted to the report base currency.';
  end if;

  -- Detailed external flows must carry complete base-currency amounts.
  with report as (
    select
      runs.workspace_id,
      runs.as_of_date,
      workspaces.detailed_tracking_start_date
    from public.portfolio_report_runs as runs
    join public.workspaces as workspaces
      on workspaces.id = runs.workspace_id
    where runs.id = p_report_run_id
  )
  select count(distinct operations.id)
  into v_missing_base_flow_count
  from report
  join public.portfolio_operations as operations
    on operations.workspace_id = report.workspace_id
  join public.portfolio_operation_entries as entries
    on entries.workspace_id = operations.workspace_id
   and entries.operation_id = operations.id
  join public.accounts as accounts
    on accounts.workspace_id = entries.workspace_id
   and accounts.id = entries.account_id
  where operations.status::text = 'posted'
    and operations.operation_type::text in ('deposit', 'withdrawal')
    and operations.operation_date <= report.as_of_date
    and (
      report.detailed_tracking_start_date is null
      or operations.operation_date > report.detailed_tracking_start_date
    )
    and accounts.account_type::text <> 'ppk'
    and entries.cash_delta <> 0
    and entries.base_cash_delta is null;

  if coalesce(v_missing_base_flow_count, 0) > 0 then
    raise exception 'One or more detailed external flows are missing base-currency amounts.';
  end if;

  with vector as (
    select
      flows.flow_date,
      flows.amount_base,
      0 as terminal_sort,
      flows.source_kind,
      coalesce(
        flows.legacy_external_flow_id::text,
        flows.operation_id::text,
        ''
      ) as source_sort
    from private.get_report_xirr_external_flows(
      p_report_run_id
    ) as flows

    union all

    select
      v_as_of_date,
      v_terminal_value_base,
      1,
      'terminal_value',
      ''
  )
  select
    array_agg(
      vector.flow_date
      order by
        vector.flow_date,
        vector.terminal_sort,
        vector.source_kind,
        vector.source_sort
    ),

    array_agg(
      vector.amount_base
      order by
        vector.flow_date,
        vector.terminal_sort,
        vector.source_kind,
        vector.source_sort
    ),

    count(*)::integer
  into
    v_dates,
    v_amounts,
    v_cash_flow_count
  from vector;

  if v_cash_flow_count < 2 then
    raise exception 'The XIRR vector does not contain enough cash flows.';
  end if;

  v_xirr_rate := private.calculate_xirr(
    v_dates,
    v_amounts
  );

  insert into public.portfolio_xirr_snapshots (
    workspace_id,
    report_run_id,
    as_of_date,
    xirr_rate,
    terminal_value_base,
    terminal_invested_value_base,
    terminal_cash_value_base,
    cash_flow_count,
    calculation_version,
    external_reference,
    source,
    notes,
    created_by
  )
  values (
    v_workspace_id,
    p_report_run_id,
    v_as_of_date,
    v_xirr_rate,
    v_terminal_value_base,
    v_invested_value_base,
    v_cash_value_base,
    v_cash_flow_count,
    'report-xirr-v1',
    'report-xirr-' || p_report_run_id::text,
    'system',
    'Automatically frozen with the monthly report. PPK excluded; non-PPK free cash included in terminal value.',
    auth.uid()
  )
  returning id
  into v_snapshot_id;

  insert into public.portfolio_xirr_cash_flow_items (
    workspace_id,
    xirr_snapshot_id,
    sequence_no,
    flow_date,
    flow_kind,
    amount_base,
    base_currency,
    source_kind,
    legacy_external_flow_id,
    operation_id,
    description
  )
  with vector as (
    select
      flows.flow_date,
      flows.flow_kind,
      flows.amount_base,
      flows.source_kind,
      flows.legacy_external_flow_id,
      flows.operation_id,
      flows.description,
      0 as terminal_sort,
      coalesce(
        flows.legacy_external_flow_id::text,
        flows.operation_id::text,
        ''
      ) as source_sort
    from private.get_report_xirr_external_flows(
      p_report_run_id
    ) as flows

    union all

    select
      v_as_of_date,
      'terminal_value',
      v_terminal_value_base,
      'terminal_value',
      null::uuid,
      null::uuid,
      'Non-PPK invested assets plus non-PPK free cash',
      1,
      ''
  ),

  numbered as (
    select
      vector.*,
      row_number() over (
        order by
          vector.flow_date,
          vector.terminal_sort,
          vector.source_kind,
          vector.source_sort
      )::integer as sequence_no
    from vector
  )

  select
    v_workspace_id,
    v_snapshot_id,
    numbered.sequence_no,
    numbered.flow_date,
    numbered.flow_kind,
    numbered.amount_base,
    v_base_currency,
    numbered.source_kind,
    numbered.legacy_external_flow_id,
    numbered.operation_id,
    numbered.description
  from numbered
  order by numbered.sequence_no;

  if (
    select count(*)
    from public.portfolio_xirr_cash_flow_items as items
    where items.xirr_snapshot_id = v_snapshot_id
  ) <> v_cash_flow_count then
    raise exception 'The frozen XIRR vector count does not match the snapshot metadata.';
  end if;

  return v_snapshot_id;
end;
$$;

comment on function private.freeze_monthly_report_xirr(uuid) is
  'Idempotently freezes one XIRR snapshot and auditable cash-flow vector for an existing monthly report revision.';

-- -----------------------------------------------------------------------------
-- Atomic public RPC used by the application
-- -----------------------------------------------------------------------------

create or replace function public.create_monthly_report_run_with_xirr(
  p_workspace_id uuid,
  p_as_of_date date
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_report_run_id uuid;
begin
  v_report_run_id := public.create_monthly_report_run(
    p_workspace_id,
    p_as_of_date
  );

  perform private.freeze_monthly_report_xirr(
    v_report_run_id
  );

  return v_report_run_id;
end;
$$;

comment on function public.create_monthly_report_run_with_xirr(uuid, date) is
  'Creates the immutable monthly report source and freezes its XIRR in the same database transaction.';

grant execute
  on function public.create_monthly_report_run_with_xirr(uuid, date)
  to authenticated;

-- -----------------------------------------------------------------------------
-- Migration safety checks
-- -----------------------------------------------------------------------------

do $$
declare
  v_test_rate numeric;
begin
  v_test_rate := private.calculate_xirr(
    array[
      date '2025-01-01',
      date '2026-01-01'
    ],
    array[
      -100::numeric,
      110::numeric
    ]
  );

  if abs(v_test_rate - 0.10) > 0.00000001 then
    raise exception
      'XIRR solver self-test failed. Expected 0.10, got %.',
      v_test_rate;
  end if;
end;
$$;
