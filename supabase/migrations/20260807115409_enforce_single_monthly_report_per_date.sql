begin;

-- -----------------------------------------------------------------------------
-- Monthly reports: one stored report per workspace/report type/date.
--
-- The two 2026-07-11 report runs were smoke-test revisions created while the
-- XIRR workflow was being implemented. The imported 2026-07-11 historical
-- value point and legacy/manual XIRR checkpoint remain untouched.
--
-- Recreating a monthly report for an existing date now atomically replaces
-- the previous frozen report and its report-linked XIRR snapshot/vector.
-- -----------------------------------------------------------------------------

do $$
declare
  v_workspace_id uuid;
  v_test_report_count integer;
  v_remaining_test_reports integer;
  v_duplicate_date_count integer;
begin
  select id
  into v_workspace_id
  from public.workspaces
  where name = 'Kosterna Portfolio'
  limit 1;

  if v_workspace_id is null then
    raise exception 'Kosterna Portfolio workspace was not found.';
  end if;

  select count(*)
  into v_test_report_count
  from public.portfolio_report_runs
  where workspace_id = v_workspace_id
    and report_type = 'monthly'
    and as_of_date = date '2026-07-11';

  if v_test_report_count <> 2 then
    raise exception
      'Expected exactly two 2026-07-11 monthly smoke-test report runs, found %.',
      v_test_report_count;
  end if;

  -- Delete report-linked XIRR snapshots first so their frozen vector rows are
  -- removed through ON DELETE CASCADE instead of becoming detached history.
  delete from public.portfolio_xirr_snapshots
  where report_run_id in (
    select id
    from public.portfolio_report_runs
    where workspace_id = v_workspace_id
      and report_type = 'monthly'
      and as_of_date = date '2026-07-11'
  );

  -- Be explicit about report items instead of relying on their FK behaviour.
  delete from public.portfolio_report_items
  where report_run_id in (
    select id
    from public.portfolio_report_runs
    where workspace_id = v_workspace_id
      and report_type = 'monthly'
      and as_of_date = date '2026-07-11'
  );

  delete from public.portfolio_report_runs
  where workspace_id = v_workspace_id
    and report_type = 'monthly'
    and as_of_date = date '2026-07-11';

  select count(*)
  into v_remaining_test_reports
  from public.portfolio_report_runs
  where workspace_id = v_workspace_id
    and report_type = 'monthly'
    and as_of_date = date '2026-07-11';

  if v_remaining_test_reports <> 0 then
    raise exception
      'The 2026-07-11 smoke-test report runs were not fully removed.';
  end if;

  select count(*)
  into v_duplicate_date_count
  from (
    select
      workspace_id,
      report_type,
      as_of_date
    from public.portfolio_report_runs
    group by
      workspace_id,
      report_type,
      as_of_date
    having count(*) > 1
  ) as duplicates;

  if v_duplicate_date_count <> 0 then
    raise exception
      'Cannot enforce one report per date: % duplicate workspace/type/date groups remain.',
      v_duplicate_date_count;
  end if;
end;
$$;

create unique index if not exists portfolio_report_runs_workspace_type_date_uidx
  on public.portfolio_report_runs (
    workspace_id,
    report_type,
    as_of_date
  );

comment on index public.portfolio_report_runs_workspace_type_date_uidx is
  'Enforces one stored report run per workspace, report type and effective date. Recreating the date replaces the existing report atomically.';

create or replace function public.create_monthly_report_run_with_xirr(
  p_workspace_id uuid,
  p_as_of_date date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing_report_run_id uuid;
  v_report_run_id uuid;
begin
  if not private.can_edit_workspace(p_workspace_id) then
    raise exception 'You do not have permission to create or replace reports in this workspace.';
  end if;

  select runs.id
  into v_existing_report_run_id
  from public.portfolio_report_runs as runs
  where runs.workspace_id = p_workspace_id
    and runs.report_type = 'monthly'
    and runs.as_of_date = p_as_of_date
  limit 1
  for update;

  if v_existing_report_run_id is not null then
    -- Delete the report-linked XIRR snapshot first. Its frozen cash-flow vector
    -- is removed by the XIRR-item FK with ON DELETE CASCADE.
    delete from public.portfolio_xirr_snapshots
    where report_run_id = v_existing_report_run_id;

    delete from public.portfolio_report_items
    where report_run_id = v_existing_report_run_id;

    delete from public.portfolio_report_runs
    where id = v_existing_report_run_id;
  end if;

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
  'Atomically creates or replaces the single monthly report for a date and freezes its report-linked XIRR snapshot/vector.';

grant execute
  on function public.create_monthly_report_run_with_xirr(uuid, date)
  to authenticated;

-- Safety checks: the legacy history remains available after removing the two
-- smoke-test report runs, and the manual July XIRR checkpoint is preserved.
do $$
declare
  v_workspace_id uuid;
  v_july_history_count integer;
  v_july_legacy_xirr_count integer;
begin
  select id
  into v_workspace_id
  from public.workspaces
  where name = 'Kosterna Portfolio'
  limit 1;

  select count(*)
  into v_july_history_count
  from public.portfolio_value_history_points
  where workspace_id = v_workspace_id
    and as_of_date = date '2026-07-11'
    and total_value_base = 372075.76::numeric
    and cumulative_contributions_base = 243000::numeric;

  if v_july_history_count <> 1 then
    raise exception
      'Expected the exact 2026-07-11 legacy portfolio-value checkpoint to remain available.';
  end if;

  select count(*)
  into v_july_legacy_xirr_count
  from public.portfolio_xirr_snapshots
  where workspace_id = v_workspace_id
    and as_of_date = date '2026-07-11'
    and report_run_id is null
    and calculation_version = 'legacy-manual-v1'
    and xirr_rate = 0.3777::numeric;

  if v_july_legacy_xirr_count <> 1 then
    raise exception
      'Expected the 2026-07-11 legacy manual XIRR checkpoint to remain available.';
  end if;
end;
$$;

commit;