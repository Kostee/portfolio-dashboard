begin;

create or replace function public.update_manual_trade_operation(
  p_operation_id uuid,
  p_account_id uuid,
  p_instrument_id uuid,
  p_operation_date date,
  p_operation_type public.portfolio_operation_type,
  p_quantity numeric,
  p_actual_cash_amount numeric,
  p_cash_currency text,
  p_fee_amount numeric default null,
  p_tax_amount numeric default null,
  p_base_value numeric default null,
  p_description text default null,
  p_operation_time time without time zone default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_operation_source text;
  v_operation_status text;
  v_existing_operation_type text;
  v_funding_route_id uuid;

  v_account_workspace_id uuid;
  v_instrument_workspace_id uuid;

  v_account_currency text;
  v_workspace_base_currency text;
  v_workspace_timezone text;
  v_instrument_tracking_mode text;

  v_cash_currency text;
  v_description text;

  v_fee_amount numeric(28, 10);
  v_tax_amount numeric(28, 10);
  v_principal_cash_amount numeric(28, 10);

  v_fx_rate_to_base numeric(28, 10);
  v_principal_base_amount numeric(28, 10);
  v_fee_base_amount numeric(28, 10);
  v_tax_base_amount numeric(28, 10);

  v_quantity_delta numeric(28, 10);
  v_principal_cash_delta numeric(28, 10);
  v_position_value_delta numeric(28, 10);

  v_principal_base_cash_delta numeric(28, 10);
  v_position_base_value_delta numeric(28, 10);

  v_executed_at timestamptz;
  v_sequence_no integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  if p_operation_id is null then
    raise exception 'Operation is required.';
  end if;

  select
    operations.workspace_id,
    operations.source::text,
    operations.status::text,
    operations.operation_type::text,
    operations.funding_route_id
  into
    v_workspace_id,
    v_operation_source,
    v_operation_status,
    v_existing_operation_type,
    v_funding_route_id
  from public.portfolio_operations as operations
  where operations.id = p_operation_id
  limit 1;

  if v_workspace_id is null then
    raise exception 'The selected operation is unavailable.';
  end if;

  if not private.can_edit_workspace(v_workspace_id) then
    raise exception 'The current user cannot edit this workspace.';
  end if;

  if v_operation_source <> 'manual' then
    raise exception 'Only manual operations can be edited.';
  end if;

  if v_operation_status <> 'posted' then
    raise exception 'Only posted operations can be edited.';
  end if;

  if v_existing_operation_type not in ('buy', 'sell') then
    raise exception 'Only buy and sell operations can be edited here.';
  end if;

  if v_funding_route_id is not null then
    raise exception 'Funding-route trades cannot be edited here.';
  end if;

  if p_account_id is null then
    raise exception 'Account is required.';
  end if;

  if p_instrument_id is null then
    raise exception 'Instrument is required.';
  end if;

  if p_operation_date is null then
    raise exception 'Operation date is required.';
  end if;

  if p_operation_type not in ('buy', 'sell') then
    raise exception 'Operation type must be buy or sell.';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantity must be greater than zero.';
  end if;

  if p_actual_cash_amount is null
     or p_actual_cash_amount <= 0 then
    raise exception 'Actual cash amount must be greater than zero.';
  end if;

  if p_cash_currency is null
     or upper(btrim(p_cash_currency)) !~ '^[A-Z]{3}$' then
    raise exception 'Cash currency must use a three-letter code.';
  end if;

  v_cash_currency := upper(btrim(p_cash_currency));
  v_description := nullif(btrim(p_description), '');

  v_fee_amount := coalesce(p_fee_amount, 0);
  v_tax_amount := coalesce(p_tax_amount, 0);

  if v_fee_amount < 0 then
    raise exception 'Fee amount cannot be negative.';
  end if;

  if v_tax_amount < 0 then
    raise exception 'Tax amount cannot be negative.';
  end if;

  if p_base_value is not null
     and p_base_value <= 0 then
    raise exception 'Base-currency value must be greater than zero.';
  end if;

  select
    accounts.workspace_id,
    upper(accounts.base_currency),
    upper(workspaces.base_currency),
    workspaces.timezone
  into
    v_account_workspace_id,
    v_account_currency,
    v_workspace_base_currency,
    v_workspace_timezone
  from public.accounts as accounts
  join public.workspaces as workspaces
    on workspaces.id = accounts.workspace_id
  where accounts.id = p_account_id
  limit 1;

  if v_account_workspace_id is null then
    raise exception 'The selected account is unavailable.';
  end if;

  select
    instruments.workspace_id,
    instruments.tracking_mode::text
  into
    v_instrument_workspace_id,
    v_instrument_tracking_mode
  from public.instruments as instruments
  where instruments.id = p_instrument_id
  limit 1;

  if v_instrument_workspace_id is null then
    raise exception 'The selected instrument is unavailable.';
  end if;

  if v_account_workspace_id <> v_workspace_id
     or v_instrument_workspace_id <> v_workspace_id then
    raise exception 'Account, instrument and operation must belong to the same workspace.';
  end if;

  if v_account_workspace_id <> v_instrument_workspace_id then
    raise exception 'Account and instrument must belong to the same workspace.';
  end if;

  if v_instrument_tracking_mode <> 'units' then
    raise exception 'The selected instrument is not tracked using units.';
  end if;

  if v_account_currency <> v_cash_currency then
    raise exception 'Cash currency must match the account currency.';
  end if;

  if p_operation_type = 'buy' then
    v_principal_cash_amount :=
      p_actual_cash_amount
      - v_fee_amount
      - v_tax_amount;

    if v_principal_cash_amount <= 0 then
      raise exception 'For a buy, fees and taxes must be lower than the actual cash amount.';
    end if;

    v_quantity_delta := p_quantity;
    v_principal_cash_delta := -v_principal_cash_amount;
    v_position_value_delta := v_principal_cash_amount;
  else
    v_principal_cash_amount :=
      p_actual_cash_amount
      + v_fee_amount
      + v_tax_amount;

    v_quantity_delta := -p_quantity;
    v_principal_cash_delta := v_principal_cash_amount;
    v_position_value_delta := -v_principal_cash_amount;
  end if;

  if v_cash_currency = v_workspace_base_currency then
    v_fx_rate_to_base := 1;
  elsif p_base_value is not null then
    v_fx_rate_to_base := p_base_value / p_actual_cash_amount;
  else
    v_fx_rate_to_base := null;
  end if;

  if v_fx_rate_to_base is not null then
    v_principal_base_amount :=
      v_principal_cash_amount * v_fx_rate_to_base;

    v_fee_base_amount :=
      v_fee_amount * v_fx_rate_to_base;

    v_tax_base_amount :=
      v_tax_amount * v_fx_rate_to_base;
  else
    v_principal_base_amount := null;
    v_fee_base_amount := null;
    v_tax_base_amount := null;
  end if;

  if p_operation_type = 'buy' then
    v_principal_base_cash_delta :=
      case
        when v_principal_base_amount is null then null
        else -v_principal_base_amount
      end;

    v_position_base_value_delta :=
      v_principal_base_amount;
  else
    v_principal_base_cash_delta :=
      v_principal_base_amount;

    v_position_base_value_delta :=
      case
        when v_principal_base_amount is null then null
        else -v_principal_base_amount
      end;
  end if;

  v_executed_at :=
    case
      when p_operation_time is null then null
      else
        (
          p_operation_date
          + p_operation_time
        )
        at time zone v_workspace_timezone
    end;

  update public.portfolio_operations
  set
    operation_date = p_operation_date,
    executed_at = v_executed_at,
    operation_type = p_operation_type,
    description = v_description
  where id = p_operation_id
    and workspace_id = v_workspace_id;

  delete from public.portfolio_operation_entries
  where operation_id = p_operation_id
    and workspace_id = v_workspace_id;

  insert into public.portfolio_operation_entries (
    workspace_id,
    operation_id,
    sequence_no,
    account_id,
    instrument_id,
    component,
    quantity_delta,
    cash_delta,
    value_delta,
    currency,
    unit_price,
    fx_rate_to_base,
    base_cash_delta,
    base_value_delta
  )
  values (
    v_workspace_id,
    p_operation_id,
    1,
    p_account_id,
    p_instrument_id,
    'principal',
    v_quantity_delta,
    v_principal_cash_delta,
    v_position_value_delta,
    v_cash_currency,
    v_principal_cash_amount / p_quantity,
    v_fx_rate_to_base,
    v_principal_base_cash_delta,
    v_position_base_value_delta
  );

  v_sequence_no := 2;

  if v_fee_amount > 0 then
    insert into public.portfolio_operation_entries (
      workspace_id,
      operation_id,
      sequence_no,
      account_id,
      instrument_id,
      component,
      quantity_delta,
      cash_delta,
      value_delta,
      currency,
      unit_price,
      fx_rate_to_base,
      base_cash_delta,
      base_value_delta
    )
    values (
      v_workspace_id,
      p_operation_id,
      v_sequence_no,
      p_account_id,
      p_instrument_id,
      'fee',
      0,
      -v_fee_amount,
      0,
      v_cash_currency,
      null,
      v_fx_rate_to_base,
      case
        when v_fee_base_amount is null then null
        else -v_fee_base_amount
      end,
      0
    );

    v_sequence_no := v_sequence_no + 1;
  end if;

  if v_tax_amount > 0 then
    insert into public.portfolio_operation_entries (
      workspace_id,
      operation_id,
      sequence_no,
      account_id,
      instrument_id,
      component,
      quantity_delta,
      cash_delta,
      value_delta,
      currency,
      unit_price,
      fx_rate_to_base,
      base_cash_delta,
      base_value_delta
    )
    values (
      v_workspace_id,
      p_operation_id,
      v_sequence_no,
      p_account_id,
      p_instrument_id,
      'tax',
      0,
      -v_tax_amount,
      0,
      v_cash_currency,
      null,
      v_fx_rate_to_base,
      case
        when v_tax_base_amount is null then null
        else -v_tax_base_amount
      end,
      0
    );
  end if;

  return p_operation_id;
end;
$$;

revoke all on function public.update_manual_trade_operation(
  uuid,
  uuid,
  uuid,
  date,
  public.portfolio_operation_type,
  numeric,
  numeric,
  text,
  numeric,
  numeric,
  numeric,
  text,
  time without time zone
) from public;

grant execute on function public.update_manual_trade_operation(
  uuid,
  uuid,
  uuid,
  date,
  public.portfolio_operation_type,
  numeric,
  numeric,
  text,
  numeric,
  numeric,
  numeric,
  text,
  time without time zone
) to authenticated;

commit;