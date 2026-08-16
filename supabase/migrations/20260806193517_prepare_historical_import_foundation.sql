-- Portfolio-specific historical setup and seed data were intentionally
-- removed from the public repository. Only reusable schema remains.

-- ALLOW MULTIPLE LISTINGS OF THE SAME FUND SHARE CLASS
-- ============================================================

drop index if exists
  public.instruments_workspace_isin_key;


create index if not exists
  instruments_workspace_isin_idx

on public.instruments (
  workspace_id,
  isin
)

where isin is not null;


comment on index
  public.instruments_workspace_isin_idx
is
  'Non-unique ISIN lookup. One fund share class may be held through separate exchange listings, tickers and trading currencies.';


-- ============================================================

-- LEGACY EXTERNAL FLOWS FOR XIRR
-- ============================================================

create table
  if not exists
  public.portfolio_legacy_external_flows (
    id uuid primary key
      default gen_random_uuid(),

    workspace_id uuid not null
      references public.workspaces(id)
      on delete cascade,

    flow_date date not null,

    flow_type text not null,

    amount_base numeric(28, 10)
      not null,

    base_currency char(3)
      not null
      default 'PLN',

    external_reference text
      not null,

    source
      public.portfolio_data_source
      not null
      default 'import',

    notes text,

    created_by uuid
      references auth.users(id)
      on delete set null
      default auth.uid(),

    created_at timestamptz
      not null
      default now(),

    updated_at timestamptz
      not null
      default now(),

    constraint
      portfolio_legacy_external_flows_type_check
    check (
      flow_type in (
        'contribution',
        'withdrawal'
      )
    ),

    constraint
      portfolio_legacy_external_flows_amount_check
    check (
      amount_base > 0
    ),

    constraint
      portfolio_legacy_external_flows_currency_check
    check (
      base_currency ~
        '^[A-Z]{3}$'
    ),

    constraint
      portfolio_legacy_external_flows_reference_check
    check (
      btrim(
        external_reference
      ) <> ''
    ),

    constraint
      portfolio_legacy_external_flows_workspace_reference_key
    unique (
      workspace_id,
      external_reference
    )
  );


create index if not exists
  portfolio_legacy_external_flows_workspace_date_idx

on public.portfolio_legacy_external_flows (
  workspace_id,
  flow_date,
  id
);


alter table
  public.portfolio_legacy_external_flows
enable row level security;


drop policy if exists
  portfolio_legacy_external_flows_select
on public.portfolio_legacy_external_flows;


create policy
  portfolio_legacy_external_flows_select

on public.portfolio_legacy_external_flows

for select
to authenticated

using (
  private.is_workspace_member(
    workspace_id
  )
);


drop policy if exists
  portfolio_legacy_external_flows_manage
on public.portfolio_legacy_external_flows;


create policy
  portfolio_legacy_external_flows_manage

on public.portfolio_legacy_external_flows

for all
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


revoke all
  on public.portfolio_legacy_external_flows
  from anon;


grant
  select,
  insert,
  update,
  delete

on public.portfolio_legacy_external_flows

to authenticated;


grant all
  on public.portfolio_legacy_external_flows
  to service_role;


drop trigger if exists
  portfolio_legacy_external_flows_set_updated_at
on public.portfolio_legacy_external_flows;


create trigger
  portfolio_legacy_external_flows_set_updated_at

before update
on public.portfolio_legacy_external_flows

for each row

execute function
  public.set_updated_at();


-- ============================================================
-- FROZEN XIRR RESULTS
-- ============================================================

create table
  if not exists
  public.portfolio_xirr_snapshots (
    id uuid primary key
      default gen_random_uuid(),

    workspace_id uuid not null
      references public.workspaces(id)
      on delete cascade,

    report_run_id uuid
      references public.portfolio_report_runs(id)
      on delete set null,

    as_of_date date not null,

    xirr_rate numeric(18, 12)
      not null,

    terminal_value_base
      numeric(28, 10),

    cash_flow_count integer,

    calculation_version text
      not null,

    external_reference text
      not null,

    source
      public.portfolio_data_source
      not null
      default 'system',

    notes text,

    created_by uuid
      references auth.users(id)
      on delete set null
      default auth.uid(),

    created_at timestamptz
      not null
      default now(),

    updated_at timestamptz
      not null
      default now(),

    constraint
      portfolio_xirr_snapshots_rate_check
    check (
      xirr_rate > -1
    ),

    constraint
      portfolio_xirr_snapshots_terminal_value_check
    check (
      terminal_value_base
        is null

      or terminal_value_base >= 0
    ),

    constraint
      portfolio_xirr_snapshots_flow_count_check
    check (
      cash_flow_count
        is null

      or cash_flow_count > 0
    ),

    constraint
      portfolio_xirr_snapshots_version_check
    check (
      btrim(
        calculation_version
      ) <> ''
    ),

    constraint
      portfolio_xirr_snapshots_reference_check
    check (
      btrim(
        external_reference
      ) <> ''
    ),

    constraint
      portfolio_xirr_snapshots_workspace_reference_key
    unique (
      workspace_id,
      external_reference
    )
  );


create unique index if not exists
  portfolio_xirr_snapshots_report_run_key

on public.portfolio_xirr_snapshots (
  report_run_id
)

where report_run_id is not null;


create index if not exists
  portfolio_xirr_snapshots_workspace_date_idx

on public.portfolio_xirr_snapshots (
  workspace_id,
  as_of_date,
  created_at,
  id
);


alter table
  public.portfolio_xirr_snapshots
enable row level security;


drop policy if exists
  portfolio_xirr_snapshots_select
on public.portfolio_xirr_snapshots;


create policy
  portfolio_xirr_snapshots_select

on public.portfolio_xirr_snapshots

for select
to authenticated

using (
  private.is_workspace_member(
    workspace_id
  )
);


drop policy if exists
  portfolio_xirr_snapshots_manage
on public.portfolio_xirr_snapshots;


create policy
  portfolio_xirr_snapshots_manage

on public.portfolio_xirr_snapshots

for all
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


revoke all
  on public.portfolio_xirr_snapshots
  from anon;


grant
  select,
  insert,
  update,
  delete

on public.portfolio_xirr_snapshots

to authenticated;


grant all
  on public.portfolio_xirr_snapshots
  to service_role;


drop trigger if exists
  portfolio_xirr_snapshots_set_updated_at
on public.portfolio_xirr_snapshots;


create trigger
  portfolio_xirr_snapshots_set_updated_at

before update
on public.portfolio_xirr_snapshots

for each row

execute function
  public.set_updated_at();


-- ============================================================
