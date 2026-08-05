begin;

create function public.create_trade_operation(
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

  v_account_currency text;
  v_workspace_base_currency text;
  v_workspace_timezone text;
  v_instrument_tracking_mode text;

  v_cash_currency text;
  v_description text;
  v_notes text;

  v_fee_amount numeric(28, 10);
  v_tax_amount numeric(28, 10);
  v_principal_cash_amount numeric(28, 10);

  v_total_base_value numeric(28, 10);
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
  v_operation_id uuid;
  v_sequence_no integer;
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
    raise exception 'Operation date is required.';
  end if;

  if p_operation_type not in ('buy', 'sell') then
    raise exception
      'Operation type must be buy or sell.';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantity must be greater than zero.';
  end if;

  if p_actual_cash_amount is null
     or p_actual_cash_amount <= 0 then
    raise exception
      'Actual cash amount must be greater than zero.';
  end if;

  if p_cash_currency is null
     or upper(btrim(p_cash_currency)) !~ '^[A-Z]{3}$' then
    raise exception
      'Cash currency must use a three-letter code.';
  end if;

  v_cash_currency :=
    upper(btrim(p_cash_currency));

  v_fee_amount :=
    coalesce(p_fee_amount, 0);

  v_tax_amount :=
    coalesce(p_tax_amount, 0);

  if v_fee_amount < 0 then
    raise exception
      'Fee amount cannot be negative.';
  end if;

  if v_tax_amount < 0 then
    raise exception
      'Tax amount cannot be negative.';
  end if;

  if p_base_value is not null
     and p_base_value <= 0 then
    raise exception
      'Base-currency value must be greater than zero.';
  end if;

  v_description :=
    nullif(btrim(p_description), '');

  v_notes :=
    nullif(btrim(p_notes), '');

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
    and accounts.is_active = true
  limit 1;

  if v_account_workspace_id is null then
    raise exception
      'The selected account is unavailable.';
  end if;

  select
    instruments.workspace_id,
    instruments.tracking_mode::text
  into
    v_instrument_workspace_id,
    v_instrument_tracking_mode
  from public.instruments as instruments
  where instruments.id = p_instrument_id
    and instruments.is_active = true
  limit 1;

  if v_instrument_workspace_id is null then
    raise exception
      'The selected instrument is unavailable.';
  end if;

  if v_account_workspace_id
     <> v_instrument_workspace_id then
    raise exception
      'Account and instrument must belong to the same workspace.';
  end if;

  v_workspace_id :=
    v_account_workspace_id;

  if not private.can_edit_workspace(
    v_workspace_id
  ) then
    raise exception
      'The current user cannot edit this workspace.';
  end if;

  if v_instrument_tracking_mode <> 'units' then
    raise exception
      'The selected instrument is not tracked using units.';
  end if;

  if v_account_currency <> v_cash_currency then
    raise exception
      'Cash currency must match the account currency.';
  end if;

  /*
   * p_actual_cash_amount is always the source of truth:
   *
   * BUY:
   *   actual cash paid =
   *   principal + explicit fee + explicit tax
   *
   * SELL:
   *   actual cash received =
   *   principal - explicit fee - explicit tax
   *
   * Embedded FX spreads, such as the XTB conversion
   * on PLN IKE/IKZE accounts, remain inside the principal
   * amount unless an explicit fee is separately available.
   */

  if p_operation_type = 'buy' then
    v_principal_cash_amount :=
      p_actual_cash_amount
      - v_fee_amount
      - v_tax_amount;

    if v_principal_cash_amount <= 0 then
      raise exception
        'For a buy, fees and taxes must be lower than the actual cash amount.';
    end if;

    v_quantity_delta :=
      p_quantity;

    v_principal_cash_delta :=
      -v_principal_cash_amount;

    v_position_value_delta :=
      v_principal_cash_amount;
  else
    v_principal_cash_amount :=
      p_actual_cash_amount
      + v_fee_amount
      + v_tax_amount;

    v_quantity_delta :=
      -p_quantity;

    v_principal_cash_delta :=
      v_principal_cash_amount;

    v_position_value_delta :=
      -v_principal_cash_amount;
  end if;

  /*
   * p_base_value means the PLN-equivalent of the total
   * actual cash movement, including explicit fees and taxes.
   *
   * It is derived automatically for PLN accounts.
   * It may remain NULL for foreign-currency accounts and
   * be supplemented later using historical exchange rates.
   */

  if v_cash_currency =
     v_workspace_base_currency then
    v_total_base_value :=
      p_actual_cash_amount;

    v_fx_rate_to_base := 1;
  elsif p_base_value is not null then
    v_total_base_value :=
      p_base_value;

    v_fx_rate_to_base :=
      p_base_value / p_actual_cash_amount;
  else
    v_total_base_value := null;
    v_fx_rate_to_base := null;
  end if;

  if v_fx_rate_to_base is not null then
    v_principal_base_amount :=
      v_principal_cash_amount
      * v_fx_rate_to_base;

    v_fee_base_amount :=
      v_fee_amount
      * v_fx_rate_to_base;

    v_tax_base_amount :=
      v_tax_amount
      * v_fx_rate_to_base;
  else
    v_principal_base_amount := null;
    v_fee_base_amount := null;
    v_tax_base_amount := null;
  end if;

  if p_operation_type = 'buy' then
    v_principal_base_cash_delta :=
      case
        when v_principal_base_amount is null
          then null
        else -v_principal_base_amount
      end;

    v_position_base_value_delta :=
      v_principal_base_amount;
  else
    v_principal_base_cash_delta :=
      v_principal_base_amount;

    v_position_base_value_delta :=
      case
        when v_principal_base_amount is null
          then null
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
  returning id
  into v_operation_id;

  /*
   * Principal entry:
   * - changes instrument quantity,
   * - changes account cash,
   * - records the effective unit cost in the account currency.
   */

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

  /*
   * Optional explicit fee.
   * Do not enter the embedded 0.5% XTB FX spread here
   * when it is already included in actual cash paid/received.
   */

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
      v_operation_id,
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
        when v_fee_base_amount is null
          then null
        else -v_fee_base_amount
      end,
      0
    );

    v_sequence_no :=
      v_sequence_no + 1;
  end if;

  /*
   * Optional explicit tax.
   */

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
      v_operation_id,
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
        when v_tax_base_amount is null
          then null
        else -v_tax_base_amount
      end,
      0
    );
  end if;

  return v_operation_id;
end;
$$;

revoke all on function public.create_trade_operation(
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
  text,
  time without time zone
) from public;

grant execute on function public.create_trade_operation(
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
  text,
  time without time zone
) to authenticated;

comment on function public.create_trade_operation(
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
  text,
  time without time zone
) is
  'Creates an atomic buy or sell operation using actual account cash movement as the source of truth.';

commit;