begin;

-- ============================================================
-- NORMALIZE EXISTING FUNDING-ROUTE FIAT AMOUNTS
-- ============================================================

update public.portfolio_funding_routes
set contribution_amount_base =
  round(contribution_amount_base, 2)
where contribution_amount_base <>
  round(contribution_amount_base, 2);

update public.portfolio_funding_route_steps
set
  from_amount =
    case
      when from_amount is not null
       and from_currency in (
         'PLN',
         'EUR',
         'USD'
       )
        then round(from_amount, 2)
      else from_amount
    end,

  to_amount =
    case
      when to_amount is not null
       and to_currency in (
         'PLN',
         'EUR',
         'USD'
       )
        then round(to_amount, 2)
      else to_amount
    end,

  fee_amount =
    case
      when fee_amount is not null
       and fee_currency in (
         'PLN',
         'EUR',
         'USD'
       )
        then round(fee_amount, 2)
      else fee_amount
    end
where
  (
    from_amount is not null
    and from_currency in (
      'PLN',
      'EUR',
      'USD'
    )
    and from_amount <>
      round(from_amount, 2)
  )
  or
  (
    to_amount is not null
    and to_currency in (
      'PLN',
      'EUR',
      'USD'
    )
    and to_amount <>
      round(to_amount, 2)
  )
  or
  (
    fee_amount is not null
    and fee_currency in (
      'PLN',
      'EUR',
      'USD'
    )
    and fee_amount <>
      round(fee_amount, 2)
  );

-- Normalize the real tracked cash entries
-- belonging to funding routes.
update public.portfolio_operation_entries as entries
set
  cash_delta =
    round(entries.cash_delta, 2),

  fx_rate_to_base =
    case
      when entries.base_cash_delta is not null
       and round(entries.cash_delta, 2) <> 0
        then abs(
          entries.base_cash_delta
          / round(
              entries.cash_delta,
              2
            )
        )
      else entries.fx_rate_to_base
    end
from public.portfolio_operations as operations
where operations.workspace_id =
    entries.workspace_id
  and operations.id =
    entries.operation_id
  and operations.funding_route_id
    is not null
  and entries.currency in (
    'PLN',
    'EUR',
    'USD'
  )
  and entries.cash_delta <>
    round(entries.cash_delta, 2);


-- ============================================================
-- ROUTE-LEVEL PRECISION GUARD
-- ============================================================

create or replace function
  private.normalize_funding_route_amounts()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.contribution_amount_base :=
    round(
      new.contribution_amount_base,
      2
    );

  return new;
end;
$$;

create trigger
  portfolio_funding_routes_normalize_amounts
before insert or update
on public.portfolio_funding_routes
for each row
execute function
  private.normalize_funding_route_amounts();


-- ============================================================
-- STEP-LEVEL PRECISION GUARD
-- ============================================================

create or replace function
  private.normalize_funding_route_step_amounts()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.from_amount is not null
     and new.from_currency in (
       'PLN',
       'EUR',
       'USD'
     ) then
    new.from_amount :=
      round(
        new.from_amount,
        2
      );
  end if;

  if new.to_amount is not null
     and new.to_currency in (
       'PLN',
       'EUR',
       'USD'
     ) then
    new.to_amount :=
      round(
        new.to_amount,
        2
      );
  end if;

  if new.fee_amount is not null
     and new.fee_currency in (
       'PLN',
       'EUR',
       'USD'
     ) then
    new.fee_amount :=
      round(
        new.fee_amount,
        2
      );
  end if;

  return new;
end;
$$;

create trigger
  portfolio_funding_route_steps_normalize_amounts
before insert or update
on public.portfolio_funding_route_steps
for each row
execute function
  private.normalize_funding_route_step_amounts();


-- ============================================================
-- LINKED LEDGER DEPOSIT PRECISION GUARD
-- ============================================================

create or replace function
  private.normalize_funding_route_cash_entry()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_is_funding_route_entry boolean;
begin
  if new.currency not in (
    'PLN',
    'EUR',
    'USD'
  ) then
    return new;
  end if;

  select exists (
    select 1
    from public.portfolio_operations
      as operations
    where operations.workspace_id =
        new.workspace_id
      and operations.id =
        new.operation_id
      and operations.funding_route_id
        is not null
  )
  into v_is_funding_route_entry;

  if not v_is_funding_route_entry then
    return new;
  end if;

  new.cash_delta :=
    round(
      new.cash_delta,
      2
    );

  if new.base_cash_delta is not null
     and new.cash_delta <> 0 then
    new.fx_rate_to_base :=
      abs(
        new.base_cash_delta
        / new.cash_delta
      );
  end if;

  return new;
end;
$$;

create trigger
  portfolio_operation_entries_normalize_funding_route_cash
before update
on public.portfolio_operation_entries
for each row
execute function
  private.normalize_funding_route_cash_entry();


-- ============================================================
-- SAFETY CHECK FOR THE CURRENT ROUTE
-- ============================================================

do $$
declare
  v_bad_route_step_count integer;
  v_bad_linked_cash_count integer;
begin
  select count(*)
  into v_bad_route_step_count
  from public.portfolio_funding_route_steps
    as steps
  where
    (
      steps.from_currency in (
        'PLN',
        'EUR',
        'USD'
      )
      and steps.from_amount <>
        round(
          steps.from_amount,
          2
        )
    )
    or
    (
      steps.to_currency in (
        'PLN',
        'EUR',
        'USD'
      )
      and steps.to_amount <>
        round(
          steps.to_amount,
          2
        )
    )
    or
    (
      steps.fee_currency in (
        'PLN',
        'EUR',
        'USD'
      )
      and steps.fee_amount <>
        round(
          steps.fee_amount,
          2
        )
    );

  if v_bad_route_step_count <> 0 then
    raise exception
      'Funding-route fiat precision normalization failed for % step rows.',
      v_bad_route_step_count;
  end if;

  select count(*)
  into v_bad_linked_cash_count
  from public.portfolio_operation_entries
    as entries
  join public.portfolio_operations
    as operations
    on operations.workspace_id =
      entries.workspace_id
   and operations.id =
      entries.operation_id
  where operations.funding_route_id
      is not null
    and entries.currency in (
      'PLN',
      'EUR',
      'USD'
    )
    and entries.cash_delta <>
      round(
        entries.cash_delta,
        2
      );

  if v_bad_linked_cash_count <> 0 then
    raise exception
      'Funding-route ledger precision normalization failed for % entry rows.',
      v_bad_linked_cash_count;
  end if;
end;
$$;

commit;