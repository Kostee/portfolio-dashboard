begin;

-- ============================================================
-- CUMULATIVE CONTRIBUTION BASELINES
-- ============================================================

create table
  public.portfolio_contribution_baselines (
    id uuid primary key
      default gen_random_uuid(),

    workspace_id uuid not null
      references public.workspaces(id)
      on delete cascade,

    baseline_date date not null,

    cumulative_contributions_base
      numeric(28, 10)
      not null,

    notes text,

    created_by uuid,

    created_at timestamptz
      not null
      default now(),

    updated_at timestamptz
      not null
      default now(),

    constraint
      portfolio_contribution_baselines_value_check
    check (
      cumulative_contributions_base >= 0
    ),

    constraint
      portfolio_contribution_baselines_workspace_date_key
    unique (
      workspace_id,
      baseline_date
    )
  );


create index
  portfolio_contribution_baselines_workspace_date_idx
on public.portfolio_contribution_baselines (
  workspace_id,
  baseline_date desc
);


alter table
  public.portfolio_contribution_baselines
enable row level security;


create policy
  portfolio_contribution_baselines_select
on public.portfolio_contribution_baselines
for select
to authenticated
using (
  private.can_edit_workspace(
    workspace_id
  )
);


create policy
  portfolio_contribution_baselines_insert
on public.portfolio_contribution_baselines
for insert
to authenticated
with check (
  private.can_edit_workspace(
    workspace_id
  )
);


create policy
  portfolio_contribution_baselines_update
on public.portfolio_contribution_baselines
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
  portfolio_contribution_baselines_delete
on public.portfolio_contribution_baselines
for delete
to authenticated
using (
  private.can_edit_workspace(
    workspace_id
  )
);


revoke all
  on public.portfolio_contribution_baselines
  from anon;


grant select, insert, update, delete
  on public.portfolio_contribution_baselines
  to authenticated;


grant all
  on public.portfolio_contribution_baselines
  to service_role;


-- ============================================================
-- UPSERT BASELINE
-- ============================================================

create function
  public.upsert_contribution_baseline(
    p_workspace_id uuid,
    p_baseline_date date,
    p_cumulative_contributions_base numeric,
    p_notes text
      default null
  )
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_baseline_id uuid;
begin
  if auth.uid() is null then
    raise exception
      'Authentication is required.';
  end if;

  if p_workspace_id is null then
    raise exception
      'Workspace is required.';
  end if;

  if not private.can_edit_workspace(
    p_workspace_id
  ) then
    raise exception
      'The current user cannot edit this workspace.';
  end if;

  if p_baseline_date is null then
    raise exception
      'Baseline date is required.';
  end if;

  if p_cumulative_contributions_base
       is null
     or p_cumulative_contributions_base
       < 0 then
    raise exception
      'Cumulative contributions must be zero or greater.';
  end if;

  insert into
    public.portfolio_contribution_baselines (
      workspace_id,
      baseline_date,
      cumulative_contributions_base,
      notes,
      created_by
    )
  values (
    p_workspace_id,
    p_baseline_date,
    p_cumulative_contributions_base,
    nullif(
      btrim(p_notes),
      ''
    ),
    auth.uid()
  )

  on conflict (
    workspace_id,
    baseline_date
  )
  do update set
    cumulative_contributions_base =
      excluded.cumulative_contributions_base,

    notes =
      excluded.notes,

    updated_at =
      now()

  returning id
  into v_baseline_id;

  return v_baseline_id;
end;
$$;


revoke all on function
  public.upsert_contribution_baseline(
    uuid,
    date,
    numeric,
    text
  )
from public;


grant execute on function
  public.upsert_contribution_baseline(
    uuid,
    date,
    numeric,
    text
  )
to authenticated;


-- ============================================================
-- CALCULATE CONTRIBUTIONS AS OF DATE
-- ============================================================

create function
  private.calculate_cumulative_contributions_as_of(
    p_workspace_id uuid,
    p_as_of_date date
  )
returns table (
  baseline_id uuid,
  baseline_date date,
  baseline_value numeric,
  external_flows_value numeric,
  cumulative_value numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_workspace_base_currency
    char(3);

  v_baseline_id uuid;
  v_baseline_date date;

  v_baseline_value
    numeric(28, 10);

  v_external_flows_value
    numeric(28, 10);

  v_missing_base_value_count
    integer;
begin
  select
    workspaces.base_currency
  into
    v_workspace_base_currency
  from public.workspaces
    as workspaces
  where workspaces.id =
    p_workspace_id
  limit 1;

  if v_workspace_base_currency
       is null then
    raise exception
      'The selected workspace is unavailable.';
  end if;

  select
    baselines.id,
    baselines.baseline_date,
    baselines.cumulative_contributions_base
  into
    v_baseline_id,
    v_baseline_date,
    v_baseline_value
  from public.portfolio_contribution_baselines
    as baselines
  where baselines.workspace_id =
    p_workspace_id

    and baselines.baseline_date <=
      p_as_of_date

  order by
    baselines.baseline_date desc,
    baselines.updated_at desc,
    baselines.id desc

  limit 1;

  if v_baseline_id is null then
    raise exception
      'A cumulative contribution baseline is required on or before the report date.';
  end if;

  with external_flows as (
    select
      case
        when entries.base_cash_delta
          is not null then
          entries.base_cash_delta

        when upper(
          entries.currency::text
        ) = upper(
          v_workspace_base_currency::text
        ) then
          entries.cash_delta

        else null
      end as base_value

    from public.portfolio_operations
      as operations

    join public.portfolio_operation_entries
      as entries
      on entries.operation_id =
        operations.id

      and entries.workspace_id =
        operations.workspace_id

    where operations.workspace_id =
      p_workspace_id

      and operations.status::text =
        'posted'

      and operations.operation_date >
        v_baseline_date

      and operations.operation_date <=
        p_as_of_date

      and operations.operation_type::text
        in (
          'deposit',
          'withdrawal'
        )

      and entries.component::text =
        'principal'

      and entries.cash_delta <> 0
  )

  select
    count(*) filter (
      where external_flows.base_value
        is null
    ),

    coalesce(
      sum(
        external_flows.base_value
      ),
      0
    )::numeric(28, 10)

  into
    v_missing_base_value_count,
    v_external_flows_value

  from external_flows;

  if v_missing_base_value_count > 0 then
    raise exception
      'Every foreign-currency deposit or withdrawal requires a base-currency value.';
  end if;

  return query
  select
    v_baseline_id,
    v_baseline_date,
    v_baseline_value,

    v_external_flows_value,

    (
      v_baseline_value +
      v_external_flows_value
    )::numeric(28, 10);
end;
$$;


revoke all on function
  private.calculate_cumulative_contributions_as_of(
    uuid,
    date
  )
from public;


-- ============================================================
-- FREEZE CONTRIBUTIONS IN REPORT RUN
-- ============================================================

alter table
  public.portfolio_report_runs

  add column contribution_baseline_id uuid
    references
      public.portfolio_contribution_baselines(id)
    on delete restrict,

  add column contribution_baseline_date date,

  add column cumulative_contributions_base
    numeric(28, 10);


comment on column
  public.portfolio_report_runs.cumulative_contributions_base
is
  'Cumulative external contributions frozen when the report revision is created.';


create function
  private.populate_report_run_contributions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state record;
begin
  if new.report_type =
    'monthly' then

    select *
    into v_state
    from private.calculate_cumulative_contributions_as_of(
      new.workspace_id,
      new.as_of_date
    );

    new.contribution_baseline_id :=
      v_state.baseline_id;

    new.contribution_baseline_date :=
      v_state.baseline_date;

    new.cumulative_contributions_base :=
      v_state.cumulative_value;
  end if;

  return new;
end;
$$;


drop trigger if exists
  portfolio_report_runs_contributions_trigger
on public.portfolio_report_runs;


create trigger
  portfolio_report_runs_contributions_trigger

before insert or update of
  workspace_id,
  report_type,
  as_of_date

on public.portfolio_report_runs

for each row

execute function
  private.populate_report_run_contributions();


-- ============================================================
-- BASELINE HISTORY VIEW
-- ============================================================

create view
  public.portfolio_contribution_baseline_history
with (
  security_invoker = true
)
as
select
  baselines.workspace_id,

  baselines.id
    as baseline_id,

  baselines.baseline_date,

  baselines.cumulative_contributions_base,

  baselines.notes,

  baselines.created_at,
  baselines.updated_at

from public.portfolio_contribution_baselines
  as baselines;


revoke all
  on public.portfolio_contribution_baseline_history
  from anon;


grant select
  on public.portfolio_contribution_baseline_history
  to authenticated, service_role;

commit;