begin;

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

with target_workspace as (
  select
    id,
    base_currency
  from public.workspaces
  where name = 'Kosterna Portfolio'
  limit 1
),
history_points (
  as_of_date,
  total_value_base,
  cumulative_contributions_base,
  notes
) as (
  values
    (
      date '2025-11-12',
      221173.12::numeric,
      175000.00::numeric,
      'Imported from the historical "Aktywa i suma wpłat" series.'
    ),
    (
      date '2025-12-11',
      231598.81::numeric,
      184000.00::numeric,
      'Imported from the historical "Aktywa i suma wpłat" series.'
    ),
    (
      date '2025-12-29',
      241697.20::numeric,
      191000.00::numeric,
      'Additional historical checkpoint preserved from the original series.'
    ),
    (
      date '2026-01-13',
      249338.22::numeric,
      195000.00::numeric,
      'Imported from the historical "Aktywa i suma wpłat" series.'
    ),
    (
      date '2026-02-10',
      266444.13::numeric,
      204000.00::numeric,
      'Imported from the historical "Aktywa i suma wpłat" series.'
    ),
    (
      date '2026-03-10',
      275986.53::numeric,
      212000.00::numeric,
      'Imported from the historical "Aktywa i suma wpłat" series.'
    ),
    (
      date '2026-04-11',
      295633.00::numeric,
      220000.00::numeric,
      'Historical checkpoint reconstructed from the April portfolio report.'
    ),
    (
      date '2026-05-09',
      313137.00::numeric,
      228000.00::numeric,
      'Historical checkpoint reconstructed from the May portfolio report.'
    ),
    (
      date '2026-06-13',
      334890.64::numeric,
      236000.00::numeric,
      'Exact value from reconstructed position snapshots; supersedes the older rounded chart total.'
    ),
    (
      date '2026-07-11',
      372075.76::numeric,
      243000.00::numeric,
      'Exact value from reconstructed position snapshots; a frozen report revision takes precedence when present.'
    )
)
insert into public.portfolio_value_history_points (
  workspace_id,
  as_of_date,
  total_value_base,
  cumulative_contributions_base,
  base_currency,
  source,
  notes
)
select
  target_workspace.id,
  history_points.as_of_date,
  history_points.total_value_base,
  history_points.cumulative_contributions_base,
  target_workspace.base_currency,
  'legacy_import',
  history_points.notes
from target_workspace
cross join history_points
on conflict (workspace_id, as_of_date)
do update set
  total_value_base =
    excluded.total_value_base,
  cumulative_contributions_base =
    excluded.cumulative_contributions_base,
  base_currency =
    excluded.base_currency,
  source =
    excluded.source,
  notes =
    excluded.notes,
  updated_at =
    now();

do $$
declare
  v_workspace_id uuid;
  v_count integer;
  v_first_date date;
  v_last_date date;
begin
  select id
  into v_workspace_id
  from public.workspaces
  where name = 'Kosterna Portfolio'
  limit 1;

  if v_workspace_id is null then
    raise exception 'Kosterna Portfolio workspace was not found.';
  end if;

  select
    count(*),
    min(as_of_date),
    max(as_of_date)
  into
    v_count,
    v_first_date,
    v_last_date
  from public.portfolio_value_history_points
  where workspace_id = v_workspace_id
    and source = 'legacy_import';

  if v_count <> 10 then
    raise exception
      'Expected 10 imported portfolio history points, found %.',
      v_count;
  end if;

  if v_first_date <> date '2025-11-12'
     or v_last_date <> date '2026-07-11' then
    raise exception
      'Unexpected imported portfolio history range: % through %.',
      v_first_date,
      v_last_date;
  end if;
end;
$$;

commit;