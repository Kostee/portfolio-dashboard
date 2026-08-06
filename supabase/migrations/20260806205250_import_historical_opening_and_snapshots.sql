begin;

-- ============================================================
-- HISTORICAL OPENING POSITIONS AND VALUATION CHECKPOINTS
-- Sources:
--   - reconciled portfolio charts dated 2026-06-13 and 2026-07-11
--   - verified transaction history from 2026-06-14 onward
--   - current account screenshots dated 2026-08-06
-- ============================================================

create temporary table historical_opening_units (
  owner_name text not null,
  provider_name text not null,
  account_name text not null,
  instrument_ticker text not null,
  instrument_exchange text,
  quantity numeric(28, 10) not null,
  external_reference text not null
)
on commit drop;

insert into historical_opening_units (
  owner_name,
  provider_name,
  account_name,
  instrument_ticker,
  instrument_exchange,
  quantity,
  external_reference
)
values
    ('Jakub', 'XTB', 'USD brokerage', 'CTRE', 'NYSE', 25, 'legacy-opening-2026-06-13-jakub-xtb-usd-brokerage-ctre'),
    ('Jakub', 'XTB', 'USD brokerage', 'MAA', 'NYSE', 5, 'legacy-opening-2026-06-13-jakub-xtb-usd-brokerage-maa'),
    ('Jakub', 'XTB', 'USD brokerage', 'EQIX', 'NASDAQ', 1, 'legacy-opening-2026-06-13-jakub-xtb-usd-brokerage-eqix'),
    ('Jakub', 'XTB', 'USD brokerage', 'CPT', 'NYSE', 5, 'legacy-opening-2026-06-13-jakub-xtb-usd-brokerage-cpt'),
    ('Jakub', 'XTB', 'USD brokerage', 'AVGO', 'NASDAQ', 1, 'legacy-opening-2026-06-13-jakub-xtb-usd-brokerage-avgo'),
    ('Jakub', 'XTB', 'USD brokerage', 'IWMO.UK', 'LSE', 7, 'legacy-opening-2026-06-13-jakub-xtb-usd-brokerage-iwmo-uk'),
    ('Jakub', 'XTB', 'USD brokerage', 'MU', 'NASDAQ', 0.5, 'legacy-opening-2026-06-13-jakub-xtb-usd-brokerage-mu'),
    ('Jakub', 'XTB', 'USD brokerage', 'SNDK', 'NASDAQ', 0.25, 'legacy-opening-2026-06-13-jakub-xtb-usd-brokerage-sndk'),
    ('Jakub', 'XTB', 'USD brokerage', 'ASML', 'NASDAQ', 0.375, 'legacy-opening-2026-06-13-jakub-xtb-usd-brokerage-asml'),
    ('Jakub', 'XTB', 'USD brokerage', 'VRT', 'NYSE', 1.375, 'legacy-opening-2026-06-13-jakub-xtb-usd-brokerage-vrt'),
    ('Jakub', 'XTB', 'IKE', 'XTB', 'GPW', 350, 'legacy-opening-2026-06-13-jakub-xtb-ike-xtb'),
    ('Jakub', 'XTB', 'IKE', 'DIG', 'GPW', 75, 'legacy-opening-2026-06-13-jakub-xtb-ike-dig'),
    ('Jakub', 'XTB', 'IKE', 'SNT', 'GPW', 36, 'legacy-opening-2026-06-13-jakub-xtb-ike-snt'),
    ('Jakub', 'XTB', 'IKE', 'XNAS.DE', 'XETRA', 52, 'legacy-opening-2026-06-13-jakub-xtb-ike-xnas-de'),
    ('Jakub', 'XTB', 'IKE', 'MBR', 'GPW', 20, 'legacy-opening-2026-06-13-jakub-xtb-ike-mbr'),
    ('Jakub', 'XTB', 'IKE', 'IS3N.DE', 'XETRA', 32, 'legacy-opening-2026-06-13-jakub-xtb-ike-is3n-de'),
    ('Jakub', 'XTB', 'IKE', 'PAS', 'GPW', 40, 'legacy-opening-2026-06-13-jakub-xtb-ike-pas'),
    ('Jakub', 'XTB', 'IKE', 'ABE', 'GPW', 30, 'legacy-opening-2026-06-13-jakub-xtb-ike-abe'),
    ('Jakub', 'XTB', 'IKE', 'TOA', 'GPW', 475, 'legacy-opening-2026-06-13-jakub-xtb-ike-toa'),
    ('Jakub', 'XTB', 'IKE', 'COG', 'GPW', 500, 'legacy-opening-2026-06-13-jakub-xtb-ike-cog'),
    ('Jakub', 'XTB', 'IKE', 'RBW', 'GPW', 25, 'legacy-opening-2026-06-13-jakub-xtb-ike-rbw'),
    ('Jakub', 'XTB', 'IKZE', 'XTB', 'GPW', 50, 'legacy-opening-2026-06-13-jakub-xtb-ikze-xtb'),
    ('Jakub', 'XTB', 'IKZE', 'XNAS.DE', 'XETRA', 30, 'legacy-opening-2026-06-13-jakub-xtb-ikze-xnas-de'),
    ('Jakub', 'XTB', 'IKZE', 'TOA', 'GPW', 325, 'legacy-opening-2026-06-13-jakub-xtb-ikze-toa'),
    ('Jakub', 'XTB', 'IKZE', 'NVDA', 'NASDAQ', 2.5, 'legacy-opening-2026-06-13-jakub-xtb-ikze-nvda'),
    ('Jakub', 'XTB', 'IKZE', 'ABE', 'GPW', 15, 'legacy-opening-2026-06-13-jakub-xtb-ikze-abe'),
    ('Jakub', 'XTB', 'IKZE', 'TSM', 'NYSE', 1.25, 'legacy-opening-2026-06-13-jakub-xtb-ikze-tsm'),
    ('Natalia', 'XTB', 'IKE', 'ASB', 'GPW', 160, 'legacy-opening-2026-06-13-natalia-xtb-ike-asb'),
    ('Natalia', 'XTB', 'IKE', 'KRU', 'GPW', 40, 'legacy-opening-2026-06-13-natalia-xtb-ike-kru'),
    ('Natalia', 'XTB', 'IKE', 'LPP', 'GPW', 0.6, 'legacy-opening-2026-06-13-natalia-xtb-ike-lpp'),
    ('Natalia', 'XTB', 'IKE', 'IS3R.DE', 'XETRA', 18.6, 'legacy-opening-2026-06-13-natalia-xtb-ike-is3r-de'),
    ('Natalia', 'XTB', 'IKE', 'KTY', 'GPW', 5, 'legacy-opening-2026-06-13-natalia-xtb-ike-kty'),
    ('Natalia', 'XTB', 'IKE', 'BDX', 'GPW', 9, 'legacy-opening-2026-06-13-natalia-xtb-ike-bdx'),
    ('Natalia', 'XTB', 'IKE', 'CBF', 'GPW', 26, 'legacy-opening-2026-06-13-natalia-xtb-ike-cbf'),
    ('Natalia', 'XTB', 'IKE', 'UNT', 'GPW', 30, 'legacy-opening-2026-06-13-natalia-xtb-ike-unt'),
    ('Natalia', 'XTB', 'IKE', 'ELT', 'GPW', 70, 'legacy-opening-2026-06-13-natalia-xtb-ike-elt'),
    ('Natalia', 'XTB', 'IKE', 'WPL', 'GPW', 48, 'legacy-opening-2026-06-13-natalia-xtb-ike-wpl'),
    ('Natalia', 'XTB', 'IKE', 'ASE', 'GPW', 40, 'legacy-opening-2026-06-13-natalia-xtb-ike-ase'),
    ('Natalia', 'XTB', 'IKE', 'ANET', 'NYSE', 3, 'legacy-opening-2026-06-13-natalia-xtb-ike-anet'),
    ('Natalia', 'XTB', 'IKE', 'MPWR', 'NASDAQ', 0.25, 'legacy-opening-2026-06-13-natalia-xtb-ike-mpwr'),
    ('Natalia', 'XTB', 'IKZE', 'IS3R.DE', 'XETRA', 18, 'legacy-opening-2026-06-13-natalia-xtb-ikze-is3r-de'),
    ('Natalia', 'XTB', 'IKZE', 'BFT', 'GPW', 1, 'legacy-opening-2026-06-13-natalia-xtb-ikze-bft'),
    ('Natalia', 'XTB', 'IKZE', 'CBF', 'GPW', 24, 'legacy-opening-2026-06-13-natalia-xtb-ikze-cbf'),
    ('Natalia', 'XTB', 'IKZE', 'NWG', 'GPW', 42, 'legacy-opening-2026-06-13-natalia-xtb-ikze-nwg'),
    ('Natalia', 'XTB', 'IKZE', 'ELT', 'GPW', 55, 'legacy-opening-2026-06-13-natalia-xtb-ikze-elt'),
    ('Natalia', 'XTB', 'IKZE', 'WPL', 'GPW', 32, 'legacy-opening-2026-06-13-natalia-xtb-ikze-wpl'),
    ('Natalia', 'XTB', 'IKZE', 'ASE', 'GPW', 35, 'legacy-opening-2026-06-13-natalia-xtb-ikze-ase'),

    ('Jakub', 'Binance', 'Crypto', 'BTC', null, 0.058, 'legacy-opening-2026-06-13-jakub-binance-crypto-btc');

-- Attach deterministic references to historical opening operations
-- that already existed before this migration.
update public.portfolio_operations as operations
set
  source = 'import',
  external_reference = opening.external_reference,
  notes = concat_ws(
    ' ',
    nullif(operations.notes, ''),
    'Reconciled historical opening state for 2026-06-13.'
  ),
  updated_at = now()
from historical_opening_units as opening
join public.workspaces as workspaces
  on workspaces.name = 'Kosterna Portfolio'
join public.owners as owners
  on owners.workspace_id = workspaces.id
  and owners.display_name = opening.owner_name
join public.providers as providers
  on providers.workspace_id = workspaces.id
  and providers.name = opening.provider_name
join public.accounts as accounts
  on accounts.workspace_id = workspaces.id
  and accounts.owner_id = owners.id
  and accounts.provider_id = providers.id
  and accounts.name = opening.account_name
join public.instruments as instruments
  on instruments.workspace_id = workspaces.id
  and upper(instruments.ticker) = upper(opening.instrument_ticker)
  and coalesce(upper(instruments.exchange), '') =
      coalesce(upper(opening.instrument_exchange), '')
where operations.workspace_id = workspaces.id
  and operations.operation_date = date '2026-06-13'
  and operations.operation_type = 'opening_position'
  and operations.external_reference is null
  and exists (
    select 1
    from public.portfolio_operation_entries as entries
    where entries.operation_id = operations.id
      and entries.workspace_id = operations.workspace_id
      and entries.account_id = accounts.id
      and entries.instrument_id = instruments.id
      and entries.quantity_delta = opening.quantity
  );

insert into public.portfolio_operations (
  workspace_id,
  operation_date,
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
  'opening_position',
  'posted',
  'import',
  'Reconciled opening position on 2026-06-13',
  'Quantity reconstructed from the 2026-06-13 checkpoint and verified against later transactions and current holdings.',
  opening.external_reference
from historical_opening_units as opening
join public.workspaces as workspaces
  on workspaces.name = 'Kosterna Portfolio'
where not exists (
  select 1
  from public.portfolio_operations as existing
  where existing.workspace_id = workspaces.id
    and existing.source = 'import'
    and existing.external_reference = opening.external_reference
)
on conflict (
  workspace_id,
  source,
  external_reference
)
where external_reference is not null
do update set
  operation_date = excluded.operation_date,
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
  opening.quantity,
  0,
  0,
  instruments.default_currency,
  0,
  0,
  'Reconciled opening quantity at the detailed-tracking start date.'
from historical_opening_units as opening
join public.workspaces as workspaces
  on workspaces.name = 'Kosterna Portfolio'
join public.owners as owners
  on owners.workspace_id = workspaces.id
  and owners.display_name = opening.owner_name
join public.providers as providers
  on providers.workspace_id = workspaces.id
  and providers.name = opening.provider_name
join public.accounts as accounts
  on accounts.workspace_id = workspaces.id
  and accounts.owner_id = owners.id
  and accounts.provider_id = providers.id
  and accounts.name = opening.account_name
join public.instruments as instruments
  on instruments.workspace_id = workspaces.id
  and upper(instruments.ticker) = upper(opening.instrument_ticker)
  and coalesce(upper(instruments.exchange), '') =
      coalesce(upper(opening.instrument_exchange), '')
join public.portfolio_operations as operations
  on operations.workspace_id = workspaces.id
  and operations.source = 'import'
  and operations.external_reference = opening.external_reference
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
  base_cash_delta = excluded.base_cash_delta,
  base_value_delta = excluded.base_value_delta,
  memo = excluded.memo,
  updated_at = now();

-- ============================================================
-- OPENING REPORTED BALANCES FOR PPK
-- ============================================================

create temporary table historical_opening_balances (
  owner_name text not null,
  provider_name text not null,
  account_name text not null,
  instrument_ticker text,
  opening_value numeric(28, 10) not null,
  currency char(3) not null,
  external_reference text not null
)
on commit drop;

insert into historical_opening_balances (
  owner_name,
  provider_name,
  account_name,
  instrument_ticker,
  opening_value,
  currency,
  external_reference
)
values
  (
    'Jakub',
    'Pekao TFI S.A.',
    'PPK',
    null,
    3997.25,
    'PLN',
    'legacy-opening-2026-06-13-jakub-ppk'
  ),
  (
    'Natalia',
    'Pekao TFI S.A.',
    'PPK',
    null,
    577.16,
    'PLN',
    'legacy-opening-2026-06-13-natalia-ppk'
  );

insert into public.portfolio_operations (
  workspace_id,
  operation_date,
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
  'opening_position',
  'posted',
  'import',
  'Opening reported PPK balance on 2026-06-13',
  'Balance-only asset reconstructed from the historical monthly checkpoint.',
  opening.external_reference
from historical_opening_balances as opening
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
  0,
  opening.opening_value,
  opening.currency,
  1,
  0,
  opening.opening_value,
  'Opening reported PPK value.'
from historical_opening_balances as opening
join public.workspaces as workspaces
  on workspaces.name = 'Kosterna Portfolio'
join public.owners as owners
  on owners.workspace_id = workspaces.id
  and owners.display_name = opening.owner_name
join public.providers as providers
  on providers.workspace_id = workspaces.id
  and providers.name = opening.provider_name
join public.accounts as accounts
  on accounts.workspace_id = workspaces.id
  and accounts.owner_id = owners.id
  and accounts.provider_id = providers.id
  and accounts.name = opening.account_name
join public.instruments as instruments
  on instruments.workspace_id = workspaces.id
  and instruments.tracking_mode = 'balance'
  and instruments.instrument_kind = 'ppk_fund'
join public.portfolio_operations as operations
  on operations.workspace_id = workspaces.id
  and operations.source = 'import'
  and operations.external_reference = opening.external_reference
on conflict (
  operation_id,
  sequence_no
)
do update set
  account_id = excluded.account_id,
  instrument_id = excluded.instrument_id,
  component = excluded.component,
  value_delta = excluded.value_delta,
  currency = excluded.currency,
  fx_rate_to_base = excluded.fx_rate_to_base,
  base_value_delta = excluded.base_value_delta,
  memo = excluded.memo,
  updated_at = now();

-- ============================================================
-- HISTORICAL EXCHANGE RATES USED BY THE LEGACY CHECKPOINTS
-- ============================================================

insert into public.exchange_rates (
  workspace_id,
  rate_date,
  from_currency,
  to_currency,
  rate,
  source,
  notes
)
select
  workspaces.id,
  rates.rate_date,
  rates.from_currency,
  'PLN',
  rates.rate,
  'import',
  rates.notes
from public.workspaces as workspaces
cross join (
  values
    (
      date '2026-06-13',
      'USD'::char(3),
      3.68780046::numeric,
      'Rate reconstructed from the detailed legacy chart dated 2026-06-13.'
    ),
    (
      date '2026-06-13',
      'EUR'::char(3),
      4.25299985::numeric,
      'Rate reconstructed from the detailed legacy chart dated 2026-06-13.'
    ),
    (
      date '2026-07-11',
      'USD'::char(3),
      3.76920816::numeric,
      'Rate reconstructed from the detailed legacy chart dated 2026-07-11.'
    ),
    (
      date '2026-07-11',
      'EUR'::char(3),
      4.30690891::numeric,
      'Rate reconstructed from the detailed legacy chart dated 2026-07-11.'
    )
) as rates (
  rate_date,
  from_currency,
  rate,
  notes
)
where workspaces.name = 'Kosterna Portfolio'
on conflict (
  workspace_id,
  rate_date,
  from_currency,
  to_currency
)
do update set
  rate = excluded.rate,
  source = excluded.source,
  notes = excluded.notes,
  updated_at = now();

-- ============================================================
-- QUANTITIES AT BOTH HISTORICAL CHECKPOINTS
-- ============================================================

create temporary table historical_quantities (
  snapshot_date date not null,
  owner_name text not null,
  provider_name text not null,
  account_name text not null,
  instrument_ticker text not null,
  instrument_exchange text,
  quantity numeric(28, 10) not null
)
on commit drop;

insert into historical_quantities (
  snapshot_date,
  owner_name,
  provider_name,
  account_name,
  instrument_ticker,
  instrument_exchange,
  quantity
)
values
    (date '2026-06-13', 'Jakub', 'XTB', 'USD brokerage', 'CTRE', 'NYSE', 25),
    (date '2026-06-13', 'Jakub', 'XTB', 'USD brokerage', 'MAA', 'NYSE', 5),
    (date '2026-06-13', 'Jakub', 'XTB', 'USD brokerage', 'EQIX', 'NASDAQ', 1),
    (date '2026-06-13', 'Jakub', 'XTB', 'USD brokerage', 'CPT', 'NYSE', 5),
    (date '2026-06-13', 'Jakub', 'XTB', 'USD brokerage', 'AVGO', 'NASDAQ', 1),
    (date '2026-06-13', 'Jakub', 'XTB', 'USD brokerage', 'IWMO.UK', 'LSE', 7),
    (date '2026-06-13', 'Jakub', 'XTB', 'USD brokerage', 'MU', 'NASDAQ', 0.5),
    (date '2026-06-13', 'Jakub', 'XTB', 'USD brokerage', 'SNDK', 'NASDAQ', 0.25),
    (date '2026-06-13', 'Jakub', 'XTB', 'USD brokerage', 'ASML', 'NASDAQ', 0.375),
    (date '2026-06-13', 'Jakub', 'XTB', 'USD brokerage', 'VRT', 'NYSE', 1.375),
    (date '2026-06-13', 'Jakub', 'XTB', 'IKE', 'XTB', 'GPW', 350),
    (date '2026-06-13', 'Jakub', 'XTB', 'IKE', 'DIG', 'GPW', 75),
    (date '2026-06-13', 'Jakub', 'XTB', 'IKE', 'SNT', 'GPW', 36),
    (date '2026-06-13', 'Jakub', 'XTB', 'IKE', 'XNAS.DE', 'XETRA', 52),
    (date '2026-06-13', 'Jakub', 'XTB', 'IKE', 'MBR', 'GPW', 20),
    (date '2026-06-13', 'Jakub', 'XTB', 'IKE', 'IS3N.DE', 'XETRA', 32),
    (date '2026-06-13', 'Jakub', 'XTB', 'IKE', 'PAS', 'GPW', 40),
    (date '2026-06-13', 'Jakub', 'XTB', 'IKE', 'ABE', 'GPW', 30),
    (date '2026-06-13', 'Jakub', 'XTB', 'IKE', 'TOA', 'GPW', 475),
    (date '2026-06-13', 'Jakub', 'XTB', 'IKE', 'COG', 'GPW', 500),
    (date '2026-06-13', 'Jakub', 'XTB', 'IKE', 'RBW', 'GPW', 25),
    (date '2026-06-13', 'Jakub', 'XTB', 'IKZE', 'XTB', 'GPW', 50),
    (date '2026-06-13', 'Jakub', 'XTB', 'IKZE', 'XNAS.DE', 'XETRA', 30),
    (date '2026-06-13', 'Jakub', 'XTB', 'IKZE', 'TOA', 'GPW', 325),
    (date '2026-06-13', 'Jakub', 'XTB', 'IKZE', 'NVDA', 'NASDAQ', 2.5),
    (date '2026-06-13', 'Jakub', 'XTB', 'IKZE', 'ABE', 'GPW', 15),
    (date '2026-06-13', 'Jakub', 'XTB', 'IKZE', 'TSM', 'NYSE', 1.25),
    (date '2026-06-13', 'Natalia', 'XTB', 'IKE', 'ASB', 'GPW', 160),
    (date '2026-06-13', 'Natalia', 'XTB', 'IKE', 'KRU', 'GPW', 40),
    (date '2026-06-13', 'Natalia', 'XTB', 'IKE', 'LPP', 'GPW', 0.6),
    (date '2026-06-13', 'Natalia', 'XTB', 'IKE', 'IS3R.DE', 'XETRA', 18.6),
    (date '2026-06-13', 'Natalia', 'XTB', 'IKE', 'KTY', 'GPW', 5),
    (date '2026-06-13', 'Natalia', 'XTB', 'IKE', 'BDX', 'GPW', 9),
    (date '2026-06-13', 'Natalia', 'XTB', 'IKE', 'CBF', 'GPW', 26),
    (date '2026-06-13', 'Natalia', 'XTB', 'IKE', 'UNT', 'GPW', 30),
    (date '2026-06-13', 'Natalia', 'XTB', 'IKE', 'ELT', 'GPW', 70),
    (date '2026-06-13', 'Natalia', 'XTB', 'IKE', 'WPL', 'GPW', 48),
    (date '2026-06-13', 'Natalia', 'XTB', 'IKE', 'ASE', 'GPW', 40),
    (date '2026-06-13', 'Natalia', 'XTB', 'IKE', 'ANET', 'NYSE', 3),
    (date '2026-06-13', 'Natalia', 'XTB', 'IKE', 'MPWR', 'NASDAQ', 0.25),
    (date '2026-06-13', 'Natalia', 'XTB', 'IKZE', 'IS3R.DE', 'XETRA', 18),
    (date '2026-06-13', 'Natalia', 'XTB', 'IKZE', 'BFT', 'GPW', 1),
    (date '2026-06-13', 'Natalia', 'XTB', 'IKZE', 'CBF', 'GPW', 24),
    (date '2026-06-13', 'Natalia', 'XTB', 'IKZE', 'NWG', 'GPW', 42),
    (date '2026-06-13', 'Natalia', 'XTB', 'IKZE', 'ELT', 'GPW', 55),
    (date '2026-06-13', 'Natalia', 'XTB', 'IKZE', 'WPL', 'GPW', 32),
    (date '2026-06-13', 'Natalia', 'XTB', 'IKZE', 'ASE', 'GPW', 35),

    (date '2026-06-13', 'Jakub', 'Binance', 'Crypto', 'BTC', null, 0.058),
    (date '2026-07-11', 'Jakub', 'XTB', 'USD brokerage', 'CTRE', 'NYSE', 25),
    (date '2026-07-11', 'Jakub', 'XTB', 'USD brokerage', 'MAA', 'NYSE', 5),
    (date '2026-07-11', 'Jakub', 'XTB', 'USD brokerage', 'EQIX', 'NASDAQ', 1),
    (date '2026-07-11', 'Jakub', 'XTB', 'USD brokerage', 'CPT', 'NYSE', 5),
    (date '2026-07-11', 'Jakub', 'XTB', 'USD brokerage', 'AVGO', 'NASDAQ', 1.5),
    (date '2026-07-11', 'Jakub', 'XTB', 'USD brokerage', 'IWMO.UK', 'LSE', 7),
    (date '2026-07-11', 'Jakub', 'XTB', 'USD brokerage', 'MU', 'NASDAQ', 0.6),
    (date '2026-07-11', 'Jakub', 'XTB', 'USD brokerage', 'SNDK', 'NASDAQ', 0.3),
    (date '2026-07-11', 'Jakub', 'XTB', 'USD brokerage', 'ASML', 'NASDAQ', 0.375),
    (date '2026-07-11', 'Jakub', 'XTB', 'USD brokerage', 'VRT', 'NYSE', 1.5),
    (date '2026-07-11', 'Jakub', 'XTB', 'IKE', 'XTB', 'GPW', 350),
    (date '2026-07-11', 'Jakub', 'XTB', 'IKE', 'DIG', 'GPW', 75),
    (date '2026-07-11', 'Jakub', 'XTB', 'IKE', 'SNT', 'GPW', 43),
    (date '2026-07-11', 'Jakub', 'XTB', 'IKE', 'XNAS.DE', 'XETRA', 55),
    (date '2026-07-11', 'Jakub', 'XTB', 'IKE', 'MBR', 'GPW', 23),
    (date '2026-07-11', 'Jakub', 'XTB', 'IKE', 'IS3N.DE', 'XETRA', 36),
    (date '2026-07-11', 'Jakub', 'XTB', 'IKE', 'PAS', 'GPW', 45),
    (date '2026-07-11', 'Jakub', 'XTB', 'IKE', 'ABE', 'GPW', 38),
    (date '2026-07-11', 'Jakub', 'XTB', 'IKE', 'TOA', 'GPW', 483),
    (date '2026-07-11', 'Jakub', 'XTB', 'IKE', 'COG', 'GPW', 500),
    (date '2026-07-11', 'Jakub', 'XTB', 'IKZE', 'XTB', 'GPW', 50),
    (date '2026-07-11', 'Jakub', 'XTB', 'IKZE', 'XNAS.DE', 'XETRA', 30),
    (date '2026-07-11', 'Jakub', 'XTB', 'IKZE', 'TOA', 'GPW', 325),
    (date '2026-07-11', 'Jakub', 'XTB', 'IKZE', 'NVDA', 'NASDAQ', 3.25),
    (date '2026-07-11', 'Jakub', 'XTB', 'IKZE', 'ABE', 'GPW', 17),
    (date '2026-07-11', 'Jakub', 'XTB', 'IKZE', 'TSM', 'NYSE', 1.25),
    (date '2026-07-11', 'Natalia', 'XTB', 'IKE', 'ASB', 'GPW', 160),
    (date '2026-07-11', 'Natalia', 'XTB', 'IKE', 'KRU', 'GPW', 40),
    (date '2026-07-11', 'Natalia', 'XTB', 'IKE', 'LPP', 'GPW', 0.65),
    (date '2026-07-11', 'Natalia', 'XTB', 'IKE', 'IS3R.DE', 'XETRA', 20),
    (date '2026-07-11', 'Natalia', 'XTB', 'IKE', 'KTY', 'GPW', 5.35),
    (date '2026-07-11', 'Natalia', 'XTB', 'IKE', 'BDX', 'GPW', 10),
    (date '2026-07-11', 'Natalia', 'XTB', 'IKE', 'CBF', 'GPW', 29),
    (date '2026-07-11', 'Natalia', 'XTB', 'IKE', 'UNT', 'GPW', 33),
    (date '2026-07-11', 'Natalia', 'XTB', 'IKE', 'ELT', 'GPW', 70),
    (date '2026-07-11', 'Natalia', 'XTB', 'IKE', 'WPL', 'GPW', 32),
    (date '2026-07-11', 'Natalia', 'XTB', 'IKE', 'ASE', 'GPW', 20),
    (date '2026-07-11', 'Natalia', 'XTB', 'IKE', 'ANET', 'NYSE', 3),
    (date '2026-07-11', 'Natalia', 'XTB', 'IKE', 'MPWR', 'NASDAQ', 0.375),
    (date '2026-07-11', 'Natalia', 'XTB', 'IKZE', 'IS3R.DE', 'XETRA', 18),
    (date '2026-07-11', 'Natalia', 'XTB', 'IKZE', 'BFT', 'GPW', 1),
    (date '2026-07-11', 'Natalia', 'XTB', 'IKZE', 'CBF', 'GPW', 24),
    (date '2026-07-11', 'Natalia', 'XTB', 'IKZE', 'NWG', 'GPW', 42),
    (date '2026-07-11', 'Natalia', 'XTB', 'IKZE', 'ELT', 'GPW', 60),
    (date '2026-07-11', 'Natalia', 'XTB', 'IKZE', 'WPL', 'GPW', 32),
    (date '2026-07-11', 'Natalia', 'XTB', 'IKZE', 'ASE', 'GPW', 35),

    (date '2026-07-11', 'Jakub', 'Bitvavo', 'Crypto', 'BTC', null, 0.065);

-- ============================================================
-- AGGREGATE VALUES READ FROM THE DETAILED LEGACY CHARTS
-- Market values for multi-account instruments are allocated
-- proportionally by quantity, i.e. using one market price.
-- ============================================================

create temporary table historical_aggregate_values (
  snapshot_date date not null,
  instrument_ticker text not null,
  instrument_exchange text,
  total_quantity numeric(28, 10) not null,
  market_value numeric(28, 10) not null,
  currency char(3) not null,
  market_value_base numeric(28, 10) not null
)
on commit drop;

insert into historical_aggregate_values (
  snapshot_date,
  instrument_ticker,
  instrument_exchange,
  total_quantity,
  market_value,
  currency,
  market_value_base
)
values
    (date '2026-06-13', 'XTB', 'GPW', 400, 44000, 'PLN', 44000),
    (date '2026-06-13', 'DIG', 'GPW', 75, 17925, 'PLN', 17925),
    (date '2026-06-13', 'KRU', 'GPW', 40, 16224, 'PLN', 16224),
    (date '2026-06-13', 'ASB', 'GPW', 160, 13896, 'PLN', 13896),
    (date '2026-06-13', 'LPP', 'GPW', 0.6, 12360, 'PLN', 12360),
    (date '2026-06-13', 'SNT', 'GPW', 36, 10534, 'PLN', 10534),
    (date '2026-06-13', 'CBF', 'GPW', 50, 9260, 'PLN', 9260),
    (date '2026-06-13', 'MBR', 'GPW', 20, 7100, 'PLN', 7100),
    (date '2026-06-13', 'ELT', 'GPW', 125, 6575, 'PLN', 6575),
    (date '2026-06-13', 'TOA', 'GPW', 800, 6448, 'PLN', 6448),
    (date '2026-06-13', 'ABE', 'GPW', 45, 6120, 'PLN', 6120),
    (date '2026-06-13', 'BDX', 'GPW', 9, 6070, 'PLN', 6070),
    (date '2026-06-13', 'KTY', 'GPW', 5, 6065, 'PLN', 6065),
    (date '2026-06-13', 'UNT', 'GPW', 30, 4812, 'PLN', 4812),
    (date '2026-06-13', 'PAS', 'GPW', 40, 4784, 'PLN', 4784),
    (date '2026-06-13', 'BFT', 'GPW', 1, 4758, 'PLN', 4758),
    (date '2026-06-13', 'WPL', 'GPW', 80, 4752, 'PLN', 4752),
    (date '2026-06-13', 'ASE', 'GPW', 75, 4732, 'PLN', 4732),
    (date '2026-06-13', 'NWG', 'GPW', 42, 3906, 'PLN', 3906),
    (date '2026-06-13', 'RBW', 'GPW', 25, 3695, 'PLN', 3695),
    (date '2026-06-13', 'COG', 'GPW', 500, 3170, 'PLN', 3170),
    (date '2026-06-13', 'XNAS.DE', 'XETRA', 82, 4875.72, 'EUR', 20736.4364286420),
    (date '2026-06-13', 'IS3R.DE', 'XETRA', 36.6, 3780.05, 'EUR', 16076.5520829925),
    (date '2026-06-13', 'IWMO.UK', 'LSE', 7, 835.45, 'USD', 3080.9728943070),
    (date '2026-06-13', 'IS3N.DE', 'XETRA', 32, 1532.54, 'EUR', 6517.8923901190),
    (date '2026-06-13', 'EQIX', 'NASDAQ', 1, 1055.85, 'USD', 3893.7641156910),
    (date '2026-06-13', 'CTRE', 'NYSE', 25, 921.25, 'USD', 3397.3861737750),
    (date '2026-06-13', 'MAA', 'NYSE', 5, 694.65, 'USD', 2561.7305895390),
    (date '2026-06-13', 'CPT', 'NYSE', 5, 574.9, 'USD', 2120.116484454),
    (date '2026-06-13', 'ASML', 'NASDAQ', 0.375, 611.1, 'USD', 2253.614861106),
    (date '2026-06-13', 'TSM', 'NYSE', 1.25, 529.91, 'USD', 1954.2023417586),
    (date '2026-06-13', 'NVDA', 'NASDAQ', 2.5, 512.98, 'USD', 1891.7678799708),
    (date '2026-06-13', 'SNDK', 'NASDAQ', 0.25, 495.03, 'USD', 1825.5718617138),
    (date '2026-06-13', 'MU', 'NASDAQ', 0.5, 490.81, 'USD', 1810.0093437726),
    (date '2026-06-13', 'ANET', 'NYSE', 3, 489.72, 'USD', 1805.9896412712),
    (date '2026-06-13', 'VRT', 'NYSE', 1.375, 416.45, 'USD', 1535.7845015670),
    (date '2026-06-13', 'MPWR', 'NASDAQ', 0.25, 394.33, 'USD', 1454.2103553918),
    (date '2026-06-13', 'AVGO', 'NASDAQ', 1, 382.07, 'USD', 1408.9979217522),

    (date '2026-06-13', 'BTC', null, 0.058, 3298.66693976017892405991972936, 'EUR', 14029.23),
    (date '2026-07-11', 'XTB', 'GPW', 400, 51760, 'PLN', 51760),
    (date '2026-07-11', 'DIG', 'GPW', 75, 23010, 'PLN', 23010),
    (date '2026-07-11', 'ASB', 'GPW', 160, 18256, 'PLN', 18256),
    (date '2026-07-11', 'KRU', 'GPW', 40, 16560, 'PLN', 16560),
    (date '2026-07-11', 'SNT', 'GPW', 43, 16538, 'PLN', 16538),
    (date '2026-07-11', 'LPP', 'GPW', 0.65, 12597, 'PLN', 12597),
    (date '2026-07-11', 'CBF', 'GPW', 53, 10218, 'PLN', 10218),
    (date '2026-07-11', 'MBR', 'GPW', 23, 8590, 'PLN', 8590),
    (date '2026-07-11', 'TOA', 'GPW', 808, 7789, 'PLN', 7789),
    (date '2026-07-11', 'ABE', 'GPW', 55, 7590, 'PLN', 7590),
    (date '2026-07-11', 'ELT', 'GPW', 130, 7366, 'PLN', 7366),
    (date '2026-07-11', 'BDX', 'GPW', 10, 7298, 'PLN', 7298),
    (date '2026-07-11', 'KTY', 'GPW', 5.35, 6602, 'PLN', 6602),
    (date '2026-07-11', 'UNT', 'GPW', 33, 5709, 'PLN', 5709),
    (date '2026-07-11', 'PAS', 'GPW', 45, 5292, 'PLN', 5292),
    (date '2026-07-11', 'BFT', 'GPW', 1, 4990, 'PLN', 4990),
    (date '2026-07-11', 'NWG', 'GPW', 42, 3931, 'PLN', 3931),
    (date '2026-07-11', 'WPL', 'GPW', 64, 3712, 'PLN', 3712),
    (date '2026-07-11', 'ASE', 'GPW', 55, 3300, 'PLN', 3300),
    (date '2026-07-11', 'COG', 'GPW', 500, 2915, 'PLN', 2915),
    (date '2026-07-11', 'XNAS.DE', 'XETRA', 85, 5126.35, 'EUR', 22078.7224907785),
    (date '2026-07-11', 'IS3R.DE', 'XETRA', 38, 3915.52, 'EUR', 16863.7879752832),
    (date '2026-07-11', 'IWMO.UK', 'LSE', 7, 825.51, 'USD', 3111.5190281616),
    (date '2026-07-11', 'IS3N.DE', 'XETRA', 36, 1724.22, 'EUR', 7426.0584808002),
    (date '2026-07-11', 'EQIX', 'NASDAQ', 1, 1051.21, 'USD', 3962.2293098736),
    (date '2026-07-11', 'CTRE', 'NYSE', 25, 1005.5, 'USD', 3789.938804880),
    (date '2026-07-11', 'MAA', 'NYSE', 5, 676.25, 'USD', 2548.9270182000),
    (date '2026-07-11', 'CPT', 'NYSE', 5, 564.8, 'USD', 2128.848768768),
    (date '2026-07-11', 'NVDA', 'NASDAQ', 3.25, 685.62, 'USD', 2584.2444986592),
    (date '2026-07-11', 'ASML', 'NASDAQ', 0.375, 674.0, 'USD', 2540.446299840),
    (date '2026-07-11', 'AVGO', 'NASDAQ', 1.5, 599.96, 'USD', 2261.3741276736),
    (date '2026-07-11', 'MU', 'NASDAQ', 0.6, 587.58, 'USD', 2214.7113306528),
    (date '2026-07-11', 'SNDK', 'NASDAQ', 0.3, 574.78, 'USD', 2166.4654662048),
    (date '2026-07-11', 'ANET', 'NYSE', 3, 560.88, 'USD', 2114.0734727808),
    (date '2026-07-11', 'TSM', 'NYSE', 1.25, 543.04, 'USD', 2046.8307992064),
    (date '2026-07-11', 'MPWR', 'NASDAQ', 0.375, 507.28, 'USD', 1912.0439154048),
    (date '2026-07-11', 'VRT', 'NYSE', 1.5, 478.29, 'USD', 1802.7745708464),

    (date '2026-07-11', 'BTC', null, 0.065, 3667.43767515621778032914097549, 'EUR', 15795.32);

-- Ensure the documented aggregate quantities agree with the
-- account-level quantity matrix before persisting valuations.
do $$
declare
  v_mismatch_count integer;
begin
  select count(*)
  into v_mismatch_count
  from historical_aggregate_values as aggregate_values
  left join (
    select
      snapshot_date,
      instrument_ticker,
      instrument_exchange,
      sum(quantity)::numeric(28, 10) as quantity
    from historical_quantities
    group by
      snapshot_date,
      instrument_ticker,
      instrument_exchange
  ) as quantities
    on quantities.snapshot_date = aggregate_values.snapshot_date
    and quantities.instrument_ticker = aggregate_values.instrument_ticker
    and coalesce(quantities.instrument_exchange, '') =
        coalesce(aggregate_values.instrument_exchange, '')
  where quantities.quantity is null
    or abs(
      quantities.quantity -
      aggregate_values.total_quantity
    ) > 0.00000001;

  if v_mismatch_count <> 0 then
    raise exception
      'Historical aggregate values contain % quantity mismatches.',
      v_mismatch_count;
  end if;
end;
$$;

-- ============================================================
-- UNIT-BASED POSITION SNAPSHOTS
-- ============================================================

insert into public.position_snapshots (
  workspace_id,
  account_id,
  instrument_id,
  snapshot_date,
  quantity,
  unit_price,
  market_value,
  currency,
  fx_rate_to_base,
  market_value_base,
  source,
  notes
)
select
  workspaces.id,
  accounts.id,
  instruments.id,
  quantities.snapshot_date,
  quantities.quantity,
  (
    aggregate_values.market_value /
    aggregate_values.total_quantity
  )::numeric(28, 10),
  (
    aggregate_values.market_value *
    quantities.quantity /
    aggregate_values.total_quantity
  )::numeric(28, 10),
  aggregate_values.currency,
  case
    when aggregate_values.market_value = 0 then null
    else (
      aggregate_values.market_value_base /
      aggregate_values.market_value
    )::numeric(28, 10)
  end,
  (
    aggregate_values.market_value_base *
    quantities.quantity /
    aggregate_values.total_quantity
  )::numeric(28, 10),
  'import',
  case
    when quantities.snapshot_date = date '2026-06-13'
      and quantities.instrument_ticker = 'MPWR'
      then 'Legacy chart value retained; displayed quantity label was corrected from 1 to 0.25.'
    when quantities.snapshot_date = date '2026-07-11'
      and quantities.instrument_ticker = 'LPP'
      then 'Legacy chart value retained; displayed quantity label was corrected from 0.5 to 0.65.'
    when quantities.snapshot_date = date '2026-07-11'
      and quantities.instrument_ticker = 'ELT'
      then 'Legacy chart value retained; displayed quantity label was corrected from 125 to 130.'
    else 'Historical valuation reconstructed from the detailed monthly chart and reconciled quantity matrix.'
  end
from historical_quantities as quantities
join historical_aggregate_values as aggregate_values
  on aggregate_values.snapshot_date = quantities.snapshot_date
  and aggregate_values.instrument_ticker = quantities.instrument_ticker
  and coalesce(aggregate_values.instrument_exchange, '') =
      coalesce(quantities.instrument_exchange, '')
join public.workspaces as workspaces
  on workspaces.name = 'Kosterna Portfolio'
join public.owners as owners
  on owners.workspace_id = workspaces.id
  and owners.display_name = quantities.owner_name
join public.providers as providers
  on providers.workspace_id = workspaces.id
  and providers.name = quantities.provider_name
join public.accounts as accounts
  on accounts.workspace_id = workspaces.id
  and accounts.owner_id = owners.id
  and accounts.provider_id = providers.id
  and accounts.name = quantities.account_name
join public.instruments as instruments
  on instruments.workspace_id = workspaces.id
  and upper(instruments.ticker) = upper(quantities.instrument_ticker)
  and coalesce(upper(instruments.exchange), '') =
      coalesce(upper(quantities.instrument_exchange), '')
  and instruments.tracking_mode = 'units'
on conflict (
  workspace_id,
  account_id,
  instrument_id,
  snapshot_date
)
do update set
  quantity = excluded.quantity,
  unit_price = excluded.unit_price,
  market_value = excluded.market_value,
  currency = excluded.currency,
  fx_rate_to_base = excluded.fx_rate_to_base,
  market_value_base = excluded.market_value_base,
  source = excluded.source,
  notes = excluded.notes,
  updated_at = now();

-- One instrument-level historical price per checkpoint.
insert into public.instrument_prices (
  workspace_id,
  instrument_id,
  price_date,
  price,
  currency,
  source,
  notes
)
select
  workspaces.id,
  instruments.id,
  aggregate_values.snapshot_date,
  (
    aggregate_values.market_value /
    aggregate_values.total_quantity
  )::numeric(28, 10),
  aggregate_values.currency,
  'import',
  'Unit price derived from the reconciled aggregate historical valuation.'
from historical_aggregate_values as aggregate_values
join public.workspaces as workspaces
  on workspaces.name = 'Kosterna Portfolio'
join public.instruments as instruments
  on instruments.workspace_id = workspaces.id
  and upper(instruments.ticker) = upper(aggregate_values.instrument_ticker)
  and coalesce(upper(instruments.exchange), '') =
      coalesce(upper(aggregate_values.instrument_exchange), '')
  and instruments.tracking_mode = 'units'
on conflict (
  workspace_id,
  instrument_id,
  price_date,
  currency
)
do update set
  price = excluded.price,
  source = excluded.source,
  notes = excluded.notes,
  updated_at = now();

-- ============================================================
-- PPK BALANCE SNAPSHOTS
-- ============================================================

insert into public.position_snapshots (
  workspace_id,
  account_id,
  instrument_id,
  snapshot_date,
  quantity,
  unit_price,
  market_value,
  currency,
  fx_rate_to_base,
  market_value_base,
  source,
  notes
)
select
  workspaces.id,
  accounts.id,
  instruments.id,
  snapshots.snapshot_date,
  null,
  null,
  snapshots.market_value,
  'PLN',
  1,
  snapshots.market_value,
  'import',
  'Historical PPK balance reported in the monthly checkpoint.'
from public.workspaces as workspaces
join public.owners as owners
  on owners.workspace_id = workspaces.id
join public.providers as providers
  on providers.workspace_id = workspaces.id
  and providers.name = 'Pekao TFI S.A.'
join public.accounts as accounts
  on accounts.workspace_id = workspaces.id
  and accounts.owner_id = owners.id
  and accounts.provider_id = providers.id
  and accounts.name = 'PPK'
join public.instruments as instruments
  on instruments.workspace_id = workspaces.id
  and instruments.tracking_mode = 'balance'
  and instruments.instrument_kind = 'ppk_fund'
join (
  values
    ('Jakub', date '2026-06-13', 3997.25::numeric),
    ('Natalia', date '2026-06-13', 577.16::numeric),
    ('Jakub', date '2026-07-11', 4848.45::numeric),
    ('Natalia', date '2026-07-11', 879.99::numeric)
) as snapshots (
  owner_name,
  snapshot_date,
  market_value
)
  on snapshots.owner_name = owners.display_name
where workspaces.name = 'Kosterna Portfolio'
on conflict (
  workspace_id,
  account_id,
  instrument_id,
  snapshot_date
)
do update set
  quantity = excluded.quantity,
  unit_price = excluded.unit_price,
  market_value = excluded.market_value,
  currency = excluded.currency,
  fx_rate_to_base = excluded.fx_rate_to_base,
  market_value_base = excluded.market_value_base,
  source = excluded.source,
  notes = excluded.notes,
  updated_at = now();

-- ============================================================
-- VALIDATION
-- ============================================================

do $$
declare
  v_opening_mismatch_count integer;
  v_snapshot_20260613_count integer;
  v_snapshot_20260711_count integer;
  v_ppk_20260613_count integer;
  v_ppk_20260711_count integer;
  v_binance_quantity numeric;
begin
  select count(*)
  into v_opening_mismatch_count
  from historical_opening_units as expected
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
  join public.instruments as instruments
    on instruments.workspace_id = workspaces.id
    and upper(instruments.ticker) = upper(expected.instrument_ticker)
    and coalesce(upper(instruments.exchange), '') =
        coalesce(upper(expected.instrument_exchange), '')
  left join public.get_portfolio_unit_positions_as_of(
    workspaces.id,
    date '2026-06-13'
  ) as actual
    on actual.account_id = accounts.id
    and actual.instrument_id = instruments.id
  where actual.quantity is null
    or abs(actual.quantity - expected.quantity) > 0.00000001;

  if v_opening_mismatch_count <> 0 then
    raise exception
      'Opening-state validation found % quantity mismatches.',
      v_opening_mismatch_count;
  end if;

  select count(*)
  into v_snapshot_20260613_count
  from public.position_snapshots as snapshots
  join public.workspaces as workspaces
    on workspaces.id = snapshots.workspace_id
  where workspaces.name = 'Kosterna Portfolio'
    and snapshots.snapshot_date = date '2026-06-13';

  select count(*)
  into v_snapshot_20260711_count
  from public.position_snapshots as snapshots
  join public.workspaces as workspaces
    on workspaces.id = snapshots.workspace_id
  where workspaces.name = 'Kosterna Portfolio'
    and snapshots.snapshot_date = date '2026-07-11';

  if v_snapshot_20260613_count <> 51 then
    raise exception
      'Expected 51 position snapshots on 2026-06-13, found %.',
      v_snapshot_20260613_count;
  end if;

  if v_snapshot_20260711_count <> 50 then
    raise exception
      'Expected 50 position snapshots on 2026-07-11, found %.',
      v_snapshot_20260711_count;
  end if;

  select count(*)
  into v_ppk_20260613_count
  from public.get_portfolio_reported_balances_as_of(
    (
      select id
      from public.workspaces
      where name = 'Kosterna Portfolio'
      limit 1
    ),
    date '2026-06-13'
  )
  where snapshot_date = date '2026-06-13';

  select count(*)
  into v_ppk_20260711_count
  from public.get_portfolio_reported_balances_as_of(
    (
      select id
      from public.workspaces
      where name = 'Kosterna Portfolio'
      limit 1
    ),
    date '2026-07-11'
  )
  where snapshot_date = date '2026-07-11';

  if v_ppk_20260613_count <> 2 then
    raise exception
      'Expected two PPK balances on 2026-06-13, found %.',
      v_ppk_20260613_count;
  end if;

  if v_ppk_20260711_count <> 2 then
    raise exception
      'Expected two PPK balances on 2026-07-11, found %.',
      v_ppk_20260711_count;
  end if;

  select unit_positions.quantity
  into v_binance_quantity
  from public.get_portfolio_unit_positions_as_of(
    (
      select id
      from public.workspaces
      where name = 'Kosterna Portfolio'
      limit 1
    ),
    date '2026-06-13'
  ) as unit_positions
  where unit_positions.provider_name = 'Binance'
    and unit_positions.instrument_ticker = 'BTC'
  limit 1;

  if v_binance_quantity is null
     or abs(v_binance_quantity - 0.058) > 0.00000001 then
    raise exception
      'Inactive Binance history is unavailable or incorrect: %.',
      v_binance_quantity;
  end if;
end;
$$;

commit;