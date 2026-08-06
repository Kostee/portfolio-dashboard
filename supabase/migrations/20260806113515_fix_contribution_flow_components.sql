begin;

create or replace function
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
      end
        as base_value

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

      and entries.component::text
        in (
          'transfer',
          'principal'
        )

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

comment on function
  private.calculate_cumulative_contributions_as_of(
    uuid,
    date
  )
is
  'Calculates cumulative external contributions from the latest baseline. Deposit and withdrawal transfer/principal entries are included; internal transfers, exchanges and trades are excluded.';

commit;