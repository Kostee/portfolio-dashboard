begin;

-- ============================================================
-- CASH OPERATION
-- ============================================================

drop function if exists public.create_cash_operation(
  uuid,
  date,
  public.portfolio_operation_type,
  numeric,
  text,
  text,
  text
);

create function public.create_cash_operation(
  p_account_id uuid,
  p_operation_date date,
  p_operation_type public.portfolio_operation_type,
  p_amount numeric,
  p_currency text,
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
  v_workspace_base_currency char(3);
  v_workspace_timezone text;
  v_operation_id uuid;

  v_currency char(3);
  v_signed_amount numeric(28, 10);
  v_component public.portfolio_operation_component;

  v_description text;
  v_notes text;
  v_executed_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  if p_operation_date is null then
    raise exception 'Operation date is required.';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be greater than zero.';
  end if;

  if p_currency is null
     or upper(btrim(p_currency)) !~ '^[A-Z]{3}$' then
    raise exception 'Currency must use a three-letter code.';
  end if;

  v_currency := upper(btrim(p_currency));
  v_description := nullif(btrim(p_description), '');
  v_notes := nullif(btrim(p_notes), '');

  select
    accounts.workspace_id,
    workspaces.base_currency,
    workspaces.timezone
  into
    v_workspace_id,
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
    raise exception 'The current user cannot edit this workspace.';
  end if;

  v_executed_at := case
    when p_operation_time is null then null
    else
      (p_operation_date + p_operation_time)
        at time zone v_workspace_timezone
  end;

  case p_operation_type
    when 'deposit' then
      v_signed_amount := p_amount;
      v_component := 'transfer';

    when 'withdrawal' then
      v_signed_amount := -p_amount;
      v_component := 'transfer';

    when 'interest' then
      v_signed_amount := p_amount;
      v_component := 'income';

    when 'fee' then
      v_signed_amount := -p_amount;
      v_component := 'fee';

    when 'tax' then
      v_signed_amount := -p_amount;
      v_component := 'tax';

    else
      raise exception
        'Unsupported cash operation type: %',
        p_operation_type;
  end case;

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
    p_operation_type,
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
    base_cash_delta,
    base_value_delta
  )
  values (
    v_workspace_id,
    v_operation_id,
    1,
    p_account_id,
    null,
    v_component,
    0,
    v_signed_amount,
    0,
    v_currency,
    case
      when v_currency = v_workspace_base_currency
        then v_signed_amount
      else null
    end,
    0
  );

  return v_operation_id;
end;
$$;

revoke all on function public.create_cash_operation(
  uuid,
  date,
  public.portfolio_operation_type,
  numeric,
  text,
  text,
  text,
  time without time zone
) from public;

grant execute on function public.create_cash_operation(
  uuid,
  date,
  public.portfolio_operation_type,
  numeric,
  text,
  text,
  text,
  time without time zone
) to authenticated;

-- ============================================================
-- INTERNAL TRANSFER
-- ============================================================

drop function if exists public.create_internal_transfer(
  uuid,
  uuid,
  date,
  numeric,
  text,
  text,
  text
);

create function public.create_internal_transfer(
  p_from_account_id uuid,
  p_to_account_id uuid,
  p_operation_date date,
  p_amount numeric,
  p_currency text,
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
  v_from_workspace_id uuid;
  v_to_workspace_id uuid;
  v_workspace_id uuid;

  v_from_account_currency char(3);
  v_to_account_currency char(3);
  v_workspace_base_currency char(3);
  v_workspace_timezone text;

  v_currency char(3);
  v_description text;
  v_notes text;
  v_executed_at timestamptz;
  v_operation_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  if p_from_account_id is null
     or p_to_account_id is null then
    raise exception 'Both accounts are required.';
  end if;

  if p_from_account_id = p_to_account_id then
    raise exception 'Source and destination accounts must differ.';
  end if;

  if p_operation_date is null then
    raise exception 'Operation date is required.';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be greater than zero.';
  end if;

  if p_currency is null
     or upper(btrim(p_currency)) !~ '^[A-Z]{3}$' then
    raise exception 'Currency must use a three-letter code.';
  end if;

  v_currency := upper(btrim(p_currency));
  v_description := nullif(btrim(p_description), '');
  v_notes := nullif(btrim(p_notes), '');

  select
    accounts.workspace_id,
    accounts.base_currency
  into
    v_from_workspace_id,
    v_from_account_currency
  from public.accounts as accounts
  where accounts.id = p_from_account_id
    and accounts.is_active = true
  limit 1;

  select
    accounts.workspace_id,
    accounts.base_currency
  into
    v_to_workspace_id,
    v_to_account_currency
  from public.accounts as accounts
  where accounts.id = p_to_account_id
    and accounts.is_active = true
  limit 1;

  if v_from_workspace_id is null
     or v_to_workspace_id is null then
    raise exception 'One of the selected accounts is unavailable.';
  end if;

  if v_from_workspace_id <> v_to_workspace_id then
    raise exception 'Accounts must belong to the same workspace.';
  end if;

  v_workspace_id := v_from_workspace_id;

  if not private.can_edit_workspace(v_workspace_id) then
    raise exception 'The current user cannot edit this workspace.';
  end if;

  if v_from_account_currency <> v_currency
     or v_to_account_currency <> v_currency then
    raise exception
      'Transfer currency must match both account currencies.';
  end if;

  select
    workspaces.base_currency,
    workspaces.timezone
  into
    v_workspace_base_currency,
    v_workspace_timezone
  from public.workspaces as workspaces
  where workspaces.id = v_workspace_id
  limit 1;

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
    'internal_transfer',
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
    fx_rate_to_base,
    base_cash_delta,
    base_value_delta
  )
  values
  (
    v_workspace_id,
    v_operation_id,
    1,
    p_from_account_id,
    null,
    'transfer',
    0,
    -p_amount,
    0,
    v_currency,
    case
      when v_currency = v_workspace_base_currency
        then 1
      else null
    end,
    case
      when v_currency = v_workspace_base_currency
        then -p_amount
      else null
    end,
    0
  ),
  (
    v_workspace_id,
    v_operation_id,
    2,
    p_to_account_id,
    null,
    'transfer',
    0,
    p_amount,
    0,
    v_currency,
    case
      when v_currency = v_workspace_base_currency
        then 1
      else null
    end,
    case
      when v_currency = v_workspace_base_currency
        then p_amount
      else null
    end,
    0
  );

  return v_operation_id;
end;
$$;

revoke all on function public.create_internal_transfer(
  uuid,
  uuid,
  date,
  numeric,
  text,
  text,
  text,
  time without time zone
) from public;

grant execute on function public.create_internal_transfer(
  uuid,
  uuid,
  date,
  numeric,
  text,
  text,
  text,
  time without time zone
) to authenticated;

-- ============================================================
-- CURRENCY EXCHANGE
-- ============================================================

drop function if exists public.create_currency_exchange(
  uuid,
  uuid,
  date,
  numeric,
  text,
  numeric,
  text,
  numeric,
  text,
  text
);

create function public.create_currency_exchange(
  p_from_account_id uuid,
  p_to_account_id uuid,
  p_operation_date date,
  p_from_amount numeric,
  p_from_currency text,
  p_to_amount numeric,
  p_to_currency text,
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
  v_from_workspace_id uuid;
  v_to_workspace_id uuid;
  v_workspace_id uuid;

  v_from_account_currency char(3);
  v_to_account_currency char(3);
  v_workspace_base_currency char(3);
  v_workspace_timezone text;

  v_from_currency char(3);
  v_to_currency char(3);

  v_base_value numeric(28, 10);
  v_from_fx_rate numeric(28, 10);
  v_to_fx_rate numeric(28, 10);

  v_description text;
  v_notes text;
  v_executed_at timestamptz;
  v_operation_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  if p_from_account_id is null
     or p_to_account_id is null then
    raise exception 'Both accounts are required.';
  end if;

  if p_from_account_id = p_to_account_id then
    raise exception 'Source and destination accounts must differ.';
  end if;

  if p_operation_date is null then
    raise exception 'Operation date is required.';
  end if;

  if p_from_amount is null or p_from_amount <= 0 then
    raise exception 'Source amount must be greater than zero.';
  end if;

  if p_to_amount is null or p_to_amount <= 0 then
    raise exception 'Destination amount must be greater than zero.';
  end if;

  if p_from_currency is null
     or upper(btrim(p_from_currency)) !~ '^[A-Z]{3}$' then
    raise exception 'Source currency must use a three-letter code.';
  end if;

  if p_to_currency is null
     or upper(btrim(p_to_currency)) !~ '^[A-Z]{3}$' then
    raise exception 'Destination currency must use a three-letter code.';
  end if;

  v_from_currency := upper(btrim(p_from_currency));
  v_to_currency := upper(btrim(p_to_currency));

  if v_from_currency = v_to_currency then
    raise exception 'Currencies must differ.';
  end if;

  v_description := nullif(btrim(p_description), '');
  v_notes := nullif(btrim(p_notes), '');

  select
    accounts.workspace_id,
    accounts.base_currency
  into
    v_from_workspace_id,
    v_from_account_currency
  from public.accounts as accounts
  where accounts.id = p_from_account_id
    and accounts.is_active = true
  limit 1;

  select
    accounts.workspace_id,
    accounts.base_currency
  into
    v_to_workspace_id,
    v_to_account_currency
  from public.accounts as accounts
  where accounts.id = p_to_account_id
    and accounts.is_active = true
  limit 1;

  if v_from_workspace_id is null
     or v_to_workspace_id is null then
    raise exception 'One of the selected accounts is unavailable.';
  end if;

  if v_from_workspace_id <> v_to_workspace_id then
    raise exception 'Accounts must belong to the same workspace.';
  end if;

  v_workspace_id := v_from_workspace_id;

  if not private.can_edit_workspace(v_workspace_id) then
    raise exception 'The current user cannot edit this workspace.';
  end if;

  if v_from_account_currency <> v_from_currency then
    raise exception
      'Source currency must match the source account currency.';
  end if;

  if v_to_account_currency <> v_to_currency then
    raise exception
      'Destination currency must match the destination account currency.';
  end if;

  select
    workspaces.base_currency,
    workspaces.timezone
  into
    v_workspace_base_currency,
    v_workspace_timezone
  from public.workspaces as workspaces
  where workspaces.id = v_workspace_id
  limit 1;

  if v_from_currency = v_workspace_base_currency then
    v_base_value := p_from_amount;
  elsif v_to_currency = v_workspace_base_currency then
    v_base_value := p_to_amount;
  elsif p_base_value is not null and p_base_value > 0 then
    v_base_value := p_base_value;
  else
    raise exception
      'Base-currency value is required when neither side uses the workspace base currency.';
  end if;

  v_from_fx_rate := v_base_value / p_from_amount;
  v_to_fx_rate := v_base_value / p_to_amount;

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
    'currency_exchange',
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
    fx_rate_to_base,
    base_cash_delta,
    base_value_delta
  )
  values
  (
    v_workspace_id,
    v_operation_id,
    1,
    p_from_account_id,
    null,
    'transfer',
    0,
    -p_from_amount,
    0,
    v_from_currency,
    v_from_fx_rate,
    -v_base_value,
    0
  ),
  (
    v_workspace_id,
    v_operation_id,
    2,
    p_to_account_id,
    null,
    'transfer',
    0,
    p_to_amount,
    0,
    v_to_currency,
    v_to_fx_rate,
    v_base_value,
    0
  );

  return v_operation_id;
end;
$$;

revoke all on function public.create_currency_exchange(
  uuid,
  uuid,
  date,
  numeric,
  text,
  numeric,
  text,
  numeric,
  text,
  text,
  time without time zone
) from public;

grant execute on function public.create_currency_exchange(
  uuid,
  uuid,
  date,
  numeric,
  text,
  numeric,
  text,
  numeric,
  text,
  text,
  time without time zone
) to authenticated;

commit;