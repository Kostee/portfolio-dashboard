-- -----------------------------------------------------------------------------
-- Legacy portfolio-value history used by the monthly "Portfolio value history"
-- chart. These checkpoints preserve the historical series that predates frozen
-- monthly report runs. Real monthly report revisions take precedence for the
-- same as-of date in application code.
-- -----------------------------------------------------------------------------

create table if not exists public.portfolio_value_history_points (
  id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null
    references public.workspaces(id)
    on delete cascade,

  as_of_date date not null,

  total_value_base numeric(28, 10) not null,
  cumulative_contributions_base numeric(28, 10),

  base_currency char(3) not null,

  source text not null default 'legacy_import',
  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint portfolio_value_history_points_workspace_date_key
    unique (workspace_id, as_of_date),

  constraint portfolio_value_history_points_total_value_check
    check (total_value_base >= 0),

  constraint portfolio_value_history_points_contributions_check
    check (
      cumulative_contributions_base is null
      or cumulative_contributions_base >= 0
    ),

  constraint portfolio_value_history_points_currency_check
    check (base_currency ~ '^[A-Z]{3}$'),

  constraint portfolio_value_history_points_source_check
    check (
      source in (
        'legacy_import',
        'manual'
      )
    )
);

create index if not exists portfolio_value_history_points_workspace_date_idx
  on public.portfolio_value_history_points (
    workspace_id,
    as_of_date
  );

comment on table public.portfolio_value_history_points is
  'Historical portfolio-value checkpoints used before immutable monthly report runs became the source of truth. A real non-voided monthly report revision takes precedence for the same date in the UI.';

alter table public.portfolio_value_history_points
  enable row level security;

alter table public.portfolio_value_history_points
  force row level security;

drop policy if exists portfolio_value_history_points_select
  on public.portfolio_value_history_points;

create policy portfolio_value_history_points_select
  on public.portfolio_value_history_points
  for select
  to authenticated
  using (
    private.is_workspace_member(workspace_id)
  );

drop policy if exists portfolio_value_history_points_manage
  on public.portfolio_value_history_points;

create policy portfolio_value_history_points_manage
  on public.portfolio_value_history_points
  for all
  to authenticated
  using (
    private.can_edit_workspace(workspace_id)
  )
  with check (
    private.can_edit_workspace(workspace_id)
  );

grant select, insert, update, delete
  on public.portfolio_value_history_points
  to authenticated;

-- Historical portfolio checkpoints are private deployment data and are
-- intentionally not seeded by the public repository.
