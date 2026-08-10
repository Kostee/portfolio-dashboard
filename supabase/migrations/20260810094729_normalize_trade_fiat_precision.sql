begin;

-- ============================================================
-- TRADE FIAT PRECISION
--
-- Cash actually debited/credited by PLN/EUR/USD accounts is
-- stored to minor currency units. Quantity and derived unit
-- price retain their useful higher precision.
-- ============================================================

create or replace function
  private.normalize_trade_fiat_entry()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_operation_type text;
begin
  if new.currency not in (
    'PLN',
    'EUR',
    'USD'
  ) then
    return new;
  end if;

  select
    operations.operation_type::text
  into
    v_operation_type
  from public.portfolio_operations
    as operations
  where operations.workspace_id =
      new.workspace_id
    and operations.id =
      new.operation_id
  limit 1;

  if v_operation_type not in (
    'buy',
    'sell'
  ) then
    return new;
  end if;

  new.cash_delta :=
    round(
      new.cash_delta,
      2
    );

  new.value_delta :=
    round(
      new.value_delta,
      2
    );

  /*
   * unit_price is derived from the normalized
   * principal value, but is intentionally NOT
   * rounded to two decimals because fractional
   * quantities may legitimately require more
   * precision.
   */
  if new.component::text = 'principal'
     and new.quantity_delta <> 0 then
    new.unit_price :=
      abs(new.value_delta)
      / abs(new.quantity_delta);
  end if;

  /*
   * When the account currency already equals the
   * workspace base currency, base cash/value must
   * be the same exact cent-denominated amount.
   *
   * For foreign-currency trades we retain the
   * higher-precision FX-derived base amounts.
   */
  if new.fx_rate_to_base = 1 then
    if new.base_cash_delta is not null then
      new.base_cash_delta :=
        round(
          new.base_cash_delta,
          2
        );
    end if;

    if new.base_value_delta is not null then
      new.base_value_delta :=
        round(
          new.base_value_delta,
          2
        );
    end if;
  end if;

  return new;
end;
$$;


-- Normalize existing trade entries.

update public.portfolio_operation_entries
  as entries
set
  cash_delta =
    round(
      entries.cash_delta,
      2
    ),

  value_delta =
    round(
      entries.value_delta,
      2
    ),

  unit_price =
    case
      when entries.component::text =
          'principal'
       and entries.quantity_delta <> 0
        then
          abs(
            round(
              entries.value_delta,
              2
            )
          )
          / abs(
              entries.quantity_delta
            )
      else entries.unit_price
    end,

  base_cash_delta =
    case
      when entries.fx_rate_to_base = 1
       and entries.base_cash_delta
          is not null
        then
          round(
            entries.base_cash_delta,
            2
          )
      else entries.base_cash_delta
    end,

  base_value_delta =
    case
      when entries.fx_rate_to_base = 1
       and entries.base_value_delta
          is not null
        then
          round(
            entries.base_value_delta,
            2
          )
      else entries.base_value_delta
    end

from public.portfolio_operations
  as operations

where operations.workspace_id =
    entries.workspace_id

  and operations.id =
    entries.operation_id

  and operations.operation_type::text
    in (
      'buy',
      'sell'
    )

  and entries.currency in (
    'PLN',
    'EUR',
    'USD'
  )

  and (
    entries.cash_delta <>
      round(entries.cash_delta, 2)

    or entries.value_delta <>
      round(entries.value_delta, 2)

    or (
      entries.fx_rate_to_base = 1
      and entries.base_cash_delta
        is not null
      and entries.base_cash_delta <>
        round(
          entries.base_cash_delta,
          2
        )
    )

    or (
      entries.fx_rate_to_base = 1
      and entries.base_value_delta
        is not null
      and entries.base_value_delta <>
        round(
          entries.base_value_delta,
          2
        )
    )
  );


drop trigger if exists
  portfolio_operation_entries_normalize_trade_fiat
on public.portfolio_operation_entries;

create trigger
  portfolio_operation_entries_normalize_trade_fiat
before insert or update
on public.portfolio_operation_entries
for each row
execute function
  private.normalize_trade_fiat_entry();


-- ============================================================
-- SAFETY CHECK
-- ============================================================

do $$
declare
  v_bad_count integer;
begin
  select count(*)
  into v_bad_count

  from public.portfolio_operation_entries
    as entries

  join public.portfolio_operations
    as operations
    on operations.workspace_id =
      entries.workspace_id
   and operations.id =
      entries.operation_id

  where operations.operation_type::text
      in (
        'buy',
        'sell'
      )

    and entries.currency in (
      'PLN',
      'EUR',
      'USD'
    )

    and (
      entries.cash_delta <>
        round(
          entries.cash_delta,
          2
        )

      or entries.value_delta <>
        round(
          entries.value_delta,
          2
        )
    );

  if v_bad_count <> 0 then
    raise exception
      'Trade fiat precision normalization failed for % ledger entries.',
      v_bad_count;
  end if;
end;
$$;

commit;