begin;

-- XTB complaint correction received on 2026-08-06 at 16:58 Europe/Warsaw.
-- XTB posted five separate cash corrections of +0.17 USD each for CPT.US.
-- The original 2026-08-03 CPT sale is intentionally left unchanged.
-- These are broker balance corrections, not owner contributions and not trades.

create temporary table xtb_cpt_corrections (
  sequence_no integer primary key,
  external_reference text not null unique
)
on commit drop;

insert into xtb_cpt_corrections (
  sequence_no,
  external_reference
)
values
  (1, 'xtb-2026-08-06-cpt-close-price-correction-1'),
  (2, 'xtb-2026-08-06-cpt-close-price-correction-2'),
  (3, 'xtb-2026-08-06-cpt-close-price-correction-3'),
  (4, 'xtb-2026-08-06-cpt-close-price-correction-4'),
  (5, 'xtb-2026-08-06-cpt-close-price-correction-5');

do $$
declare
  v_workspace_count integer;
  v_account_count integer;
  v_instrument_count integer;
begin
  select count(*)
  into v_workspace_count
  from public.workspaces
  where name = 'Kosterna Portfolio';

  if v_workspace_count <> 1 then
    raise exception
      'Expected exactly one Kosterna Portfolio workspace, found %.',
      v_workspace_count;
  end if;

  select count(*)
  into v_account_count
  from public.accounts as accounts
  join public.workspaces as workspaces
    on workspaces.id = accounts.workspace_id
  join public.owners as owners
    on owners.id = accounts.owner_id
    and owners.workspace_id = accounts.workspace_id
  join public.providers as providers
    on providers.id = accounts.provider_id
    and providers.workspace_id = accounts.workspace_id
  where workspaces.name = 'Kosterna Portfolio'
    and owners.display_name = 'Jakub'
    and providers.name = 'XTB'
    and accounts.name = 'USD brokerage';

  if v_account_count <> 1 then
    raise exception
      'Expected exactly one Jakub · XTB · USD brokerage account, found %.',
      v_account_count;
  end if;

  select count(*)
  into v_instrument_count
  from public.instruments as instruments
  join public.workspaces as workspaces
    on workspaces.id = instruments.workspace_id
  where workspaces.name = 'Kosterna Portfolio'
    and upper(instruments.ticker) = 'CPT'
    and upper(coalesce(instruments.exchange, '')) = 'NYSE';

  if v_instrument_count <> 1 then
    raise exception
      'Expected exactly one CPT · NYSE instrument, found %.',
      v_instrument_count;
  end if;
end;
$$;

insert into public.portfolio_operations (
  workspace_id,
  operation_date,
  executed_at,
  operation_type,
  status,
  source,
  description,
  notes,
  external_reference
)
select
  workspaces.id,
  date '2026-08-06',
  (
    date '2026-08-06' +
    time '16:58'
  ) at time zone workspaces.timezone,
  'balance_adjustment',
  'posted',
  'import',
  concat(
    'XTB CPT close price correction ',
    corrections.sequence_no,
    '/5'
  ),
  'Broker correction: Close Price Correction @ 111.60000 CPT.US. XTB complaint decision credited 0.17 USD in this row; five rows total 0.85 USD.',
  corrections.external_reference
from xtb_cpt_corrections as corrections
join public.workspaces as workspaces
  on workspaces.name = 'Kosterna Portfolio'
on conflict (
  workspace_id,
  source,
  external_reference
)
where external_reference is not null
do update set
  operation_date = excluded.operation_date,
  executed_at = excluded.executed_at,
  operation_type = excluded.operation_type,
  status = excluded.status,
  description = excluded.description,
  notes = excluded.notes,
  updated_at = now();

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
  base_value_delta,
  memo
)
select
  workspaces.id,
  operations.id,
  1,
  accounts.id,
  instruments.id,
  'adjustment',
  0,
  0.17,
  0,
  'USD',
  null,
  null,
  null,
  null,
  'Close Price Correction @ 111.60000 CPT.US'
from xtb_cpt_corrections as corrections
join public.workspaces as workspaces
  on workspaces.name = 'Kosterna Portfolio'
join public.portfolio_operations as operations
  on operations.workspace_id = workspaces.id
  and operations.source = 'import'
  and operations.external_reference = corrections.external_reference
join public.owners as owners
  on owners.workspace_id = workspaces.id
  and owners.display_name = 'Jakub'
join public.providers as providers
  on providers.workspace_id = workspaces.id
  and providers.name = 'XTB'
join public.accounts as accounts
  on accounts.workspace_id = workspaces.id
  and accounts.owner_id = owners.id
  and accounts.provider_id = providers.id
  and accounts.name = 'USD brokerage'
join public.instruments as instruments
  on instruments.workspace_id = workspaces.id
  and upper(instruments.ticker) = 'CPT'
  and upper(coalesce(instruments.exchange, '')) = 'NYSE'
on conflict (
  operation_id,
  sequence_no
)
do update set
  account_id = excluded.account_id,
  instrument_id = excluded.instrument_id,
  component = excluded.component,
  quantity_delta = excluded.quantity_delta,
  cash_delta = excluded.cash_delta,
  value_delta = excluded.value_delta,
  currency = excluded.currency,
  unit_price = excluded.unit_price,
  fx_rate_to_base = excluded.fx_rate_to_base,
  base_cash_delta = excluded.base_cash_delta,
  base_value_delta = excluded.base_value_delta,
  memo = excluded.memo,
  updated_at = now();

-- Refresh the already-established 2026-08-06 cash checkpoint for this account.
-- It was 16.14 USD before the complaint correction; five x 0.17 USD makes 16.99 USD.
update public.cash_balance_snapshots as snapshots
set
  amount = 16.99,
  market_value_base = case
    when snapshots.fx_rate_to_base is null then null
    else 16.99 * snapshots.fx_rate_to_base
  end,
  notes = concat_ws(
    ' ',
    nullif(snapshots.notes, ''),
    'Updated for five XTB CPT close-price corrections of +0.17 USD each received on 2026-08-06 at 16:58; total +0.85 USD.'
  ),
  updated_at = now()
from public.workspaces as workspaces
join public.owners as owners
  on owners.workspace_id = workspaces.id
  and owners.display_name = 'Jakub'
join public.providers as providers
  on providers.workspace_id = workspaces.id
  and providers.name = 'XTB'
join public.accounts as accounts
  on accounts.workspace_id = workspaces.id
  and accounts.owner_id = owners.id
  and accounts.provider_id = providers.id
  and accounts.name = 'USD brokerage'
where workspaces.name = 'Kosterna Portfolio'
  and snapshots.workspace_id = workspaces.id
  and snapshots.account_id = accounts.id
  and snapshots.snapshot_date = date '2026-08-06'
  and snapshots.currency = 'USD';

do $$
declare
  v_workspace_id uuid;
  v_account_id uuid;
  v_correction_operation_count integer;
  v_correction_amount numeric;
  v_current_cash numeric;
  v_snapshot_cash numeric;
  v_cpt_quantity numeric;
  v_cumulative numeric;
begin
  select id
  into v_workspace_id
  from public.workspaces
  where name = 'Kosterna Portfolio';

  select accounts.id
  into v_account_id
  from public.accounts as accounts
  join public.owners as owners
    on owners.id = accounts.owner_id
    and owners.workspace_id = accounts.workspace_id
  join public.providers as providers
    on providers.id = accounts.provider_id
    and providers.workspace_id = accounts.workspace_id
  where accounts.workspace_id = v_workspace_id
    and owners.display_name = 'Jakub'
    and providers.name = 'XTB'
    and accounts.name = 'USD brokerage';

  select count(*)
  into v_correction_operation_count
  from public.portfolio_operations as operations
  where operations.workspace_id = v_workspace_id
    and operations.source = 'import'
    and operations.external_reference like
      'xtb-2026-08-06-cpt-close-price-correction-%';

  if v_correction_operation_count <> 5 then
    raise exception
      'Expected 5 XTB CPT correction operations, found %.',
      v_correction_operation_count;
  end if;

  select coalesce(sum(entries.cash_delta), 0)
  into v_correction_amount
  from public.portfolio_operation_entries as entries
  join public.portfolio_operations as operations
    on operations.id = entries.operation_id
    and operations.workspace_id = entries.workspace_id
  where entries.workspace_id = v_workspace_id
    and operations.source = 'import'
    and operations.external_reference like
      'xtb-2026-08-06-cpt-close-price-correction-%'
    and entries.currency = 'USD';

  if abs(v_correction_amount - 0.85) > 0.00000001 then
    raise exception
      'Expected total XTB CPT correction of 0.85 USD, found %.',
      v_correction_amount;
  end if;

  select coalesce(sum(entries.cash_delta), 0)
  into v_current_cash
  from public.portfolio_operation_entries as entries
  join public.portfolio_operations as operations
    on operations.id = entries.operation_id
    and operations.workspace_id = entries.workspace_id
  where entries.workspace_id = v_workspace_id
    and entries.account_id = v_account_id
    and entries.currency = 'USD'
    and operations.status = 'posted'
    and operations.operation_date <= date '2026-08-06';

  if abs(v_current_cash - 16.99) > 0.00000001 then
    raise exception
      'Expected Jakub XTB USD cash to be 16.99 USD after correction, found %.',
      v_current_cash;
  end if;

  select snapshots.amount
  into v_snapshot_cash
  from public.cash_balance_snapshots as snapshots
  where snapshots.workspace_id = v_workspace_id
    and snapshots.account_id = v_account_id
    and snapshots.snapshot_date = date '2026-08-06'
    and snapshots.currency = 'USD';

  if v_snapshot_cash is null
     or abs(v_snapshot_cash - 16.99) > 0.00000001 then
    raise exception
      'Expected 2026-08-06 cash snapshot to be 16.99 USD, found %.',
      v_snapshot_cash;
  end if;

  select coalesce(sum(entries.quantity_delta), 0)
  into v_cpt_quantity
  from public.portfolio_operation_entries as entries
  join public.portfolio_operations as operations
    on operations.id = entries.operation_id
    and operations.workspace_id = entries.workspace_id
  join public.instruments as instruments
    on instruments.id = entries.instrument_id
    and instruments.workspace_id = entries.workspace_id
  where entries.workspace_id = v_workspace_id
    and instruments.ticker = 'CPT'
    and upper(coalesce(instruments.exchange, '')) = 'NYSE'
    and operations.status = 'posted'
    and operations.operation_date <= date '2026-08-06';

  if abs(v_cpt_quantity) > 0.00000001 then
    raise exception
      'CPT quantity changed unexpectedly; expected 0, found %.',
      v_cpt_quantity;
  end if;

  select cumulative_value
  into v_cumulative
  from private.calculate_cumulative_contributions_as_of(
    v_workspace_id,
    date '2026-08-06'
  );

  if abs(v_cumulative - 251000) > 0.00000001 then
    raise exception
      'Cumulative contributions changed unexpectedly: %.',
      v_cumulative;
  end if;
end;
$$;

commit;