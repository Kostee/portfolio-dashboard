-- Portfolio-specific smoke-test cleanup was intentionally removed from the
-- public repository. The reusable one-report-per-date behavior remains.

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
