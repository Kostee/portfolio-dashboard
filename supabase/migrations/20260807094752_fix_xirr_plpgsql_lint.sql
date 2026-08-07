begin;

-- Remove avoidable PL/pgSQL shadowed-variable warnings introduced by
-- monthly report XIRR v1. Integer FOR-loop variables are declared
-- automatically by PL/pgSQL, so explicit declarations are unnecessary.

create or replace function private.xirr_xnpv(
  p_rate double precision,
  p_dates date[],
  p_amounts numeric[]
)
returns double precision
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_count integer;
  v_first_date date;
  v_years double precision;
  v_result double precision := 0;
begin
  if p_rate <= -1 then
    raise exception 'XIRR rate must be greater than -1.';
  end if;

  v_count := array_length(p_dates, 1);

  if v_count is null
     or v_count < 2
     or array_length(p_amounts, 1) is distinct from v_count then
    raise exception 'XIRR requires equally sized date and amount arrays with at least two values.';
  end if;

  v_first_date := p_dates[1];

  for v_index in 1..v_count loop
    if p_dates[v_index] is null
       or p_amounts[v_index] is null then
      raise exception 'XIRR input cannot contain null dates or amounts.';
    end if;

    v_years :=
      (p_dates[v_index] - v_first_date)::double precision
      / 365.0;

    v_result :=
      v_result
      + p_amounts[v_index]::double precision
        / exp(
            ln(1.0 + p_rate)
            * v_years
          );
  end loop;

  return v_result;
end;
$$;

create or replace function private.calculate_xirr(
  p_dates date[],
  p_amounts numeric[]
)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_count integer;

  v_low double precision := -0.999999999;
  v_high double precision := 1.0;
  v_mid double precision;

  v_low_value double precision;
  v_high_value double precision;
  v_mid_value double precision;

  v_has_negative boolean := false;
  v_has_positive boolean := false;
begin
  v_count := array_length(p_dates, 1);

  if v_count is null
     or v_count < 2
     or array_length(p_amounts, 1) is distinct from v_count then
    raise exception 'XIRR requires equally sized date and amount arrays with at least two values.';
  end if;

  select
    bool_or(value < 0),
    bool_or(value > 0)
  into
    v_has_negative,
    v_has_positive
  from unnest(p_amounts) as values_table(value);

  if not coalesce(v_has_negative, false)
     or not coalesce(v_has_positive, false) then
    raise exception 'XIRR requires at least one negative and one positive cash flow.';
  end if;

  v_low_value := private.xirr_xnpv(
    v_low,
    p_dates,
    p_amounts
  );

  v_high_value := private.xirr_xnpv(
    v_high,
    p_dates,
    p_amounts
  );

  -- Expand the positive bound until the root is bracketed.
  for v_iteration in 1..60 loop
    exit when
      v_low_value = 0
      or v_high_value = 0
      or sign(v_low_value) <> sign(v_high_value);

    v_high := (v_high * 2.0) + 1.0;

    if v_high > 1000000000.0 then
      exit;
    end if;

    v_high_value := private.xirr_xnpv(
      v_high,
      p_dates,
      p_amounts
    );
  end loop;

  if v_low_value = 0 then
    return v_low::numeric;
  end if;

  if v_high_value = 0 then
    return v_high::numeric;
  end if;

  if sign(v_low_value) = sign(v_high_value) then
    raise exception 'XIRR root could not be bracketed for the supplied cash flows.';
  end if;

  -- Deterministic bisection. 200 iterations are far beyond the precision
  -- needed for persisted portfolio reporting.
  for v_iteration in 1..200 loop
    v_mid := (v_low + v_high) / 2.0;

    v_mid_value := private.xirr_xnpv(
      v_mid,
      p_dates,
      p_amounts
    );

    if abs(v_mid_value) <= 0.00000001
       or abs(v_high - v_low) <= 0.000000000001 then
      return v_mid::numeric;
    end if;

    if sign(v_low_value) = sign(v_mid_value) then
      v_low := v_mid;
      v_low_value := v_mid_value;
    else
      v_high := v_mid;
      v_high_value := v_mid_value;
    end if;
  end loop;

  return ((v_low + v_high) / 2.0)::numeric;
end;
$$;

commit;