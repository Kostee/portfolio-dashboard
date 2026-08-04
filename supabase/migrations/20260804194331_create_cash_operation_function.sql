begin;

create or replace function public.create_cash_operation(
  p_account_id uuid,
  p_operation_date date,
  p_operation_type public.portfolio_operation_type,
  p_amount numeric,
  p_currency text,
  p_description text default null,
  p_notes text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_workspace_base_currency char(3);
  v_operation_id uuid;

  v_currency char(3);
  v_signed_amount numeric(28, 10);
  v_component public.portfolio_operation_component;

  v_description text;
  v_notes text;
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
    workspaces.base_currency
  into
    v_workspace_id,
    v_workspace_base_currency
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
    operation_type,
    status,
    source,
    description,
    notes
  )
  values (
    v_workspace_id,
    p_operation_date,
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
  text
) from public;

grant execute on function public.create_cash_operation(
  uuid,
  date,
  public.portfolio_operation_type,
  numeric,
  text,
  text,
  text
) to authenticated;

commit;