begin;

create function public.create_completed_funding_route_with_deposit_time(
  p_workspace_id uuid,
  p_owner_id uuid,
  p_contribution_date date,
  p_contribution_amount_base numeric,
  p_destination_account_id uuid,
  p_destination_date date,
  p_destination_amount numeric,
  p_destination_currency text,
  p_steps jsonb,

  p_deposit_date date,

  p_contribution_time time without time zone default null,
  p_destination_time time without time zone default null,
  p_deposit_time time without time zone default null,

  p_description text default null,
  p_notes text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_route_id uuid;

  v_workspace_timezone text;

  v_deposit_executed_at timestamptz;

  v_updated_deposit_count integer;
begin
  if auth.uid() is null then
    raise exception
      'Authentication is required.';
  end if;

  if p_deposit_date is null then
    raise exception
      'Deposit date is required.';
  end if;

  if p_destination_date is null then
    raise exception
      'Destination arrival date is required.';
  end if;

  if p_deposit_date < p_destination_date then
    raise exception
      'Deposit date cannot be earlier than the destination arrival date.';
  end if;

  if (
    p_deposit_date = p_destination_date
    and p_destination_time is not null
    and p_deposit_time is not null
    and p_deposit_time < p_destination_time
  ) then
    raise exception
      'Deposit time cannot be earlier than the destination arrival time.';
  end if;

  /*
   * Existing RPC creates:
   *   - funding route
   *   - route steps
   *   - destination cash deposit
   *
   * The route remains completed at the actual
   * arrival timestamp.
   */
  v_route_id :=
    public.create_completed_funding_route(
      p_workspace_id,
      p_owner_id,
      p_contribution_date,
      p_contribution_amount_base,
      p_destination_account_id,
      p_destination_date,
      p_destination_amount,
      p_destination_currency,
      p_steps,
      p_contribution_time,
      p_destination_time,
      p_description,
      p_notes
    );

  select
    workspaces.timezone
  into
    v_workspace_timezone
  from public.workspaces
    as workspaces
  where workspaces.id =
    p_workspace_id
  limit 1;

  if v_workspace_timezone is null then
    raise exception
      'The selected workspace is unavailable.';
  end if;

  v_deposit_executed_at :=
    case
      when p_deposit_time is null
        then null
      else
        (
          p_deposit_date
          + p_deposit_time
        )
        at time zone
          v_workspace_timezone
    end;

  /*
   * The actual portfolio ledger operation may
   * have a slightly later provider-booking time
   * than the physical arrival represented by
   * the funding route.
   */
  update public.portfolio_operations
  set
    operation_date =
      p_deposit_date,

    executed_at =
      v_deposit_executed_at

  where workspace_id =
      p_workspace_id

    and funding_route_id =
      v_route_id

    and operation_type =
      'deposit'::public.portfolio_operation_type

    and status =
      'posted'::public.portfolio_operation_status;

  get diagnostics
    v_updated_deposit_count =
      row_count;

  if v_updated_deposit_count <> 1 then
    raise exception
      'Expected exactly one destination deposit for the funding route, updated %.',
      v_updated_deposit_count;
  end if;

  return v_route_id;
end;
$$;

revoke all on function
  public.create_completed_funding_route_with_deposit_time(
    uuid,
    uuid,
    date,
    numeric,
    uuid,
    date,
    numeric,
    text,
    jsonb,
    date,
    time without time zone,
    time without time zone,
    time without time zone,
    text,
    text
  )
from public;

grant execute on function
  public.create_completed_funding_route_with_deposit_time(
    uuid,
    uuid,
    date,
    numeric,
    uuid,
    date,
    numeric,
    text,
    jsonb,
    date,
    time without time zone,
    time without time zone,
    time without time zone,
    text,
    text
  )
to authenticated;

comment on function
  public.create_completed_funding_route_with_deposit_time(
    uuid,
    uuid,
    date,
    numeric,
    uuid,
    date,
    numeric,
    text,
    jsonb,
    date,
    time without time zone,
    time without time zone,
    time without time zone,
    text,
    text
  )
is
  'Creates a completed external funding route while preserving the actual destination-arrival timestamp separately from the provider-booked portfolio deposit timestamp.';

commit;