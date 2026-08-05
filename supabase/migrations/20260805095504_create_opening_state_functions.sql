begin;

-- ============================================================
-- OPENING UNITS POSITION
-- ============================================================

create function public.create_opening_units_position(
  p_account_id uuid,
  p_instrument_id uuid,
  p_operation_date date,
  p_quantity numeric,
  p_description text default null,
  p_notes text default null,
  p_operation_time time without time zone default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_account_workspace_id uuid;
  v_instrument_workspace_id uuid;
  v_workspace_id uuid;

  v_workspace_timezone text;
  v_instrument_currency char(3);
  v_tracking_mode text;

  v_description text;
  v_notes text;
  v_executed_at timestamptz;
  v_operation_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  if p_account_id is null then
    raise exception 'Account is required.';
  end if;

  if p_instrument_id is null then
    raise exception 'Instrument is required.';
  end if;

  if p_operation_date is null then
    raise exception 'Opening date is required.';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Opening quantity must be greater than zero.';
  end if;

  v_description := nullif(btrim(p_description), '');
  v_notes := nullif(btrim(p_notes), '');

  select
    accounts.workspace_id,
    workspaces.timezone
  into
    v_account_workspace_id,
    v_workspace_timezone
  from public.accounts as accounts
  join public.workspaces as workspaces
    on workspaces.id = accounts.workspace_id
  where accounts.id = p_account_id
    and accounts.is_active = true
  limit 1;

  if v_account_workspace_id is null then
    raise exception 'The selected account is unavailable.';
  end if;

  select
    instruments.workspace_id,
    instruments.tracking_mode::text,
    instruments.default_currency
  into
    v_instrument_workspace_id,
    v_tracking_mode,
    v_instrument_currency
  from public.instruments as instruments
  where instruments.id = p_instrument_id
    and instruments.is_active = true
  limit 1;

  if v_instrument_workspace_id is null then
    raise exception 'The selected instrument is unavailable.';
  end if;

  if v_account_workspace_id <> v_instrument_workspace_id then
    raise exception
      'Account and instrument must belong to the same workspace.';
  end if;

  v_workspace_id := v_account_workspace_id;

  if not private.can_edit_workspace(v_workspace_id) then
    raise exception
      'The current user cannot edit this workspace.';
  end if;

  if v_tracking_mode <> 'units' then
    raise exception
      'The selected instrument is not tracked using units.';
  end if;

  v_executed_at := case
    when p_operation_time is null then null
    else
      (p_operation_date + p_operation_time)
        at time zone v_workspace_timezone
  end;

  insert into public.portfolio_operations (
    workspace_id,
    operation_date,
    executed_at,
    operation_type,
    status,
    source,
    description,
    notes
  )
  values (
    v_workspace_id,
    p_operation_date,
    v_executed_at,
    'opening_position',
    'posted',
    'manual',
    v_description,
    v_notes
  )
  returning id into v_operation_id;

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
    v_operation_id,
    1,
    p_account_id,
    p_instrument_id,
    'adjustment',
    p_quantity,
    0,
    0,
    v_instrument_currency,
    null,
    null,
    0,
    0
  );

  return v_operation_id;
end;
$$;

revoke all on function public.create_opening_units_position(
  uuid,
  uuid,
  date,
  numeric,
  text,
  text,
  time without time zone
) from public;

grant execute on function public.create_opening_units_position(
  uuid,
  uuid,
  date,
  numeric,
  text,
  text,
  time without time zone
) to authenticated;

-- ============================================================
-- OPENING CASH BALANCE
-- ============================================================

create function public.create_opening_cash_balance(
  p_account_id uuid,
  p_operation_date date,
  p_amount numeric,
  p_currency text,
  p_base_value numeric default null,
  p_description text default null,
  p_notes text default null,
  p_operation_time time without time zone default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_workspace_id uuid;

  v_account_currency char(3);
  v_workspace_base_currency char(3);
  v_workspace_timezone text;

  v_currency char(3);
  v_base_amount numeric(28, 10);
  v_fx_rate numeric(28, 10);

  v_description text;
  v_notes text;
  v_executed_at timestamptz;
  v_operation_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  if p_account_id is null then
    raise exception 'Account is required.';
  end if;

  if p_operation_date is null then
    raise exception 'Opening date is required.';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception
      'Opening cash balance must be greater than zero.';
  end if;

  if p_currency is null
     or upper(btrim(p_currency)) !~ '^[A-Z]{3}$' then
    raise exception
      'Currency must use a three-letter code.';
  end if;

  if p_base_value is not null
     and p_base_value <= 0 then
    raise exception
      'Base-currency value must be greater than zero.';
  end if;

  v_currency := upper(btrim(p_currency));
  v_description := nullif(btrim(p_description), '');
  v_notes := nullif(btrim(p_notes), '');

  select
    accounts.workspace_id,
    accounts.base_currency,
    workspaces.base_currency,
    workspaces.timezone
  into
    v_workspace_id,
    v_account_currency,
    v_workspace_base_currency,
    v_workspace_timezone
  from public.accounts as accounts
  join public.workspaces as workspaces
    on workspaces.id = accounts.workspace_id
  where accounts.id = p_account_id
    and accounts.is_active = true
  limit 1;

  if v_workspace_id is null then
    raise exception 'The selected account is unavailable.';
  end if;

  if not private.can_edit_workspace(v_workspace_id) then
    raise exception
      'The current user cannot edit this workspace.';
  end if;

  if v_currency <> v_account_currency then
    raise exception
      'Opening cash currency must match the account currency.';
  end if;

  if v_currency = v_workspace_base_currency then
    v_base_amount := p_amount;
    v_fx_rate := 1;
  elsif p_base_value is not null then
    v_base_amount := p_base_value;
    v_fx_rate := p_base_value / p_amount;
  else
    v_base_amount := null;
    v_fx_rate := null;
  end if;

  v_executed_at := case
    when p_operation_time is null then null
    else
      (p_operation_date + p_operation_time)
        at time zone v_workspace_timezone
  end;

  insert into public.portfolio_operations (
    workspace_id,
    operation_date,
    executed_at,
    operation_type,
    status,
    source,
    description,
    notes
  )
  values (
    v_workspace_id,
    p_operation_date,
    v_executed_at,
    'opening_position',
    'posted',
    'manual',
    v_description,
    v_notes
  )
  returning id into v_operation_id;

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
    v_operation_id,
    1,
    p_account_id,
    null,
    'adjustment',
    0,
    p_amount,
    0,
    v_currency,
    null,
    v_fx_rate,
    v_base_amount,
    0
  );

  return v_operation_id;
end;
$$;

revoke all on function public.create_opening_cash_balance(
  uuid,
  date,
  numeric,
  text,
  numeric,
  text,
  text,
  time without time zone
) from public;

grant execute on function public.create_opening_cash_balance(
  uuid,
  date,
  numeric,
  text,
  numeric,
  text,
  text,
  time without time zone
) to authenticated;

-- ============================================================
-- OPENING REPORTED BALANCE
-- ============================================================

create function public.create_opening_reported_balance(
  p_account_id uuid,
  p_instrument_id uuid,
  p_operation_date date,
  p_value_amount numeric,
  p_currency text,
  p_base_value numeric default null,
  p_description text default null,
  p_notes text default null,
  p_operation_time time without time zone default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_account_workspace_id uuid;
  v_instrument_workspace_id uuid;
  v_workspace_id uuid;

  v_account_currency char(3);
  v_workspace_base_currency char(3);
  v_workspace_timezone text;
  v_tracking_mode text;

  v_currency char(3);
  v_base_amount numeric(28, 10);
  v_fx_rate numeric(28, 10);

  v_description text;
  v_notes text;
  v_executed_at timestamptz;
  v_operation_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  if p_account_id is null then
    raise exception 'Account is required.';
  end if;

  if p_instrument_id is null then
    raise exception 'Instrument is required.';
  end if;

  if p_operation_date is null then
    raise exception 'Opening date is required.';
  end if;

  if p_value_amount is null or p_value_amount <= 0 then
    raise exception
      'Opening reported balance must be greater than zero.';
  end if;

  if p_currency is null
     or upper(btrim(p_currency)) !~ '^[A-Z]{3}$' then
    raise exception
      'Currency must use a three-letter code.';
  end if;

  if p_base_value is not null
     and p_base_value <= 0 then
    raise exception
      'Base-currency value must be greater than zero.';
  end if;

  v_currency := upper(btrim(p_currency));
  v_description := nullif(btrim(p_description), '');
  v_notes := nullif(btrim(p_notes), '');

  select
    accounts.workspace_id,
    accounts.base_currency,
    workspaces.base_currency,
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
    and accounts.is_active = true
  limit 1;

  if v_account_workspace_id is null then
    raise exception 'The selected account is unavailable.';
  end if;

  select
    instruments.workspace_id,
    instruments.tracking_mode::text
  into
    v_instrument_workspace_id,
    v_tracking_mode
  from public.instruments as instruments
  where instruments.id = p_instrument_id
    and instruments.is_active = true
  limit 1;

  if v_instrument_workspace_id is null then
    raise exception 'The selected instrument is unavailable.';
  end if;

  if v_account_workspace_id <> v_instrument_workspace_id then
    raise exception
      'Account and instrument must belong to the same workspace.';
  end if;

  v_workspace_id := v_account_workspace_id;

  if not private.can_edit_workspace(v_workspace_id) then
    raise exception
      'The current user cannot edit this workspace.';
  end if;

  if v_tracking_mode <> 'balance' then
    raise exception
      'The selected instrument is not tracked as a reported balance.';
  end if;

  if v_currency <> v_account_currency then
    raise exception
      'Reported balance currency must match the account currency.';
  end if;

  if v_currency = v_workspace_base_currency then
    v_base_amount := p_value_amount;
    v_fx_rate := 1;
  elsif p_base_value is not null then
    v_base_amount := p_base_value;
    v_fx_rate := p_base_value / p_value_amount;
  else
    v_base_amount := null;
    v_fx_rate := null;
  end if;

  v_executed_at := case
    when p_operation_time is null then null
    else
      (p_operation_date + p_operation_time)
        at time zone v_workspace_timezone
  end;

  insert into public.portfolio_operations (
    workspace_id,
    operation_date,
    executed_at,
    operation_type,
    status,
    source,
    description,
    notes
  )
  values (
    v_workspace_id,
    p_operation_date,
    v_executed_at,
    'opening_position',
    'posted',
    'manual',
    v_description,
    v_notes
  )
  returning id into v_operation_id;

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
    v_operation_id,
    1,
    p_account_id,
    p_instrument_id,
    'adjustment',
    0,
    0,
    p_value_amount,
    v_currency,
    null,
    v_fx_rate,
    0,
    v_base_amount
  );

  return v_operation_id;
end;
$$;

revoke all on function public.create_opening_reported_balance(
  uuid,
  uuid,
  date,
  numeric,
  text,
  numeric,
  text,
  text,
  time without time zone
) from public;

grant execute on function public.create_opening_reported_balance(
  uuid,
  uuid,
  date,
  numeric,
  text,
  numeric,
  text,
  text,
  time without time zone
) to authenticated;

commit;