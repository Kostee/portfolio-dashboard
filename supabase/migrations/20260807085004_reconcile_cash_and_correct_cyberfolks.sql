begin;

-- ============================================================
-- RECONCILE CASH BALANCES AND CORRECT NATALIA ACCOUNT ALLOCATION
--
-- Corrections confirmed from XTB account history on 2026-08-07:
--   1. 2026-07-06 13:14 Natalia 40 PLN transfer was to IKZE, not IKE.
--   2. 2026-07-15 16:42 Cyber_Folks buy 2 @ 191.60 belonged to IKZE.
--   3. 2026-07-20 13:05 Cyber_Folks buy 2 @ 188.10 belonged to IKZE.
--
-- These corrections imply the following Cyber_Folks account split:
--   2026-06-13: Natalia IKE 30, IKZE 20 (aggregate 50)
--   2026-07-11: Natalia IKE 33, IKZE 20 (aggregate 53)
--   2026-08-06: Natalia IKE 36, IKZE 28 (aggregate 64)
--
-- Current cash checkpoints supplied by the user for 2026-08-06:
--   Jakub XTB PLN brokerage  0.00 PLN
--   Jakub XTB USD brokerage 16.14 USD
--   Jakub XTB IKE            1.82 PLN
--   Jakub XTB IKZE           0.04 PLN
--   Natalia XTB PLN brokerage 0.00 PLN
--   Natalia XTB IKE          1.13 PLN
--   Natalia XTB IKZE        23.93 PLN
--   Jakub Bitvavo Crypto     1.52 EUR
--   Historical Binance cash closes at 0.00 EUR.
-- ============================================================

-- ============================================================
-- 1. TARGET WORKSPACE / ACCOUNT HELPERS
-- ============================================================

create temporary table cash_reconciliation_accounts (
  owner_name text not null,
  provider_name text not null,
  account_name text not null,
  currency char(3) not null,
  opening_amount numeric(28, 10) not null,
  expected_current_amount numeric(28, 10) not null,
  opening_fx_rate_to_base numeric(28, 10),
  opening_base_amount numeric(28, 10),
  primary key (owner_name, provider_name, account_name)
)
on commit drop;

insert into cash_reconciliation_accounts (
  owner_name,
  provider_name,
  account_name,
  currency,
  opening_amount,
  expected_current_amount,
  opening_fx_rate_to_base,
  opening_base_amount
)
values
  ('Jakub',   'XTB',     'PLN brokerage', 'PLN', 162.50,  0.00, 1, 162.50),
  ('Jakub',   'XTB',     'USD brokerage', 'USD',  53.02, 16.14, 3.68780046, 53.02 * 3.68780046),
  ('Jakub',   'XTB',     'IKE',           'PLN',  92.50,  1.82, 1, 92.50),
  ('Jakub',   'XTB',     'IKZE',          'PLN',  88.87,  0.04, 1, 88.87),
  ('Natalia', 'XTB',     'PLN brokerage', 'PLN',   0.00,  0.00, 1, 0.00),
  ('Natalia', 'XTB',     'IKE',           'PLN',  99.77,  1.13, 1, 99.77),
  ('Natalia', 'XTB',     'IKZE',          'PLN', 120.17, 23.93, 1, 120.17),
  ('Jakub',   'Binance', 'Crypto',        'EUR',   0.30,  0.00, 4.25299985, 0.30 * 4.25299985),
  ('Jakub',   'Bitvavo', 'Crypto',        'EUR',   0.00,  1.52, 4.25299985, 0.00);


-- ============================================================
-- 2. CORRECT 2026-07-06 NATALIA TRANSFER: IKE -> IKZE
-- ============================================================

update public.portfolio_operations as operations
set
  external_reference = 'legacy-2026-07-06-natalia-ikze-transfer',
  description = 'Transfer from Natalia PLN brokerage to IKZE',
  notes = concat_ws(
    ' ',
    nullif(operations.notes, ''),
    'Account destination corrected from IKE to IKZE from reconciled XTB history.'
  ),
  updated_at = now()
from public.workspaces as workspaces
where operations.workspace_id = workspaces.id
  and workspaces.name = 'Kosterna Portfolio'
  and operations.source = 'import'
  and operations.external_reference = 'legacy-2026-07-06-natalia-ike-transfer';

update public.portfolio_operation_entries as entries
set
  account_id = target_ikze.id,
  memo = 'Corrected destination: Natalia IKZE.',
  updated_at = now()
from public.portfolio_operations as operations
join public.workspaces as workspaces
  on workspaces.id = operations.workspace_id
join public.owners as owners
  on owners.workspace_id = workspaces.id
  and owners.display_name = 'Natalia'
join public.providers as providers
  on providers.workspace_id = workspaces.id
  and providers.name = 'XTB'
join public.accounts as target_ikze
  on target_ikze.workspace_id = workspaces.id
  and target_ikze.owner_id = owners.id
  and target_ikze.provider_id = providers.id
  and target_ikze.name = 'IKZE'
where entries.operation_id = operations.id
  and entries.workspace_id = operations.workspace_id
  and workspaces.name = 'Kosterna Portfolio'
  and operations.source = 'import'
  and operations.external_reference = 'legacy-2026-07-06-natalia-ikze-transfer'
  and entries.sequence_no = 2;


-- ============================================================
-- 3. CORRECT TWO CYBER_FOLKS BUYS: IKE -> IKZE
-- ============================================================

update public.portfolio_operation_entries as entries
set
  account_id = target_ikze.id,
  memo = concat_ws(
    ' ',
    nullif(entries.memo, ''),
    'Account corrected from Natalia IKE to Natalia IKZE from XTB history.'
  ),
  updated_at = now()
from public.portfolio_operations as operations
join public.workspaces as workspaces
  on workspaces.id = operations.workspace_id
join public.owners as owners
  on owners.workspace_id = workspaces.id
  and owners.display_name = 'Natalia'
join public.providers as providers
  on providers.workspace_id = workspaces.id
  and providers.name = 'XTB'
join public.accounts as target_ikze
  on target_ikze.workspace_id = workspaces.id
  and target_ikze.owner_id = owners.id
  and target_ikze.provider_id = providers.id
  and target_ikze.name = 'IKZE'
where entries.operation_id = operations.id
  and entries.workspace_id = operations.workspace_id
  and workspaces.name = 'Kosterna Portfolio'
  and operations.source = 'import'
  and operations.external_reference in (
    'legacy-2026-07-15-cbf-buy',
    'legacy-2026-07-20-cbf-buy-2'
  )
  and entries.sequence_no = 1;


-- ============================================================
-- 4. CORRECT CYBER_FOLKS OPENING ACCOUNT SPLIT
-- ============================================================

update public.portfolio_operation_entries as entries
set
  quantity_delta = case
    when operations.external_reference =
      'legacy-opening-2026-06-13-natalia-xtb-ike-cbf'
      then 30::numeric
    when operations.external_reference =
      'legacy-opening-2026-06-13-natalia-xtb-ikze-cbf'
      then 20::numeric
    else entries.quantity_delta
  end,
  memo = 'Reconciled opening quantity. Corrected Cyber_Folks account split from XTB history.',
  updated_at = now()
from public.portfolio_operations as operations
join public.workspaces as workspaces
  on workspaces.id = operations.workspace_id
where entries.operation_id = operations.id
  and entries.workspace_id = operations.workspace_id
  and workspaces.name = 'Kosterna Portfolio'
  and operations.source = 'import'
  and operations.external_reference in (
    'legacy-opening-2026-06-13-natalia-xtb-ike-cbf',
    'legacy-opening-2026-06-13-natalia-xtb-ikze-cbf'
  );

with target_rows as (
  select
    snapshots.id,
    snapshots.snapshot_date,
    accounts.name as account_name
  from public.position_snapshots as snapshots
  join public.workspaces as workspaces
    on workspaces.id = snapshots.workspace_id
  join public.accounts as accounts
    on accounts.id = snapshots.account_id
    and accounts.workspace_id = snapshots.workspace_id
  join public.owners as owners
    on owners.id = accounts.owner_id
    and owners.workspace_id = snapshots.workspace_id
  join public.providers as providers
    on providers.id = accounts.provider_id
    and providers.workspace_id = snapshots.workspace_id
  join public.instruments as instruments
    on instruments.id = snapshots.instrument_id
    and instruments.workspace_id = snapshots.workspace_id
  where workspaces.name = 'Kosterna Portfolio'
    and owners.display_name = 'Natalia'
    and providers.name = 'XTB'
    and instruments.ticker = 'CBF'
    and instruments.exchange = 'GPW'
    and snapshots.snapshot_date in (
      date '2026-06-13',
      date '2026-07-11'
    )
)
update public.position_snapshots as snapshots
set
  quantity = case
    when target_rows.snapshot_date = date '2026-06-13'
      and target_rows.account_name = 'IKE'
      then 30::numeric
    when target_rows.snapshot_date = date '2026-06-13'
      and target_rows.account_name = 'IKZE'
      then 20::numeric
    when target_rows.snapshot_date = date '2026-07-11'
      and target_rows.account_name = 'IKE'
      then 33::numeric
    when target_rows.snapshot_date = date '2026-07-11'
      and target_rows.account_name = 'IKZE'
      then 20::numeric
    else snapshots.quantity
  end,
  unit_price = case
    when target_rows.snapshot_date = date '2026-06-13'
      then (9260::numeric / 50::numeric)
    when target_rows.snapshot_date = date '2026-07-11'
      then (10218::numeric / 53::numeric)
    else snapshots.unit_price
  end,
  market_value = case
    when target_rows.snapshot_date = date '2026-06-13'
      and target_rows.account_name = 'IKE'
      then (9260::numeric * 30::numeric / 50::numeric)
    when target_rows.snapshot_date = date '2026-06-13'
      and target_rows.account_name = 'IKZE'
      then (9260::numeric * 20::numeric / 50::numeric)
    when target_rows.snapshot_date = date '2026-07-11'
      and target_rows.account_name = 'IKE'
      then (10218::numeric * 33::numeric / 53::numeric)
    when target_rows.snapshot_date = date '2026-07-11'
      and target_rows.account_name = 'IKZE'
      then (10218::numeric * 20::numeric / 53::numeric)
    else snapshots.market_value
  end,
  fx_rate_to_base = 1,
  market_value_base = case
    when target_rows.snapshot_date = date '2026-06-13'
      and target_rows.account_name = 'IKE'
      then (9260::numeric * 30::numeric / 50::numeric)
    when target_rows.snapshot_date = date '2026-06-13'
      and target_rows.account_name = 'IKZE'
      then (9260::numeric * 20::numeric / 50::numeric)
    when target_rows.snapshot_date = date '2026-07-11'
      and target_rows.account_name = 'IKE'
      then (10218::numeric * 33::numeric / 53::numeric)
    when target_rows.snapshot_date = date '2026-07-11'
      and target_rows.account_name = 'IKZE'
      then (10218::numeric * 20::numeric / 53::numeric)
    else snapshots.market_value_base
  end,
  notes = concat_ws(
    ' ',
    nullif(snapshots.notes, ''),
    'Cyber_Folks account allocation corrected from reconciled XTB history.'
  ),
  updated_at = now()
from target_rows
where snapshots.id = target_rows.id;


-- ============================================================
-- 5. ADD RECONSTRUCTED OPENING CASH OPERATIONS ON 2026-06-13
--    Only non-zero opening balances need ledger entries.
-- ============================================================

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
  date '2026-06-13',
  null,
  'opening_position',
  'posted',
  'import',
  concat(
    'Reconstructed opening cash: ',
    expected.owner_name,
    ' · ',
    expected.provider_name,
    ' · ',
    expected.account_name
  ),
  'Opening cash reconstructed from the reconciled transaction ledger and the broker/crypto cash checkpoint on 2026-08-06.',
  concat(
    'legacy-opening-cash-2026-06-13-',
    lower(expected.owner_name), '-',
    lower(replace(expected.provider_name, ' ', '-')), '-',
    lower(replace(expected.account_name, ' ', '-'))
  )
from cash_reconciliation_accounts as expected
join public.workspaces as workspaces
  on workspaces.name = 'Kosterna Portfolio'
where expected.opening_amount <> 0
on conflict (workspace_id, source, external_reference)
where external_reference is not null
do update set
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
  operations.workspace_id,
  operations.id,
  1,
  accounts.id,
  null,
  'adjustment',
  0,
  expected.opening_amount,
  0,
  expected.currency,
  null,
  expected.opening_fx_rate_to_base,
  expected.opening_base_amount,
  0,
  'Reconstructed opening cash balance at detailed-tracking start date.'
from cash_reconciliation_accounts as expected
join public.workspaces as workspaces
  on workspaces.name = 'Kosterna Portfolio'
join public.owners as owners
  on owners.workspace_id = workspaces.id
  and owners.display_name = expected.owner_name
join public.providers as providers
  on providers.workspace_id = workspaces.id
  and providers.name = expected.provider_name
join public.accounts as accounts
  on accounts.workspace_id = workspaces.id
  and accounts.owner_id = owners.id
  and accounts.provider_id = providers.id
  and accounts.name = expected.account_name
join public.portfolio_operations as operations
  on operations.workspace_id = workspaces.id
  and operations.source = 'import'
  and operations.external_reference = concat(
    'legacy-opening-cash-2026-06-13-',
    lower(expected.owner_name), '-',
    lower(replace(expected.provider_name, ' ', '-')), '-',
    lower(replace(expected.account_name, ' ', '-'))
  )
where expected.opening_amount <> 0
on conflict (operation_id, sequence_no)
do update set
  account_id = excluded.account_id,
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


-- ============================================================
-- 6. CASH SNAPSHOTS: OPENING, JULY CHECKPOINT, CURRENT CHECKPOINT
-- ============================================================

create temporary table cash_snapshot_dates (
  snapshot_date date primary key,
  usd_pln numeric(28, 10),
  eur_pln numeric(28, 10),
  note text not null
)
on commit drop;

insert into cash_snapshot_dates (
  snapshot_date,
  usd_pln,
  eur_pln,
  note
)
values
  (
    date '2026-06-13',
    3.68780046,
    4.25299985,
    'Opening cash reconstructed from reconciled ledger and 2026-08-06 cash checkpoints.'
  ),
  (
    date '2026-07-11',
    3.76920816,
    4.30690891,
    'Cash reconstructed from opening cash plus posted ledger entries through the historical 2026-07-11 checkpoint.'
  ),
  (
    date '2026-08-06',
    null,
    null,
    'Cash checkpoint reconciled to broker and Bitvavo balances supplied by the user.'
  );

with resolved_accounts as (
  select
    workspaces.id as workspace_id,
    accounts.id as account_id,
    expected.owner_name,
    expected.provider_name,
    expected.account_name,
    expected.currency
  from cash_reconciliation_accounts as expected
  join public.workspaces as workspaces
    on workspaces.name = 'Kosterna Portfolio'
  join public.owners as owners
    on owners.workspace_id = workspaces.id
    and owners.display_name = expected.owner_name
  join public.providers as providers
    on providers.workspace_id = workspaces.id
    and providers.name = expected.provider_name
  join public.accounts as accounts
    on accounts.workspace_id = workspaces.id
    and accounts.owner_id = owners.id
    and accounts.provider_id = providers.id
    and accounts.name = expected.account_name
),
calculated as (
  select
    resolved_accounts.workspace_id,
    resolved_accounts.account_id,
    snapshot_dates.snapshot_date,
    resolved_accounts.currency,
    coalesce(
      (
        select sum(entries.cash_delta)
        from public.portfolio_operation_entries as entries
        join public.portfolio_operations as operations
          on operations.id = entries.operation_id
          and operations.workspace_id = entries.workspace_id
        where entries.workspace_id = resolved_accounts.workspace_id
          and entries.account_id = resolved_accounts.account_id
          and entries.currency = resolved_accounts.currency
          and operations.status = 'posted'
          and operations.operation_date <= snapshot_dates.snapshot_date
      ),
      0
    )::numeric(28, 10) as amount,
    snapshot_dates.usd_pln,
    snapshot_dates.eur_pln,
    snapshot_dates.note
  from resolved_accounts
  cross join cash_snapshot_dates as snapshot_dates
),
valued as (
  select
    calculated.*,
    case
      when calculated.currency = 'PLN' then 1::numeric
      when calculated.currency = 'USD' then calculated.usd_pln
      when calculated.currency = 'EUR' then calculated.eur_pln
      else null::numeric
    end as fx_rate_to_base
  from calculated
)
insert into public.cash_balance_snapshots (
  workspace_id,
  account_id,
  snapshot_date,
  amount,
  currency,
  fx_rate_to_base,
  market_value_base,
  source,
  notes
)
select
  valued.workspace_id,
  valued.account_id,
  valued.snapshot_date,
  valued.amount,
  valued.currency,
  valued.fx_rate_to_base,
  case
    when valued.fx_rate_to_base is null then null
    else valued.amount * valued.fx_rate_to_base
  end,
  'import',
  valued.note
from valued
on conflict (workspace_id, account_id, snapshot_date)
do update set
  amount = excluded.amount,
  currency = excluded.currency,
  fx_rate_to_base = excluded.fx_rate_to_base,
  market_value_base = excluded.market_value_base,
  source = excluded.source,
  notes = excluded.notes,
  updated_at = now();


-- ============================================================
-- 7. VALIDATION
-- ============================================================

do $$
declare
  v_cbf_opening_ike numeric;
  v_cbf_opening_ikze numeric;
  v_cbf_july_ike numeric;
  v_cbf_july_ikze numeric;
  v_cbf_current_ike numeric;
  v_cbf_current_ikze numeric;
  v_cash_mismatch_count integer;
  v_snapshot_count integer;
  v_cumulative numeric;
begin
  select quantity
  into v_cbf_opening_ike
  from public.get_portfolio_unit_positions_as_of(
    (
      select id
      from public.workspaces
      where name = 'Kosterna Portfolio'
      limit 1
    ),
    date '2026-06-13'
  )
  where owner_name = 'Natalia'
    and account_name = 'IKE'
    and instrument_ticker = 'CBF'
  limit 1;

  select quantity
  into v_cbf_opening_ikze
  from public.get_portfolio_unit_positions_as_of(
    (
      select id
      from public.workspaces
      where name = 'Kosterna Portfolio'
      limit 1
    ),
    date '2026-06-13'
  )
  where owner_name = 'Natalia'
    and account_name = 'IKZE'
    and instrument_ticker = 'CBF'
  limit 1;

  select quantity
  into v_cbf_july_ike
  from public.get_portfolio_unit_positions_as_of(
    (
      select id
      from public.workspaces
      where name = 'Kosterna Portfolio'
      limit 1
    ),
    date '2026-07-11'
  )
  where owner_name = 'Natalia'
    and account_name = 'IKE'
    and instrument_ticker = 'CBF'
  limit 1;

  select quantity
  into v_cbf_july_ikze
  from public.get_portfolio_unit_positions_as_of(
    (
      select id
      from public.workspaces
      where name = 'Kosterna Portfolio'
      limit 1
    ),
    date '2026-07-11'
  )
  where owner_name = 'Natalia'
    and account_name = 'IKZE'
    and instrument_ticker = 'CBF'
  limit 1;

  select quantity
  into v_cbf_current_ike
  from public.get_portfolio_unit_positions_as_of(
    (
      select id
      from public.workspaces
      where name = 'Kosterna Portfolio'
      limit 1
    ),
    date '2026-08-06'
  )
  where owner_name = 'Natalia'
    and account_name = 'IKE'
    and instrument_ticker = 'CBF'
  limit 1;

  select quantity
  into v_cbf_current_ikze
  from public.get_portfolio_unit_positions_as_of(
    (
      select id
      from public.workspaces
      where name = 'Kosterna Portfolio'
      limit 1
    ),
    date '2026-08-06'
  )
  where owner_name = 'Natalia'
    and account_name = 'IKZE'
    and instrument_ticker = 'CBF'
  limit 1;

  if v_cbf_opening_ike <> 30
     or v_cbf_opening_ikze <> 20
     or v_cbf_july_ike <> 33
     or v_cbf_july_ikze <> 20
     or v_cbf_current_ike <> 36
     or v_cbf_current_ikze <> 28 then
    raise exception
      'Cyber_Folks account allocation validation failed: opening IKE %, opening IKZE %, July IKE %, July IKZE %, current IKE %, current IKZE %.',
      v_cbf_opening_ike,
      v_cbf_opening_ikze,
      v_cbf_july_ike,
      v_cbf_july_ikze,
      v_cbf_current_ike,
      v_cbf_current_ikze;
  end if;

  select count(*)
  into v_cash_mismatch_count
  from cash_reconciliation_accounts as expected
  join public.workspaces as workspaces
    on workspaces.name = 'Kosterna Portfolio'
  join public.owners as owners
    on owners.workspace_id = workspaces.id
    and owners.display_name = expected.owner_name
  join public.providers as providers
    on providers.workspace_id = workspaces.id
    and providers.name = expected.provider_name
  join public.accounts as accounts
    on accounts.workspace_id = workspaces.id
    and accounts.owner_id = owners.id
    and accounts.provider_id = providers.id
    and accounts.name = expected.account_name
  left join lateral (
    select coalesce(sum(entries.cash_delta), 0)::numeric(28, 10) as amount
    from public.portfolio_operation_entries as entries
    join public.portfolio_operations as operations
      on operations.id = entries.operation_id
      and operations.workspace_id = entries.workspace_id
    where entries.workspace_id = workspaces.id
      and entries.account_id = accounts.id
      and entries.currency = expected.currency
      and operations.status = 'posted'
      and operations.operation_date <= date '2026-08-06'
  ) as actual on true
  where abs(actual.amount - expected.expected_current_amount) > 0.00000001;

  if v_cash_mismatch_count <> 0 then
    raise exception
      'Cash reconciliation found % current-balance mismatches.',
      v_cash_mismatch_count;
  end if;

  select count(*)
  into v_snapshot_count
  from public.cash_balance_snapshots as snapshots
  join public.workspaces as workspaces
    on workspaces.id = snapshots.workspace_id
  where workspaces.name = 'Kosterna Portfolio'
    and snapshots.snapshot_date in (
      date '2026-06-13',
      date '2026-07-11',
      date '2026-08-06'
    );

  if v_snapshot_count <> 27 then
    raise exception
      'Expected 27 reconciled cash snapshots, found %.',
      v_snapshot_count;
  end if;

  select cumulative_value
  into v_cumulative
  from private.calculate_cumulative_contributions_as_of(
    (
      select id
      from public.workspaces
      where name = 'Kosterna Portfolio'
      limit 1
    ),
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