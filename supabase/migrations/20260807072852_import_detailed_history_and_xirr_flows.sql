begin;

-- ============================================================
-- DETAILED PORTFOLIO HISTORY IMPORT: 2026-06-14 -> 2026-08-05
--
-- Sources:
--   - user-reconciled transaction history
--   - 2026-06-13 and 2026-07-11 historical checkpoints
--   - current broker/crypto screenshots reconciled on 2026-08-06
--
-- Important corrections encoded here:
--   - 2026-06-14 XTB USD receipt: 101.61 USD (not erroneous 92.23)
--   - exact Binance BTC quantities: 0.00199250 and 0.00207132 BTC
--   - exact Binance -> Bitvavo transfer received: 0.06204635 BTC
--   - Bitvavo exact buys/rebates from activity history
--   - temporary/reversed MAA dividends on 2026-06-30 and 2026-07-13 omitted
--   - temporary/reversed Broadcom dividend on 2026-06-30 omitted
--   - corrected PLN currency for NVDA/TSM/MPWR/ASML retirement-account dividends
--   - corrected Asseco SEE account allocation on 2026-07-20
--   - corrected Elektrotim opening/account split
-- ============================================================

-- ============================================================
-- 1. CORRECT THE ELEKTROTIM ACCOUNT SPLIT IN ALREADY-IMPORTED
--    HISTORICAL OPENING DATA AND SNAPSHOTS.
--
-- Aggregate quantities and aggregate market values were correct:
--   2026-06-13: 125 shares total
--   2026-07-11: 130 shares total
--
-- Correct account split:
--   2026-06-13: Natalia IKE 75, IKZE 50
--   2026-07-11: Natalia IKE 75, IKZE 55
-- ============================================================

update public.portfolio_operation_entries as entries
set
  quantity_delta = case
    when operations.external_reference =
      'legacy-opening-2026-06-13-natalia-xtb-ike-elt'
      then 75::numeric
    when operations.external_reference =
      'legacy-opening-2026-06-13-natalia-xtb-ikze-elt'
      then 50::numeric
    else entries.quantity_delta
  end,
  memo = 'Reconciled opening quantity at the detailed-tracking start date. Corrected Elektrotim account split.',
  updated_at = now()
from public.portfolio_operations as operations
join public.workspaces as workspaces
  on workspaces.id = operations.workspace_id
where entries.operation_id = operations.id
  and entries.workspace_id = operations.workspace_id
  and workspaces.name = 'Kosterna Portfolio'
  and operations.source = 'import'
  and operations.external_reference in (
    'legacy-opening-2026-06-13-natalia-xtb-ike-elt',
    'legacy-opening-2026-06-13-natalia-xtb-ikze-elt'
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
    and instruments.ticker = 'ELT'
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
      then 75::numeric
    when target_rows.snapshot_date = date '2026-06-13'
      and target_rows.account_name = 'IKZE'
      then 50::numeric
    when target_rows.snapshot_date = date '2026-07-11'
      and target_rows.account_name = 'IKE'
      then 75::numeric
    when target_rows.snapshot_date = date '2026-07-11'
      and target_rows.account_name = 'IKZE'
      then 55::numeric
    else snapshots.quantity
  end,
  unit_price = case
    when target_rows.snapshot_date = date '2026-06-13'
      then (6575::numeric / 125::numeric)
    when target_rows.snapshot_date = date '2026-07-11'
      then (7366::numeric / 130::numeric)
    else snapshots.unit_price
  end,
  market_value = case
    when target_rows.snapshot_date = date '2026-06-13'
      and target_rows.account_name = 'IKE'
      then (6575::numeric * 75::numeric / 125::numeric)
    when target_rows.snapshot_date = date '2026-06-13'
      and target_rows.account_name = 'IKZE'
      then (6575::numeric * 50::numeric / 125::numeric)
    when target_rows.snapshot_date = date '2026-07-11'
      and target_rows.account_name = 'IKE'
      then (7366::numeric * 75::numeric / 130::numeric)
    when target_rows.snapshot_date = date '2026-07-11'
      and target_rows.account_name = 'IKZE'
      then (7366::numeric * 55::numeric / 130::numeric)
    else snapshots.market_value
  end,
  market_value_base = case
    when target_rows.snapshot_date = date '2026-06-13'
      and target_rows.account_name = 'IKE'
      then (6575::numeric * 75::numeric / 125::numeric)
    when target_rows.snapshot_date = date '2026-06-13'
      and target_rows.account_name = 'IKZE'
      then (6575::numeric * 50::numeric / 125::numeric)
    when target_rows.snapshot_date = date '2026-07-11'
      and target_rows.account_name = 'IKE'
      then (7366::numeric * 75::numeric / 130::numeric)
    when target_rows.snapshot_date = date '2026-07-11'
      and target_rows.account_name = 'IKZE'
      then (7366::numeric * 55::numeric / 130::numeric)
    else snapshots.market_value_base
  end,
  notes = 'Historical valuation reconstructed from the detailed monthly chart. Elektrotim total was correct; account split was corrected during detailed transaction reconciliation.',
  updated_at = now()
from target_rows
where snapshots.id = target_rows.id;

-- ============================================================
-- 2. IMPORT THE COMPLETE PRE-BASELINE XIRR CONTRIBUTION VECTOR.
--    These are individual external contributions, not cumulative
--    checkpoints. The 27 rows sum exactly to 236,000 PLN.
-- ============================================================

create temporary table historical_legacy_flows (
  flow_date date not null,
  flow_type text not null,
  amount_base numeric(28, 10) not null,
  external_reference text not null
)
on commit drop;

insert into historical_legacy_flows (
  flow_date,
  flow_type,
  amount_base,
  external_reference
)
values
  (date '2024-04-02', 'contribution', 12000, 'legacy-xirr-flow-2024-04-02'),
  (date '2024-05-12', 'contribution', 4000, 'legacy-xirr-flow-2024-05-12'),
  (date '2024-06-12', 'contribution', 3000, 'legacy-xirr-flow-2024-06-12'),
  (date '2024-07-12', 'contribution', 4000, 'legacy-xirr-flow-2024-07-12'),
  (date '2024-08-12', 'contribution', 40000, 'legacy-xirr-flow-2024-08-12'),
  (date '2024-09-12', 'contribution', 8000, 'legacy-xirr-flow-2024-09-12'),
  (date '2024-10-12', 'contribution', 8000, 'legacy-xirr-flow-2024-10-12'),
  (date '2024-11-12', 'contribution', 8000, 'legacy-xirr-flow-2024-11-12'),
  (date '2024-12-12', 'contribution', 8000, 'legacy-xirr-flow-2024-12-12'),
  (date '2025-01-12', 'contribution', 8000, 'legacy-xirr-flow-2025-01-12'),
  (date '2025-02-12', 'contribution', 8000, 'legacy-xirr-flow-2025-02-12'),
  (date '2025-03-12', 'contribution', 8000, 'legacy-xirr-flow-2025-03-12'),
  (date '2025-04-12', 'contribution', 8000, 'legacy-xirr-flow-2025-04-12'),
  (date '2025-05-12', 'contribution', 8000, 'legacy-xirr-flow-2025-05-12'),
  (date '2025-06-12', 'contribution', 8000, 'legacy-xirr-flow-2025-06-12'),
  (date '2025-07-12', 'contribution', 8000, 'legacy-xirr-flow-2025-07-12'),
  (date '2025-08-12', 'contribution', 8000, 'legacy-xirr-flow-2025-08-12'),
  (date '2025-09-12', 'contribution', 8000, 'legacy-xirr-flow-2025-09-12'),
  (date '2025-10-12', 'contribution', 8000, 'legacy-xirr-flow-2025-10-12'),
  (date '2025-12-11', 'contribution', 9000, 'legacy-xirr-flow-2025-12-11'),
  (date '2025-12-29', 'contribution', 7000, 'legacy-xirr-flow-2025-12-29'),
  (date '2026-01-13', 'contribution', 4000, 'legacy-xirr-flow-2026-01-13'),
  (date '2026-02-10', 'contribution', 9000, 'legacy-xirr-flow-2026-02-10'),
  (date '2026-03-10', 'contribution', 8000, 'legacy-xirr-flow-2026-03-10'),
  (date '2026-04-11', 'contribution', 8000, 'legacy-xirr-flow-2026-04-11'),
  (date '2026-05-09', 'contribution', 8000, 'legacy-xirr-flow-2026-05-09'),
  (date '2026-06-13', 'contribution', 8000, 'legacy-xirr-flow-2026-06-13');

insert into public.portfolio_legacy_external_flows (
  workspace_id,
  flow_date,
  flow_type,
  amount_base,
  base_currency,
  external_reference,
  source,
  notes
)
select
  workspaces.id,
  flows.flow_date,
  flows.flow_type,
  flows.amount_base,
  'PLN',
  flows.external_reference,
  'import',
  'Historical owner contribution used for the long-form XIRR vector.'
from historical_legacy_flows as flows
join public.workspaces as workspaces
  on workspaces.name = 'Kosterna Portfolio'
on conflict (
  workspace_id,
  external_reference
)
do update set
  flow_date = excluded.flow_date,
  flow_type = excluded.flow_type,
  amount_base = excluded.amount_base,
  base_currency = excluded.base_currency,
  source = excluded.source,
  notes = excluded.notes,
  updated_at = now();

-- ============================================================
-- 3. STAGE DETAILED OPERATIONS AND ENTRIES.
-- ============================================================

create temporary table historical_operations (
  external_reference text primary key,
  operation_date date not null,
  operation_time time not null,
  operation_type public.portfolio_operation_type not null,
  description text not null,
  notes text
)
on commit drop;

insert into historical_operations (
  external_reference,
  operation_date,
  operation_time,
  operation_type,
  description,
  notes
)
values
  ('legacy-2026-06-14-walutomat-eur-binance', date '2026-06-14', time '13:40', 'deposit', 'External contribution routed via Walutomat and Revolut to Binance', '475 PLN committed on 2026-06-14; 111.71 EUR settled to Binance via Revolut on 2026-06-15 10:15.'),
  ('legacy-2026-06-14-walutomat-usd-xtb', date '2026-06-14', time '17:09', 'deposit', 'External contribution converted via Walutomat to XTB USD', 'Corrected reconciliation: 101.61 USD arrived at XTB. Earlier note stating 92.23 USD was erroneous.'),
  ('legacy-2026-06-15-binance-btc-buy', date '2026-06-15', time '10:16', 'buy', 'Bitcoin purchase on Binance', 'Exact broker quantity 0.00199250 BTC; historical shorthand was approximately 0.002 BTC.'),
  ('legacy-2026-06-15-avgo-buy', date '2026-06-15', time '15:30', 'buy', 'Broadcom purchase', null),
  ('legacy-2026-06-15-jakub-pln-deposit', date '2026-06-15', time '15:32', 'deposit', 'External contribution to Jakub PLN brokerage', null),
  ('legacy-2026-06-15-jakub-ikze-transfer', date '2026-06-15', time '15:32', 'internal_transfer', 'Transfer from Jakub PLN brokerage to IKZE', null),
  ('legacy-2026-06-15-nvda-buy', date '2026-06-15', time '15:33', 'buy', 'NVIDIA purchase in IKZE', null),
  ('legacy-2026-06-16-rbw-sell', date '2026-06-16', time '11:40', 'sell', 'Rainbow Tours sale', null),
  ('legacy-2026-06-16-snt-buy', date '2026-06-16', time '11:41', 'buy', 'Synektik purchase', null),
  ('legacy-2026-06-16-abe-buy', date '2026-06-16', time '11:43', 'buy', 'AB purchase', null),
  ('legacy-2026-06-16-ase-ike-sell', date '2026-06-16', time '11:44', 'sell', 'Asseco SEE sale', null),
  ('legacy-2026-06-16-unt-buy', date '2026-06-16', time '11:45', 'buy', 'Unimot purchase', null),
  ('legacy-2026-06-16-natalia-pln-deposit', date '2026-06-16', time '11:46', 'deposit', 'External contribution to Natalia PLN brokerage', null),
  ('legacy-2026-06-16-natalia-ike-transfer', date '2026-06-16', time '11:47', 'internal_transfer', 'Transfer from Natalia PLN brokerage to IKE', null),
  ('legacy-2026-06-16-cbf-buy', date '2026-06-16', time '11:47', 'buy', 'Cyber_Folks purchase', null),
  ('legacy-2026-06-16-jakub-ike-transfer-35', date '2026-06-16', time '11:49', 'internal_transfer', 'Transfer from Jakub PLN brokerage to IKE', null),
  ('legacy-2026-06-16-jakub-pln-deposit', date '2026-06-16', time '11:50', 'deposit', 'External contribution to Jakub PLN brokerage', null),
  ('legacy-2026-06-16-jakub-ike-transfer-125', date '2026-06-16', time '11:50', 'internal_transfer', 'Transfer from Jakub PLN brokerage to IKE', null),
  ('legacy-2026-06-16-is3n-buy', date '2026-06-16', time '11:51', 'buy', 'iShares Core MSCI EM IMI purchase', null),
  ('legacy-2026-06-17-eqix-dividend', date '2026-06-17', time '11:59', 'dividend', 'Equinix dividend', null),
  ('legacy-2026-06-21-walutomat-eur-binance', date '2026-06-21', time '18:40', 'deposit', 'External contribution routed via Walutomat and Revolut to Binance', '500 PLN committed on 2026-06-21; 117.20 EUR settled to Binance via Revolut on 2026-06-22 10:28.'),
  ('legacy-2026-06-22-binance-btc-buy', date '2026-06-22', time '10:31', 'buy', 'Bitcoin purchase on Binance', 'Exact broker quantity 0.00207132 BTC; historical shorthand was approximately 0.002 BTC.'),
  ('legacy-2026-06-22-jakub-pln-deposit', date '2026-06-22', time '17:06', 'deposit', 'External contribution to Jakub PLN brokerage', null),
  ('legacy-2026-06-22-xtb-pln-usd', date '2026-06-22', time '17:09', 'currency_exchange', 'XTB PLN to USD conversion', null),
  ('legacy-2026-06-22-avgo-buy', date '2026-06-22', time '17:10', 'buy', 'Broadcom purchase', null),
  ('legacy-2026-06-23-natalia-pln-deposit', date '2026-06-23', time '11:58', 'deposit', 'External contribution to Natalia PLN brokerage', null),
  ('legacy-2026-06-23-natalia-ike-transfer', date '2026-06-23', time '11:59', 'internal_transfer', 'Transfer from Natalia PLN brokerage to IKE', null),
  ('legacy-2026-06-23-lpp-buy', date '2026-06-23', time '11:59', 'buy', 'LPP purchase', null),
  ('legacy-2026-06-23-cbf-buy', date '2026-06-23', time '11:59', 'buy', 'Cyber_Folks purchase', null),
  ('legacy-2026-06-24-xtb-ike-dividend', date '2026-06-24', time '07:50', 'dividend', 'XTB dividend in IKE', null),
  ('legacy-2026-06-24-xtb-ikze-dividend', date '2026-06-24', time '07:50', 'dividend', 'XTB dividend in IKZE', null),
  ('legacy-2026-06-24-snt-buy', date '2026-06-24', time '09:21', 'buy', 'Synektik purchase', null),
  ('legacy-2026-06-24-pas-buy', date '2026-06-24', time '09:27', 'buy', 'Passus purchase', null),
  ('legacy-2026-06-24-xnas-buy', date '2026-06-24', time '09:27', 'buy', 'Xtrackers NASDAQ 100 purchase', null),
  ('legacy-2026-06-24-abe-ikze-buy', date '2026-06-24', time '09:31', 'buy', 'AB purchase in IKZE', null),
  ('legacy-2026-06-25-vrt-dividend', date '2026-06-25', time '11:57', 'dividend', 'Vertiv dividend', null),
  ('legacy-2026-06-26-nvda-dividend', date '2026-06-26', time '02:00', 'dividend', 'NVIDIA dividend in IKZE', 'Broker credited and withheld the dividend in PLN.'),
  ('legacy-2026-06-29-nwg-dividend', date '2026-06-29', time '11:59', 'dividend', 'NEWAG dividend in IKZE', 'Dividend for 42 shares.'),
  ('legacy-2026-06-29-jakub-pln-deposit-450', date '2026-06-29', time '15:21', 'deposit', 'External contribution to Jakub PLN brokerage', null),
  ('legacy-2026-06-29-jakub-ike-transfer-450', date '2026-06-29', time '15:22', 'internal_transfer', 'Transfer from Jakub PLN brokerage to IKE', null),
  ('legacy-2026-06-29-xnas-buy', date '2026-06-29', time '15:22', 'buy', 'Xtrackers NASDAQ 100 purchase', null),
  ('legacy-2026-06-29-is3n-buy', date '2026-06-29', time '15:22', 'buy', 'iShares Core MSCI EM IMI purchase', null),
  ('legacy-2026-06-29-jakub-pln-deposit-175', date '2026-06-29', time '15:30', 'deposit', 'External contribution to Jakub PLN brokerage', null),
  ('legacy-2026-06-29-jakub-ikze-transfer-175', date '2026-06-29', time '15:30', 'internal_transfer', 'Transfer from Jakub PLN brokerage to IKZE', null),
  ('legacy-2026-06-29-nvda-buy', date '2026-06-29', time '15:30', 'buy', 'NVIDIA purchase in IKZE', null),
  ('legacy-2026-06-29-jakub-pln-deposit-125', date '2026-06-29', time '15:36', 'deposit', 'External contribution to Jakub PLN brokerage', null),
  ('legacy-2026-06-29-xtb-pln-usd', date '2026-06-29', time '15:36', 'currency_exchange', 'XTB PLN to USD conversion', null),
  ('legacy-2026-06-29-vrt-buy', date '2026-06-29', time '15:37', 'buy', 'Vertiv purchase', null),
  ('legacy-2026-06-29-bitvavo-free-eur-10', date '2026-06-29', time '19:39', 'balance_adjustment', 'Bitvavo non-contribution EUR credit', 'Historical EUR credit used to fund the first Bitvavo purchase. Excluded from owner contributions.'),
  ('legacy-2026-06-29-bitvavo-welcome-bonus', date '2026-06-29', time '19:39', 'other', 'Bitvavo welcome bonus', 'Welcome bonus; excluded from owner contributions.'),
  ('legacy-2026-06-29-bitvavo-free-eur-1', date '2026-06-29', time '22:17', 'balance_adjustment', 'Bitvavo non-contribution EUR credit', 'Historical EUR credit used to fund the first Bitvavo purchase. Excluded from owner contributions.'),
  ('legacy-2026-06-30-rbw-sell', date '2026-06-30', time '11:18', 'sell', 'Rainbow Tours sale', null),
  ('legacy-2026-06-30-snt-buy', date '2026-06-30', time '11:19', 'buy', 'Synektik purchase', null),
  ('legacy-2026-06-30-mbr-buy', date '2026-06-30', time '11:20', 'buy', 'Mo-Bruk purchase', null),
  ('legacy-2026-06-30-abe-buy', date '2026-06-30', time '11:20', 'buy', 'AB purchase', null),
  ('legacy-2026-06-30-pas-buy', date '2026-06-30', time '11:21', 'buy', 'Passus purchase', null),
  ('legacy-2026-06-30-is3n-buy', date '2026-06-30', time '11:22', 'buy', 'iShares Core MSCI EM IMI purchase', null),
  ('legacy-2026-06-30-xnas-buy', date '2026-06-30', time '11:22', 'buy', 'Xtrackers NASDAQ 100 purchase', null),
  ('legacy-2026-06-30-toa-buy', date '2026-06-30', time '11:23', 'buy', 'TOYA purchase', null),
  ('legacy-2026-06-30-ase-ike-dividend', date '2026-06-30', time '11:59', 'dividend', 'Asseco SEE dividend in IKE', 'Dividend on 35 shares after the 2026-06-16 sale.'),
  ('legacy-2026-06-30-ase-ikze-dividend', date '2026-06-30', time '11:59', 'dividend', 'Asseco SEE dividend in IKZE', 'Dividend on 35 shares.'),
  ('legacy-2026-06-30-elt-buy', date '2026-06-30', time '12:59', 'buy', 'Elektrotim purchase', null),
  ('legacy-2026-06-30-natalia-pln-deposit', date '2026-06-30', time '13:01', 'deposit', 'External contribution to Natalia PLN brokerage', null),
  ('legacy-2026-06-30-natalia-ike-transfer', date '2026-06-30', time '13:01', 'internal_transfer', 'Transfer from Natalia PLN brokerage to IKE', null),
  ('legacy-2026-06-30-kty-buy', date '2026-06-30', time '13:01', 'buy', 'Grupa Kęty purchase', null),
  ('legacy-2026-06-30-unt-buy', date '2026-06-30', time '13:02', 'buy', 'Unimot purchase', null),
  ('legacy-2026-06-30-lpp-buy', date '2026-06-30', time '13:02', 'buy', 'LPP purchase', null),
  ('legacy-2026-06-30-is3r-sell', date '2026-06-30', time '13:03', 'sell', 'iShares World Momentum partial sale', null),
  ('legacy-2026-06-30-mpwr-buy', date '2026-06-30', time '15:30', 'buy', 'Monolithic Power Systems purchase', null),
  ('legacy-2026-06-30-binance-bitvavo-btc-transfer', date '2026-06-30', time '14:48', 'quantity_adjustment', 'Transfer Bitcoin from Binance to Bitvavo', 'Exact received amount on Bitvavo was 0.06204635 BTC. Binance pre-transfer quantity was 0.06206382 BTC; the 0.00001747 BTC difference is treated as transfer/network cost.'),
  ('legacy-2026-07-01-bitvavo-btc-buy', date '2026-07-01', time '11:20', 'buy', 'Bitcoin purchase on Bitvavo', 'Exact Bitvavo quantity and cost from activity history.'),
  ('legacy-2026-07-01-bitvavo-fee-rebate', date '2026-07-01', time '11:20', 'other', 'Bitvavo fee rebate', 'Fee rebate credited after BTC purchase; excluded from owner contributions.'),
  ('legacy-2026-07-02-pas-dividend', date '2026-07-02', time '11:54', 'dividend', 'Passus dividend in IKE', null),
  ('legacy-2026-07-03-cbf-ike-dividend', date '2026-07-03', time '11:58', 'dividend', 'Cyber_Folks dividend in IKE', 'Dividend from 33 shares.'),
  ('legacy-2026-07-03-cbf-ikze-dividend', date '2026-07-03', time '11:58', 'dividend', 'Cyber_Folks dividend in IKZE', 'Dividend from 20 shares.'),
  ('legacy-2026-07-03-bitvavo-eur-deposit', date '2026-07-03', time '15:44', 'deposit', 'External contribution routed through Revolut to Bitvavo', '600 PLN funded Revolut at 15:43; 139.14 EUR reached Bitvavo at 15:44.'),
  ('legacy-2026-07-03-bitvavo-btc-buy', date '2026-07-03', time '15:45', 'buy', 'Bitcoin purchase on Bitvavo', 'Exact Bitvavo quantity 0.00254822 BTC; historical shorthand was approximately 0.0026 BTC.'),
  ('legacy-2026-07-03-bitvavo-fee-rebate', date '2026-07-03', time '15:45', 'other', 'Bitvavo fee rebate', 'Fee rebate credited after BTC purchase; excluded from owner contributions.'),
  ('legacy-2026-07-06-jakub-pln-deposit-800', date '2026-07-06', time '12:59', 'deposit', 'External contribution to Jakub PLN brokerage', null),
  ('legacy-2026-07-06-jakub-ike-transfer-800', date '2026-07-06', time '12:59', 'internal_transfer', 'Transfer from Jakub PLN brokerage to IKE', null),
  ('legacy-2026-07-06-snt-buy', date '2026-07-06', time '13:00', 'buy', 'Synektik purchase', null),
  ('legacy-2026-07-06-mbr-buy', date '2026-07-06', time '13:00', 'buy', 'Mo-Bruk purchase', null),
  ('legacy-2026-07-06-jakub-pln-deposit-40', date '2026-07-06', time '13:02', 'deposit', 'External contribution to Jakub PLN brokerage', null),
  ('legacy-2026-07-06-jakub-ike-transfer-40', date '2026-07-06', time '13:02', 'internal_transfer', 'Transfer from Jakub PLN brokerage to IKE', null),
  ('legacy-2026-07-06-is3n-buy', date '2026-07-06', time '13:02', 'buy', 'iShares Core MSCI EM IMI purchase', null),
  ('legacy-2026-07-06-wpl-ike-sell', date '2026-07-06', time '13:04', 'sell', 'WP Holding partial sale', null),
  ('legacy-2026-07-06-bdx-buy', date '2026-07-06', time '13:05', 'buy', 'Budimex purchase', null),
  ('legacy-2026-07-06-ase-ike-sell', date '2026-07-06', time '13:06', 'sell', 'Asseco SEE sale', null),
  ('legacy-2026-07-06-is3r-buy', date '2026-07-06', time '13:09', 'buy', 'iShares World Momentum purchase', null),
  ('legacy-2026-07-06-lpp-buy', date '2026-07-06', time '13:10', 'buy', 'LPP purchase', null),
  ('legacy-2026-07-06-kty-buy', date '2026-07-06', time '13:11', 'buy', 'Grupa Kęty purchase', null),
  ('legacy-2026-07-06-natalia-pln-deposit', date '2026-07-06', time '13:14', 'deposit', 'External contribution to Natalia PLN brokerage', null),
  ('legacy-2026-07-06-natalia-ike-transfer', date '2026-07-06', time '13:14', 'internal_transfer', 'Transfer from Natalia PLN brokerage to IKE', null),
  ('legacy-2026-07-06-elt-buy', date '2026-07-06', time '13:14', 'buy', 'Elektrotim purchase', null),
  ('legacy-2026-07-06-walutomat-usd-xtb', date '2026-07-06', time '16:15', 'deposit', 'External contribution converted via Walutomat to XTB USD', '520 PLN sent to Walutomat at 13:40. 140.16 USD arrived at XTB at 16:15; 0.29 USD Walutomat commission is treated as embedded in the conversion.'),
  ('legacy-2026-07-06-avgo-dividend', date '2026-07-06', time '15:40', 'dividend', 'Broadcom dividend', null),
  ('legacy-2026-07-06-sndk-buy', date '2026-07-06', time '16:16', 'buy', 'SanDisk purchase', null),
  ('legacy-2026-07-06-mu-buy', date '2026-07-06', time '21:28', 'buy', 'Micron purchase', null),
  ('legacy-2026-07-09-tsm-dividend', date '2026-07-09', time '11:58', 'dividend', 'TSMC dividend in IKZE', 'Broker credited 4.40 PLN gross and withheld 0.92 PLN tax.'),
  ('legacy-2026-07-10-unt-dividend', date '2026-07-10', time '15:33', 'dividend', 'Unimot dividend in IKE', 'Dividend from 33 shares.'),
  ('legacy-2026-07-15-ctre-dividend', date '2026-07-15', time '11:55', 'dividend', 'CareTrust REIT dividend', null),
  ('legacy-2026-07-15-mpwr-dividend', date '2026-07-15', time '11:59', 'dividend', 'Monolithic Power Systems dividend in IKE', 'Broker credited and withheld the dividend in PLN.'),
  ('legacy-2026-07-15-lpp-buy', date '2026-07-15', time '16:37', 'buy', 'LPP purchase', null),
  ('legacy-2026-07-15-ase-ikze-sell', date '2026-07-15', time '16:39', 'sell', 'Asseco SEE sale in IKZE', null),
  ('legacy-2026-07-15-natalia-pln-deposit-75', date '2026-07-15', time '16:41', 'deposit', 'External contribution to Natalia PLN brokerage', null),
  ('legacy-2026-07-15-natalia-ikze-transfer-75', date '2026-07-15', time '16:42', 'internal_transfer', 'Transfer from Natalia PLN brokerage to IKZE', null),
  ('legacy-2026-07-15-cbf-buy', date '2026-07-15', time '16:42', 'buy', 'Cyber_Folks purchase', null),
  ('legacy-2026-07-15-jakub-pln-deposit-175', date '2026-07-15', time '17:13', 'deposit', 'External contribution to Jakub PLN brokerage', null),
  ('legacy-2026-07-15-jakub-ikze-transfer-192', date '2026-07-15', time '17:14', 'internal_transfer', 'Transfer from Jakub PLN brokerage to IKZE', null),
  ('legacy-2026-07-15-nvda-buy', date '2026-07-15', time '17:14', 'buy', 'NVIDIA purchase in IKZE', null),
  ('legacy-2026-07-15-natalia-pln-deposit-100', date '2026-07-15', time '17:16', 'deposit', 'External contribution to Natalia PLN brokerage', null),
  ('legacy-2026-07-15-natalia-ike-transfer-100', date '2026-07-15', time '17:17', 'internal_transfer', 'Transfer from Natalia PLN brokerage to IKE', null),
  ('legacy-2026-07-15-mpwr-buy', date '2026-07-15', time '17:17', 'buy', 'Monolithic Power Systems purchase', null),
  ('legacy-2026-07-15-jakub-pln-deposit-1400', date '2026-07-15', time '17:25', 'deposit', 'External contribution to Jakub PLN brokerage', null),
  ('legacy-2026-07-15-xtb-pln-usd', date '2026-07-15', time '17:26', 'currency_exchange', 'XTB PLN to USD conversion', null),
  ('legacy-2026-07-15-avgo-buy', date '2026-07-15', time '17:27', 'buy', 'Broadcom purchase', null),
  ('legacy-2026-07-15-mu-buy', date '2026-07-15', time '17:29', 'buy', 'Micron purchase', null),
  ('legacy-2026-07-15-sndk-buy', date '2026-07-15', time '17:30', 'buy', 'SanDisk purchase', null),
  ('legacy-2026-07-15-bitvavo-eur-deposit', date '2026-07-15', time '17:31', 'deposit', 'External contribution routed through Revolut to Bitvavo', '250 PLN converted to 57.49 EUR and deposited to Bitvavo.'),
  ('legacy-2026-07-15-bitvavo-btc-buy', date '2026-07-15', time '17:33', 'buy', 'Bitcoin purchase on Bitvavo', 'Exact cost corrected from Bitvavo activity history: 57.37 EUR.'),
  ('legacy-2026-07-17-cpt-dividend', date '2026-07-17', time '11:59', 'dividend', 'Camden Property Trust dividend', null),
  ('legacy-2026-07-20-jakub-pln-deposit-370', date '2026-07-20', time '10:04', 'deposit', 'External contribution to Jakub PLN brokerage', null),
  ('legacy-2026-07-20-jakub-ike-transfer-39602', date '2026-07-20', time '10:05', 'internal_transfer', 'Transfer from Jakub PLN brokerage to IKE', null),
  ('legacy-2026-07-20-is3n-buy', date '2026-07-20', time '10:05', 'buy', 'iShares Core MSCI EM IMI purchase', null),
  ('legacy-2026-07-20-wpl-ike-dividend', date '2026-07-20', time '11:59', 'dividend', 'WP Holding dividend in IKE', 'Dividend from 32 shares.'),
  ('legacy-2026-07-20-wpl-ikze-dividend', date '2026-07-20', time '11:59', 'dividend', 'WP Holding dividend in IKZE', 'Dividend from 32 shares.'),
  ('legacy-2026-07-20-wpl-ike-sell', date '2026-07-20', time '12:51', 'sell', 'WP Holding final IKE sale', null),
  ('legacy-2026-07-20-lpp-buy', date '2026-07-20', time '12:52', 'buy', 'LPP purchase', null),
  ('legacy-2026-07-20-kty-buy', date '2026-07-20', time '12:53', 'buy', 'Grupa Kęty purchase', null),
  ('legacy-2026-07-20-unt-buy', date '2026-07-20', time '12:54', 'buy', 'Unimot purchase', null),
  ('legacy-2026-07-20-cbf-buy-3', date '2026-07-20', time '12:56', 'buy', 'Cyber_Folks purchase', null),
  ('legacy-2026-07-20-ase-ikze-sell-1302', date '2026-07-20', time '13:02', 'sell', 'Asseco SEE sale in IKZE', null),
  ('legacy-2026-07-20-elt-buy', date '2026-07-20', time '13:04', 'buy', 'Elektrotim purchase', null),
  ('legacy-2026-07-20-cbf-buy-2', date '2026-07-20', time '13:05', 'buy', 'Cyber_Folks purchase', null),
  ('legacy-2026-07-20-ase-ikze-sell-1312', date '2026-07-20', time '13:12', 'sell', 'Asseco SEE sale in IKZE', null),
  ('legacy-2026-07-20-natalia-pln-deposit-530', date '2026-07-20', time '13:14', 'deposit', 'External contribution to Natalia PLN brokerage', null),
  ('legacy-2026-07-20-natalia-ikze-transfer-530', date '2026-07-20', time '13:14', 'internal_transfer', 'Transfer from Natalia PLN brokerage to IKZE', null),
  ('legacy-2026-07-20-is3r-ikze-buy', date '2026-07-20', time '13:15', 'buy', 'iShares World Momentum purchase in IKZE', null),
  ('legacy-2026-07-20-jakub-pln-deposit-350', date '2026-07-20', time '13:21', 'deposit', 'External contribution to Jakub PLN brokerage', null),
  ('legacy-2026-07-20-jakub-ike-transfer-350', date '2026-07-20', time '13:21', 'internal_transfer', 'Transfer from Jakub PLN brokerage to IKE', null),
  ('legacy-2026-07-20-abe-ike-buy', date '2026-07-20', time '13:22', 'buy', 'AB purchase in IKE', null),
  ('legacy-2026-07-20-pas-buy', date '2026-07-20', time '13:22', 'buy', 'Passus purchase', null),
  ('legacy-2026-07-20-ase-ikze-sell-1441', date '2026-07-20', time '14:41', 'sell', 'Asseco SEE sale in IKZE', null),
  ('legacy-2026-07-20-nwg-buy', date '2026-07-20', time '14:42', 'buy', 'NEWAG purchase', null),
  ('legacy-2026-07-20-jakub-pln-deposit-375-ikze', date '2026-07-20', time '16:14', 'deposit', 'External contribution to Jakub PLN brokerage', null),
  ('legacy-2026-07-20-jakub-ikze-transfer-375', date '2026-07-20', time '16:14', 'internal_transfer', 'Transfer from Jakub PLN brokerage to IKZE', null),
  ('legacy-2026-07-20-tsm-buy', date '2026-07-20', time '16:15', 'buy', 'TSMC purchase in IKZE', null),
  ('legacy-2026-07-20-jakub-pln-deposit-375-usd', date '2026-07-20', time '16:25', 'deposit', 'External contribution to Jakub PLN brokerage', null),
  ('legacy-2026-07-20-xtb-pln-usd', date '2026-07-20', time '16:25', 'currency_exchange', 'XTB PLN to USD conversion', null),
  ('legacy-2026-07-20-sndk-buy', date '2026-07-20', time '16:25', 'buy', 'SanDisk purchase', null),
  ('legacy-2026-07-20-mu-buy', date '2026-07-20', time '16:28', 'buy', 'Micron purchase', null),
  ('legacy-2026-07-21-mu-dividend', date '2026-07-21', time '11:59', 'dividend', 'Micron dividend', null),
  ('legacy-2026-07-24-elt-ike-dividend', date '2026-07-24', time '11:59', 'dividend', 'Elektrotim dividend in IKE', 'Dividend from 75 shares.'),
  ('legacy-2026-07-24-elt-ikze-dividend', date '2026-07-24', time '11:59', 'dividend', 'Elektrotim dividend in IKZE', 'Dividend from 50 shares.'),
  ('legacy-2026-07-27-jakub-pln-deposit-600', date '2026-07-27', time '11:21', 'deposit', 'External contribution to Jakub PLN brokerage', null),
  ('legacy-2026-07-27-jakub-ikze-transfer-130', date '2026-07-27', time '11:22', 'internal_transfer', 'Transfer from Jakub PLN brokerage to IKZE', null),
  ('legacy-2026-07-27-abe-ikze-buy', date '2026-07-27', time '11:22', 'buy', 'AB purchase in IKZE', null),
  ('legacy-2026-07-27-jakub-ike-transfer-470', date '2026-07-27', time '11:23', 'internal_transfer', 'Transfer from Jakub PLN brokerage to IKE', null),
  ('legacy-2026-07-27-snt-buy', date '2026-07-27', time '11:23', 'buy', 'Synektik purchase', null),
  ('legacy-2026-07-27-pas-buy', date '2026-07-27', time '11:24', 'buy', 'Passus purchase', null),
  ('legacy-2026-07-27-natalia-pln-deposit-400', date '2026-07-27', time '11:30', 'deposit', 'External contribution to Natalia PLN brokerage', null),
  ('legacy-2026-07-27-natalia-ikze-transfer-400', date '2026-07-27', time '11:31', 'internal_transfer', 'Transfer from Natalia PLN brokerage to IKZE', null),
  ('legacy-2026-07-27-cbf-ikze-buy-1', date '2026-07-27', time '11:31', 'buy', 'Cyber_Folks purchase in IKZE', null),
  ('legacy-2026-07-27-wpl-ikze-sell', date '2026-07-27', time '11:33', 'sell', 'WP Holding final IKZE sale', null),
  ('legacy-2026-07-27-is3r-ikze-buy', date '2026-07-27', time '11:34', 'buy', 'iShares World Momentum purchase in IKZE', null),
  ('legacy-2026-07-27-ase-ikze-sell-5', date '2026-07-27', time '11:35', 'sell', 'Asseco SEE sale in IKZE', null),
  ('legacy-2026-07-27-ase-ike-sell-20', date '2026-07-27', time '11:36', 'sell', 'Asseco SEE final IKE sale', null),
  ('legacy-2026-07-27-bft-buy', date '2026-07-27', time '11:38', 'buy', 'Benefit Systems purchase', null),
  ('legacy-2026-07-27-cbf-ikze-buy-3', date '2026-07-27', time '11:41', 'buy', 'Cyber_Folks purchase in IKZE', null),
  ('legacy-2026-07-27-bitvavo-eur-deposit-1208', date '2026-07-27', time '12:08', 'deposit', 'External contribution routed through Revolut to Bitvavo', '250 PLN converted to 57.57 EUR and deposited to Bitvavo.'),
  ('legacy-2026-07-27-bitvavo-btc-buy-1209', date '2026-07-27', time '12:09', 'buy', 'Bitcoin purchase on Bitvavo', 'Exact cost corrected from Bitvavo activity history: 57.37 EUR.'),
  ('legacy-2026-07-27-jakub-pln-deposit-250', date '2026-07-27', time '16:28', 'deposit', 'External contribution to Jakub PLN brokerage', null),
  ('legacy-2026-07-27-xtb-pln-usd', date '2026-07-27', time '16:28', 'currency_exchange', 'XTB PLN to USD conversion', null),
  ('legacy-2026-07-27-sndk-buy', date '2026-07-27', time '16:29', 'buy', 'SanDisk purchase', null),
  ('legacy-2026-07-27-tsm-natalia-buy', date '2026-07-27', time '16:32', 'buy', 'TSMC purchase in Natalia IKE', null),
  ('legacy-2026-07-27-asml-buy-005', date '2026-07-27', time '16:33', 'buy', 'ASML purchase in Natalia IKE', null),
  ('legacy-2026-07-27-mu-natalia-buy', date '2026-07-27', time '17:30', 'buy', 'Micron purchase in Natalia IKE', null),
  ('legacy-2026-07-27-natalia-pln-deposit-250', date '2026-07-27', time '17:31', 'deposit', 'External contribution to Natalia PLN brokerage', null),
  ('legacy-2026-07-27-natalia-ike-transfer-250', date '2026-07-27', time '17:32', 'internal_transfer', 'Transfer from Natalia PLN brokerage to IKE', null),
  ('legacy-2026-07-27-asml-buy-0075', date '2026-07-27', time '17:32', 'buy', 'ASML purchase in Natalia IKE', null),
  ('legacy-2026-07-27-bitvavo-eur-deposit-1737', date '2026-07-27', time '17:37', 'deposit', 'External contribution routed through Revolut to Bitvavo', '250 PLN converted to 57.49 EUR and deposited to Bitvavo.'),
  ('legacy-2026-07-27-bitvavo-btc-buy-1738', date '2026-07-27', time '17:38', 'buy', 'Bitcoin purchase on Bitvavo', 'Exact cost from Bitvavo activity history: 57.22 EUR.'),
  ('legacy-2026-07-31-maa-dividend', date '2026-07-31', time '11:59', 'dividend', 'Mid-America Apartment Communities dividend', 'Dividend on 5 shares.'),
  ('legacy-2026-08-03-kru-sell', date '2026-08-03', time '11:18', 'sell', 'Kruk partial sale', null),
  ('legacy-2026-08-03-unt-buy', date '2026-08-03', time '11:19', 'buy', 'Unimot purchase', null),
  ('legacy-2026-08-03-kty-buy', date '2026-08-03', time '11:19', 'buy', 'Grupa Kęty purchase', null),
  ('legacy-2026-08-03-is3r-ike-buy', date '2026-08-03', time '11:19', 'buy', 'iShares World Momentum purchase', null),
  ('legacy-2026-08-03-jakub-pln-deposit-1000', date '2026-08-03', time '12:23', 'deposit', 'External contribution to Jakub PLN brokerage', null),
  ('legacy-2026-08-03-jakub-ikze-transfer-272', date '2026-08-03', time '12:24', 'internal_transfer', 'Transfer from Jakub PLN brokerage to IKZE', null),
  ('legacy-2026-08-03-abe-ikze-buy', date '2026-08-03', time '12:24', 'buy', 'AB purchase in IKZE', null),
  ('legacy-2026-08-03-jakub-ike-transfer-728', date '2026-08-03', time '12:26', 'internal_transfer', 'Transfer from Jakub PLN brokerage to IKE', null),
  ('legacy-2026-08-03-snt-buy', date '2026-08-03', time '12:26', 'buy', 'Synektik purchase', null),
  ('legacy-2026-08-03-xnas-buy', date '2026-08-03', time '12:27', 'buy', 'Xtrackers NASDAQ 100 purchase', null),
  ('legacy-2026-08-03-pas-buy', date '2026-08-03', time '12:32', 'buy', 'Passus purchase', null),
  ('legacy-2026-08-03-natalia-pln-deposit-500', date '2026-08-03', time '16:14', 'deposit', 'External contribution to Natalia PLN brokerage', null),
  ('legacy-2026-08-03-natalia-ike-transfer-500', date '2026-08-03', time '16:14', 'internal_transfer', 'Transfer from Natalia PLN brokerage to IKE', null),
  ('legacy-2026-08-03-jakub-pln-deposit-500', date '2026-08-03', time '16:23', 'deposit', 'External contribution to Jakub PLN brokerage', null),
  ('legacy-2026-08-03-xtb-pln-usd', date '2026-08-03', time '16:23', 'currency_exchange', 'XTB PLN to USD conversion', null),
  ('legacy-2026-08-03-cpt-sell', date '2026-08-03', time '16:34', 'sell', 'Camden Property Trust final sale', null),
  ('legacy-2026-08-03-mu-natalia-buy', date '2026-08-03', time '16:35', 'buy', 'Micron purchase in Natalia IKE', null),
  ('legacy-2026-08-03-maa-buy', date '2026-08-03', time '16:38', 'buy', 'MAA purchase funded by Camden sale', null),
  ('legacy-2026-08-03-ctre-buy', date '2026-08-03', time '16:39', 'buy', 'CareTrust REIT purchase funded by Camden sale', null),
  ('legacy-2026-08-03-avgo-buy', date '2026-08-03', time '16:40', 'buy', 'Broadcom purchase', null),
  ('legacy-2026-08-03-sndk-buy', date '2026-08-03', time '16:40', 'buy', 'SanDisk purchase', null),
  ('legacy-2026-08-05-asml-jakub-dividend', date '2026-08-05', time '11:59', 'dividend', 'ASML dividend', null),
  ('legacy-2026-08-05-asml-natalia-dividend', date '2026-08-05', time '11:59', 'dividend', 'ASML dividend in Natalia IKE', 'Broker credited 1.00 PLN gross and withheld 0.15 PLN tax.');

create temporary table historical_entries (
  external_reference text not null,
  sequence_no smallint not null,
  owner_name text not null,
  provider_name text not null,
  account_name text not null,
  instrument_ticker text,
  instrument_exchange text,
  component public.portfolio_operation_component not null,
  quantity_delta numeric(28, 10) not null,
  cash_delta numeric(28, 10) not null,
  value_delta numeric(28, 10) not null,
  currency char(3) not null,
  unit_price numeric(28, 10),
  base_cash_delta numeric(28, 10),
  base_value_delta numeric(28, 10),
  memo text,
  primary key (
    external_reference,
    sequence_no
  )
)
on commit drop;

insert into historical_entries (
  external_reference,
  sequence_no,
  owner_name,
  provider_name,
  account_name,
  instrument_ticker,
  instrument_exchange,
  component,
  quantity_delta,
  cash_delta,
  value_delta,
  currency,
  unit_price,
  base_cash_delta,
  base_value_delta,
  memo
)
values
  ('legacy-2026-06-14-walutomat-eur-binance', 1, 'Jakub', 'Binance', 'Crypto', null, null, 'transfer', 0, 111.71, 0, 'EUR', null, 475, null, 'External owner contribution.'),
  ('legacy-2026-06-14-walutomat-usd-xtb', 1, 'Jakub', 'XTB', 'USD brokerage', null, null, 'transfer', 0, 101.61, 0, 'USD', null, 375, null, 'External owner contribution.'),
  ('legacy-2026-06-15-binance-btc-buy', 1, 'Jakub', 'Binance', 'Crypto', 'BTC', null, 'principal', 0.0019925, -113.01, 113.01, 'EUR', 56717.69134253450439146800502, null, null, null),
  ('legacy-2026-06-15-avgo-buy', 1, 'Jakub', 'XTB', 'USD brokerage', 'AVGO', 'NASDAQ', 'principal', 0.25, -98.94, 98.94, 'USD', 395.76, null, null, null),
  ('legacy-2026-06-15-jakub-pln-deposit', 1, 'Jakub', 'XTB', 'PLN brokerage', null, null, 'transfer', 0, 400, 0, 'PLN', null, 400, null, 'External owner contribution.'),
  ('legacy-2026-06-15-jakub-ikze-transfer', 1, 'Jakub', 'XTB', 'PLN brokerage', null, null, 'transfer', 0, -385, 0, 'PLN', null, -385, null, null),
  ('legacy-2026-06-15-jakub-ikze-transfer', 2, 'Jakub', 'XTB', 'IKZE', null, null, 'transfer', 0, 385, 0, 'PLN', null, 385, null, null),
  ('legacy-2026-06-15-nvda-buy', 1, 'Jakub', 'XTB', 'IKZE', 'NVDA', 'NASDAQ', 'principal', 0.5, -386.87, 386.87, 'PLN', 773.74, -386.87, 386.87, null),
  ('legacy-2026-06-16-rbw-sell', 1, 'Jakub', 'XTB', 'IKE', 'RBW', 'GPW', 'principal', -5, 754, -754, 'PLN', 150.8, 754, -754, null),
  ('legacy-2026-06-16-snt-buy', 1, 'Jakub', 'XTB', 'IKE', 'SNT', 'GPW', 'principal', 1, -309.8, 309.8, 'PLN', 309.8, -309.8, 309.8, null),
  ('legacy-2026-06-16-abe-buy', 1, 'Jakub', 'XTB', 'IKE', 'ABE', 'GPW', 'principal', 3, -403.8, 403.8, 'PLN', 134.6, -403.8, 403.8, null),
  ('legacy-2026-06-16-ase-ike-sell', 1, 'Natalia', 'XTB', 'IKE', 'ASE', 'GPW', 'principal', -5, 307.5, -307.5, 'PLN', 61.5, 307.5, -307.5, null),
  ('legacy-2026-06-16-unt-buy', 1, 'Natalia', 'XTB', 'IKE', 'UNT', 'GPW', 'principal', 2, -309.6, 309.6, 'PLN', 154.8, -309.6, 309.6, null),
  ('legacy-2026-06-16-natalia-pln-deposit', 1, 'Natalia', 'XTB', 'PLN brokerage', null, null, 'transfer', 0, 375, 0, 'PLN', null, 375, null, 'External owner contribution.'),
  ('legacy-2026-06-16-natalia-ike-transfer', 1, 'Natalia', 'XTB', 'PLN brokerage', null, null, 'transfer', 0, -375, 0, 'PLN', null, -375, null, null),
  ('legacy-2026-06-16-natalia-ike-transfer', 2, 'Natalia', 'XTB', 'IKE', null, null, 'transfer', 0, 375, 0, 'PLN', null, 375, null, null),
  ('legacy-2026-06-16-cbf-buy', 1, 'Natalia', 'XTB', 'IKE', 'CBF', 'GPW', 'principal', 2, -378.6, 378.6, 'PLN', 189.3, -378.6, 378.6, null),
  ('legacy-2026-06-16-jakub-ike-transfer-35', 1, 'Jakub', 'XTB', 'PLN brokerage', null, null, 'transfer', 0, -35, 0, 'PLN', null, -35, null, null),
  ('legacy-2026-06-16-jakub-ike-transfer-35', 2, 'Jakub', 'XTB', 'IKE', null, null, 'transfer', 0, 35, 0, 'PLN', null, 35, null, null),
  ('legacy-2026-06-16-jakub-pln-deposit', 1, 'Jakub', 'XTB', 'PLN brokerage', null, null, 'transfer', 0, 125, 0, 'PLN', null, 125, null, 'External owner contribution.'),
  ('legacy-2026-06-16-jakub-ike-transfer-125', 1, 'Jakub', 'XTB', 'PLN brokerage', null, null, 'transfer', 0, -125, 0, 'PLN', null, -125, null, null),
  ('legacy-2026-06-16-jakub-ike-transfer-125', 2, 'Jakub', 'XTB', 'IKE', null, null, 'transfer', 0, 125, 0, 'PLN', null, 125, null, null),
  ('legacy-2026-06-16-is3n-buy', 1, 'Jakub', 'XTB', 'IKE', 'IS3N.DE', 'XETRA', 'principal', 1, -209.27, 209.27, 'PLN', 209.27, -209.27, 209.27, null),
  ('legacy-2026-06-17-eqix-dividend', 1, 'Jakub', 'XTB', 'USD brokerage', 'EQIX', 'NASDAQ', 'income', 0, 5.16, 0, 'USD', null, null, null, 'Gross dividend.'),
  ('legacy-2026-06-17-eqix-dividend', 2, 'Jakub', 'XTB', 'USD brokerage', 'EQIX', 'NASDAQ', 'tax', 0, -0.77, 0, 'USD', null, null, null, 'Withholding tax.'),
  ('legacy-2026-06-21-walutomat-eur-binance', 1, 'Jakub', 'Binance', 'Crypto', null, null, 'transfer', 0, 117.2, 0, 'EUR', null, 500, null, 'External owner contribution.'),
  ('legacy-2026-06-22-binance-btc-buy', 1, 'Jakub', 'Binance', 'Crypto', 'BTC', null, 'principal', 0.00207132, -116.2, 116.2, 'EUR', 56099.49211131066180020470038, null, null, null),
  ('legacy-2026-06-22-jakub-pln-deposit', 1, 'Jakub', 'XTB', 'PLN brokerage', null, null, 'transfer', 0, 350, 0, 'PLN', null, 350, null, 'External owner contribution.'),
  ('legacy-2026-06-22-xtb-pln-usd', 1, 'Jakub', 'XTB', 'PLN brokerage', null, null, 'transfer', 0, -350, 0, 'PLN', null, -350, null, null),
  ('legacy-2026-06-22-xtb-pln-usd', 2, 'Jakub', 'XTB', 'USD brokerage', null, null, 'transfer', 0, 93.24, 0, 'USD', null, 350, null, null),
  ('legacy-2026-06-22-avgo-buy', 1, 'Jakub', 'XTB', 'USD brokerage', 'AVGO', 'NASDAQ', 'principal', 0.25, -98.75, 98.75, 'USD', 395, null, null, null),
  ('legacy-2026-06-23-natalia-pln-deposit', 1, 'Natalia', 'XTB', 'PLN brokerage', null, null, 'transfer', 0, 650, 0, 'PLN', null, 650, null, 'External owner contribution.'),
  ('legacy-2026-06-23-natalia-ike-transfer', 1, 'Natalia', 'XTB', 'PLN brokerage', null, null, 'transfer', 0, -650, 0, 'PLN', null, -650, null, null),
  ('legacy-2026-06-23-natalia-ike-transfer', 2, 'Natalia', 'XTB', 'IKE', null, null, 'transfer', 0, 650, 0, 'PLN', null, 650, null, null),
  ('legacy-2026-06-23-lpp-buy', 1, 'Natalia', 'XTB', 'IKE', 'LPP', 'GPW', 'principal', 0.025, -461.25, 461.25, 'PLN', 18450, -461.25, 461.25, null),
  ('legacy-2026-06-23-cbf-buy', 1, 'Natalia', 'XTB', 'IKE', 'CBF', 'GPW', 'principal', 1, -187.8, 187.8, 'PLN', 187.8, -187.8, 187.8, null),
  ('legacy-2026-06-24-xtb-ike-dividend', 1, 'Jakub', 'XTB', 'IKE', 'XTB', 'GPW', 'income', 0, 1424.5, 0, 'PLN', null, 1424.5, 0, 'Gross dividend.'),
  ('legacy-2026-06-24-xtb-ikze-dividend', 1, 'Jakub', 'XTB', 'IKZE', 'XTB', 'GPW', 'income', 0, 203.5, 0, 'PLN', null, 203.5, 0, 'Gross dividend.'),
  ('legacy-2026-06-24-snt-buy', 1, 'Jakub', 'XTB', 'IKE', 'SNT', 'GPW', 'principal', 3, -929.6, 929.6, 'PLN', 309.8666666666666666666666667, -929.6, 929.6, null),
  ('legacy-2026-06-24-pas-buy', 1, 'Jakub', 'XTB', 'IKE', 'PAS', 'GPW', 'principal', 2, -235.6, 235.6, 'PLN', 117.8, -235.6, 235.6, null),
  ('legacy-2026-06-24-xnas-buy', 1, 'Jakub', 'XTB', 'IKE', 'XNAS.DE', 'XETRA', 'principal', 1, -259.55, 259.55, 'PLN', 259.55, -259.55, 259.55, null),
  ('legacy-2026-06-24-abe-ikze-buy', 1, 'Jakub', 'XTB', 'IKZE', 'ABE', 'GPW', 'principal', 2, -266.4, 266.4, 'PLN', 133.2, -266.4, 266.4, null),
  ('legacy-2026-06-25-vrt-dividend', 1, 'Jakub', 'XTB', 'USD brokerage', 'VRT', 'NYSE', 'income', 0, 0.09, 0, 'USD', null, null, null, 'Gross dividend.'),
  ('legacy-2026-06-25-vrt-dividend', 2, 'Jakub', 'XTB', 'USD brokerage', 'VRT', 'NYSE', 'tax', 0, -0.01, 0, 'USD', null, null, null, 'Withholding tax.'),
  ('legacy-2026-06-26-nvda-dividend', 1, 'Jakub', 'XTB', 'IKZE', 'NVDA', 'NASDAQ', 'income', 0, 2.35, 0, 'PLN', null, 2.35, 0, 'Gross dividend.'),
  ('legacy-2026-06-26-nvda-dividend', 2, 'Jakub', 'XTB', 'IKZE', 'NVDA', 'NASDAQ', 'tax', 0, -0.35, 0, 'PLN', null, -0.35, 0, 'Withholding tax.'),
  ('legacy-2026-06-29-nwg-dividend', 1, 'Natalia', 'XTB', 'IKZE', 'NWG', 'GPW', 'income', 0, 126, 0, 'PLN', null, 126, 0, 'Gross dividend.'),
  ('legacy-2026-06-29-jakub-pln-deposit-450', 1, 'Jakub', 'XTB', 'PLN brokerage', null, null, 'transfer', 0, 450, 0, 'PLN', null, 450, null, 'External owner contribution.'),
  ('legacy-2026-06-29-jakub-ike-transfer-450', 1, 'Jakub', 'XTB', 'PLN brokerage', null, null, 'transfer', 0, -450, 0, 'PLN', null, -450, null, null),
  ('legacy-2026-06-29-jakub-ike-transfer-450', 2, 'Jakub', 'XTB', 'IKE', null, null, 'transfer', 0, 450, 0, 'PLN', null, 450, null, null),
  ('legacy-2026-06-29-xnas-buy', 1, 'Jakub', 'XTB', 'IKE', 'XNAS.DE', 'XETRA', 'principal', 1, -257.92, 257.92, 'PLN', 257.92, -257.92, 257.92, null),
  ('legacy-2026-06-29-is3n-buy', 1, 'Jakub', 'XTB', 'IKE', 'IS3N.DE', 'XETRA', 'principal', 1, -207.23, 207.23, 'PLN', 207.23, -207.23, 207.23, null),
  ('legacy-2026-06-29-jakub-pln-deposit-175', 1, 'Jakub', 'XTB', 'PLN brokerage', null, null, 'transfer', 0, 175, 0, 'PLN', null, 175, null, 'External owner contribution.'),
  ('legacy-2026-06-29-jakub-ikze-transfer-175', 1, 'Jakub', 'XTB', 'PLN brokerage', null, null, 'transfer', 0, -175, 0, 'PLN', null, -175, null, null),
  ('legacy-2026-06-29-jakub-ikze-transfer-175', 2, 'Jakub', 'XTB', 'IKZE', null, null, 'transfer', 0, 175, 0, 'PLN', null, 175, null, null),
  ('legacy-2026-06-29-nvda-buy', 1, 'Jakub', 'XTB', 'IKZE', 'NVDA', 'NASDAQ', 'principal', 0.25, -181.74, 181.74, 'PLN', 726.96, -181.74, 181.74, null),
  ('legacy-2026-06-29-jakub-pln-deposit-125', 1, 'Jakub', 'XTB', 'PLN brokerage', null, null, 'transfer', 0, 125, 0, 'PLN', null, 125, null, 'External owner contribution.'),
  ('legacy-2026-06-29-xtb-pln-usd', 1, 'Jakub', 'XTB', 'PLN brokerage', null, null, 'transfer', 0, -125, 0, 'PLN', null, -125, null, null),
  ('legacy-2026-06-29-xtb-pln-usd', 2, 'Jakub', 'XTB', 'USD brokerage', null, null, 'transfer', 0, 33.06, 0, 'USD', null, 125, null, null),
  ('legacy-2026-06-29-vrt-buy', 1, 'Jakub', 'XTB', 'USD brokerage', 'VRT', 'NYSE', 'principal', 0.125, -38.59, 38.59, 'USD', 308.72, null, null, null),
  ('legacy-2026-06-29-bitvavo-free-eur-10', 1, 'Jakub', 'Bitvavo', 'Crypto', null, null, 'adjustment', 0, 10, 0, 'EUR', null, null, null, 'Non-owner/free EUR funding; not a portfolio contribution.'),
  ('legacy-2026-06-29-bitvavo-welcome-bonus', 1, 'Jakub', 'Bitvavo', 'Crypto', null, null, 'income', 0, 10, 0, 'EUR', null, null, null, 'Welcome bonus.'),
  ('legacy-2026-06-29-bitvavo-free-eur-1', 1, 'Jakub', 'Bitvavo', 'Crypto', null, null, 'adjustment', 0, 1, 0, 'EUR', null, null, null, 'Non-owner/free EUR funding; not a portfolio contribution.'),
  ('legacy-2026-06-30-rbw-sell', 1, 'Jakub', 'XTB', 'IKE', 'RBW', 'GPW', 'principal', -20, 2970, -2970, 'PLN', 148.5, 2970, -2970, null),
  ('legacy-2026-06-30-snt-buy', 1, 'Jakub', 'XTB', 'IKE', 'SNT', 'GPW', 'principal', 2, -661.6, 661.6, 'PLN', 330.8, -661.6, 661.6, null),
  ('legacy-2026-06-30-mbr-buy', 1, 'Jakub', 'XTB', 'IKE', 'MBR', 'GPW', 'principal', 2, -735, 735, 'PLN', 367.5, -735, 735, null),
  ('legacy-2026-06-30-abe-buy', 1, 'Jakub', 'XTB', 'IKE', 'ABE', 'GPW', 'principal', 5, -666, 666, 'PLN', 133.2, -666, 666, null),
  ('legacy-2026-06-30-pas-buy', 1, 'Jakub', 'XTB', 'IKE', 'PAS', 'GPW', 'principal', 3, -359.4, 359.4, 'PLN', 119.8, -359.4, 359.4, null),
  ('legacy-2026-06-30-is3n-buy', 1, 'Jakub', 'XTB', 'IKE', 'IS3N.DE', 'XETRA', 'principal', 1, -209.12, 209.12, 'PLN', 209.12, -209.12, 209.12, null),
  ('legacy-2026-06-30-xnas-buy', 1, 'Jakub', 'XTB', 'IKE', 'XNAS.DE', 'XETRA', 'principal', 1, -262.03, 262.03, 'PLN', 262.03, -262.03, 262.03, null),
  ('legacy-2026-06-30-toa-buy', 1, 'Jakub', 'XTB', 'IKE', 'TOA', 'GPW', 'principal', 8, -75.12, 75.12, 'PLN', 9.39, -75.12, 75.12, null),
  ('legacy-2026-06-30-ase-ike-dividend', 1, 'Natalia', 'XTB', 'IKE', 'ASE', 'GPW', 'income', 0, 68.25, 0, 'PLN', null, 68.25, 0, 'Gross dividend.'),
  ('legacy-2026-06-30-ase-ikze-dividend', 1, 'Natalia', 'XTB', 'IKZE', 'ASE', 'GPW', 'income', 0, 68.25, 0, 'PLN', null, 68.25, 0, 'Gross dividend.'),
  ('legacy-2026-06-30-elt-buy', 1, 'Natalia', 'XTB', 'IKZE', 'ELT', 'GPW', 'principal', 3, -169.2, 169.2, 'PLN', 56.4, -169.2, 169.2, null),
  ('legacy-2026-06-30-natalia-pln-deposit', 1, 'Natalia', 'XTB', 'PLN brokerage', null, null, 'transfer', 0, 1000, 0, 'PLN', null, 1000, null, 'External owner contribution.'),
  ('legacy-2026-06-30-natalia-ike-transfer', 1, 'Natalia', 'XTB', 'PLN brokerage', null, null, 'transfer', 0, -1000, 0, 'PLN', null, -1000, null, null),
  ('legacy-2026-06-30-natalia-ike-transfer', 2, 'Natalia', 'XTB', 'IKE', null, null, 'transfer', 0, 1000, 0, 'PLN', null, 1000, null, null),
  ('legacy-2026-06-30-kty-buy', 1, 'Natalia', 'XTB', 'IKE', 'KTY', 'GPW', 'principal', 0.25, -303.25, 303.25, 'PLN', 1213, -303.25, 303.25, null),
  ('legacy-2026-06-30-unt-buy', 1, 'Natalia', 'XTB', 'IKE', 'UNT', 'GPW', 'principal', 1, -165.2, 165.2, 'PLN', 165.2, -165.2, 165.2, null),
  ('legacy-2026-06-30-lpp-buy', 1, 'Natalia', 'XTB', 'IKE', 'LPP', 'GPW', 'principal', 0.015, -275.7, 275.7, 'PLN', 18380, -275.7, 275.7, null),
  ('legacy-2026-06-30-is3r-sell', 1, 'Natalia', 'XTB', 'IKE', 'IS3R.DE', 'XETRA', 'principal', -0.6, 276.89, -276.89, 'PLN', 461.4833333333333333333333333, 276.89, -276.89, null),
  ('legacy-2026-06-30-mpwr-buy', 1, 'Natalia', 'XTB', 'IKE', 'MPWR', 'NASDAQ', 'principal', 0.125, -634.52, 634.52, 'PLN', 5076.16, -634.52, 634.52, null),
  ('legacy-2026-06-30-binance-bitvavo-btc-transfer', 1, 'Jakub', 'Binance', 'Crypto', 'BTC', null, 'transfer', -0.06206382, 0, 0, 'EUR', null, null, null, 'Full Binance BTC balance sent out, including transfer/network cost.'),
  ('legacy-2026-06-30-binance-bitvavo-btc-transfer', 2, 'Jakub', 'Bitvavo', 'Crypto', 'BTC', null, 'transfer', 0.06204635, 0, 0, 'EUR', null, null, null, 'Exact BTC amount received by Bitvavo.'),
  ('legacy-2026-07-01-bitvavo-btc-buy', 1, 'Jakub', 'Bitvavo', 'Crypto', 'BTC', null, 'principal', 0.00040543, -20.98, 20.98, 'EUR', 51747.52731667612164861998372, null, null, null),
  ('legacy-2026-07-01-bitvavo-fee-rebate', 1, 'Jakub', 'Bitvavo', 'Crypto', null, null, 'income', 0, 0.04, 0, 'EUR', null, null, null, 'Fee rebate.'),
  ('legacy-2026-07-02-pas-dividend', 1, 'Jakub', 'XTB', 'IKE', 'PAS', 'GPW', 'income', 0, 100, 0, 'PLN', null, 100, 0, 'Gross dividend.'),
  ('legacy-2026-07-03-cbf-ike-dividend', 1, 'Natalia', 'XTB', 'IKE', 'CBF', 'GPW', 'income', 0, 82.5, 0, 'PLN', null, 82.5, 0, 'Gross dividend.'),
  ('legacy-2026-07-03-cbf-ikze-dividend', 1, 'Natalia', 'XTB', 'IKZE', 'CBF', 'GPW', 'income', 0, 50, 0, 'PLN', null, 50, 0, 'Gross dividend.'),
  ('legacy-2026-07-03-bitvavo-eur-deposit', 1, 'Jakub', 'Bitvavo', 'Crypto', null, null, 'transfer', 0, 139.14, 0, 'EUR', null, 600, null, 'External owner contribution.'),
  ('legacy-2026-07-03-bitvavo-btc-buy', 1, 'Jakub', 'Bitvavo', 'Crypto', 'BTC', null, 'principal', 0.00254822, -138.63, 138.63, 'EUR', 54402.68108719027399518094984, null, null, null),
  ('legacy-2026-07-03-bitvavo-fee-rebate', 1, 'Jakub', 'Bitvavo', 'Crypto', null, null, 'income', 0, 0.36, 0, 'EUR', null, null, null, 'Fee rebate.'),
  ('legacy-2026-07-06-jakub-pln-deposit-800', 1, 'Jakub', 'XTB', 'PLN brokerage', null, null, 'transfer', 0, 800, 0, 'PLN', null, 800, null, 'External owner contribution.'),
  ('legacy-2026-07-06-jakub-ike-transfer-800', 1, 'Jakub', 'XTB', 'PLN brokerage', null, null, 'transfer', 0, -800, 0, 'PLN', null, -800, null, null),
  ('legacy-2026-07-06-jakub-ike-transfer-800', 2, 'Jakub', 'XTB', 'IKE', null, null, 'transfer', 0, 800, 0, 'PLN', null, 800, null, null),
  ('legacy-2026-07-06-snt-buy', 1, 'Jakub', 'XTB', 'IKE', 'SNT', 'GPW', 'principal', 1, -357.2, 357.2, 'PLN', 357.2, -357.2, 357.2, null),
  ('legacy-2026-07-06-mbr-buy', 1, 'Jakub', 'XTB', 'IKE', 'MBR', 'GPW', 'principal', 1, -373.5, 373.5, 'PLN', 373.5, -373.5, 373.5, null),
  ('legacy-2026-07-06-jakub-pln-deposit-40', 1, 'Jakub', 'XTB', 'PLN brokerage', null, null, 'transfer', 0, 40, 0, 'PLN', null, 40, null, 'External owner contribution.'),
  ('legacy-2026-07-06-jakub-ike-transfer-40', 1, 'Jakub', 'XTB', 'PLN brokerage', null, null, 'transfer', 0, -40, 0, 'PLN', null, -40, null, null),
  ('legacy-2026-07-06-jakub-ike-transfer-40', 2, 'Jakub', 'XTB', 'IKE', null, null, 'transfer', 0, 40, 0, 'PLN', null, 40, null, null),
  ('legacy-2026-07-06-is3n-buy', 1, 'Jakub', 'XTB', 'IKE', 'IS3N.DE', 'XETRA', 'principal', 1, -207.93, 207.93, 'PLN', 207.93, -207.93, 207.93, null),
  ('legacy-2026-07-06-wpl-ike-sell', 1, 'Natalia', 'XTB', 'IKE', 'WPL', 'GPW', 'principal', -16, 939.2, -939.2, 'PLN', 58.7, 939.2, -939.2, null),
  ('legacy-2026-07-06-bdx-buy', 1, 'Natalia', 'XTB', 'IKE', 'BDX', 'GPW', 'principal', 1, -713.6, 713.6, 'PLN', 713.6, -713.6, 713.6, null),
  ('legacy-2026-07-06-ase-ike-sell', 1, 'Natalia', 'XTB', 'IKE', 'ASE', 'GPW', 'principal', -15, 898.5, -898.5, 'PLN', 59.9, 898.5, -898.5, null),
  ('legacy-2026-07-06-is3r-buy', 1, 'Natalia', 'XTB', 'IKE', 'IS3R.DE', 'XETRA', 'principal', 2, -898.66, 898.66, 'PLN', 449.33, -898.66, 898.66, null),
  ('legacy-2026-07-06-lpp-buy', 1, 'Natalia', 'XTB', 'IKE', 'LPP', 'GPW', 'principal', 0.01, -188.4, 188.4, 'PLN', 18840, -188.4, 188.4, null),
  ('legacy-2026-07-06-kty-buy', 1, 'Natalia', 'XTB', 'IKE', 'KTY', 'GPW', 'principal', 0.1, -121.2, 121.2, 'PLN', 1212, -121.2, 121.2, null),
  ('legacy-2026-07-06-natalia-pln-deposit', 1, 'Natalia', 'XTB', 'PLN brokerage', null, null, 'transfer', 0, 40, 0, 'PLN', null, 40, null, 'External owner contribution.'),
  ('legacy-2026-07-06-natalia-ike-transfer', 1, 'Natalia', 'XTB', 'PLN brokerage', null, null, 'transfer', 0, -40, 0, 'PLN', null, -40, null, null),
  ('legacy-2026-07-06-natalia-ike-transfer', 2, 'Natalia', 'XTB', 'IKE', null, null, 'transfer', 0, 40, 0, 'PLN', null, 40, null, null),
  ('legacy-2026-07-06-elt-buy', 1, 'Natalia', 'XTB', 'IKZE', 'ELT', 'GPW', 'principal', 2, -114.7, 114.7, 'PLN', 57.35, -114.7, 114.7, null),
  ('legacy-2026-07-06-walutomat-usd-xtb', 1, 'Jakub', 'XTB', 'USD brokerage', null, null, 'transfer', 0, 140.16, 0, 'USD', null, 520, null, 'External owner contribution.'),
  ('legacy-2026-07-06-avgo-dividend', 1, 'Jakub', 'XTB', 'USD brokerage', 'AVGO', 'NASDAQ', 'income', 0, 0.81, 0, 'USD', null, null, null, 'Gross dividend.'),
  ('legacy-2026-07-06-avgo-dividend', 2, 'Jakub', 'XTB', 'USD brokerage', 'AVGO', 'NASDAQ', 'tax', 0, -0.12, 0, 'USD', null, null, null, 'Withholding tax.'),
  ('legacy-2026-07-06-sndk-buy', 1, 'Jakub', 'XTB', 'USD brokerage', 'SNDK', 'NASDAQ', 'principal', 0.05, -91, 91, 'USD', 1820, null, null, null),
  ('legacy-2026-07-06-mu-buy', 1, 'Jakub', 'XTB', 'USD brokerage', 'MU', 'NASDAQ', 'principal', 0.1, -100.21, 100.21, 'USD', 1002.1, null, null, null),
  ('legacy-2026-07-09-tsm-dividend', 1, 'Jakub', 'XTB', 'IKZE', 'TSM', 'NYSE', 'income', 0, 4.4, 0, 'PLN', null, 4.4, 0, 'Gross dividend.'),
  ('legacy-2026-07-09-tsm-dividend', 2, 'Jakub', 'XTB', 'IKZE', 'TSM', 'NYSE', 'tax', 0, -0.92, 0, 'PLN', null, -0.92, 0, 'Withholding tax.'),
  ('legacy-2026-07-10-unt-dividend', 1, 'Natalia', 'XTB', 'IKE', 'UNT', 'GPW', 'income', 0, 214.5, 0, 'PLN', null, 214.5, 0, 'Gross dividend.'),
  ('legacy-2026-07-15-ctre-dividend', 1, 'Jakub', 'XTB', 'USD brokerage', 'CTRE', 'NYSE', 'income', 0, 9.75, 0, 'USD', null, null, null, 'Gross dividend.'),
  ('legacy-2026-07-15-ctre-dividend', 2, 'Jakub', 'XTB', 'USD brokerage', 'CTRE', 'NYSE', 'tax', 0, -1.46, 0, 'USD', null, null, null, 'Withholding tax.'),
  ('legacy-2026-07-15-mpwr-dividend', 1, 'Natalia', 'XTB', 'IKE', 'MPWR', 'NASDAQ', 'income', 0, 1.89, 0, 'PLN', null, 1.89, 0, 'Gross dividend.'),
  ('legacy-2026-07-15-mpwr-dividend', 2, 'Natalia', 'XTB', 'IKE', 'MPWR', 'NASDAQ', 'tax', 0, -0.28, 0, 'PLN', null, -0.28, 0, 'Withholding tax.'),
  ('legacy-2026-07-15-lpp-buy', 1, 'Natalia', 'XTB', 'IKE', 'LPP', 'GPW', 'principal', 0.01, -199.4, 199.4, 'PLN', 19940, -199.4, 199.4, null),
  ('legacy-2026-07-15-ase-ikze-sell', 1, 'Natalia', 'XTB', 'IKZE', 'ASE', 'GPW', 'principal', -5, 310, -310, 'PLN', 62, 310, -310, null),
  ('legacy-2026-07-15-natalia-pln-deposit-75', 1, 'Natalia', 'XTB', 'PLN brokerage', null, null, 'transfer', 0, 75, 0, 'PLN', null, 75, null, 'External owner contribution.'),
  ('legacy-2026-07-15-natalia-ikze-transfer-75', 1, 'Natalia', 'XTB', 'PLN brokerage', null, null, 'transfer', 0, -75, 0, 'PLN', null, -75, null, null),
  ('legacy-2026-07-15-natalia-ikze-transfer-75', 2, 'Natalia', 'XTB', 'IKZE', null, null, 'transfer', 0, 75, 0, 'PLN', null, 75, null, null),
  ('legacy-2026-07-15-cbf-buy', 1, 'Natalia', 'XTB', 'IKE', 'CBF', 'GPW', 'principal', 2, -383.2, 383.2, 'PLN', 191.6, -383.2, 383.2, null),
  ('legacy-2026-07-15-jakub-pln-deposit-175', 1, 'Jakub', 'XTB', 'PLN brokerage', null, null, 'transfer', 0, 175, 0, 'PLN', null, 175, null, 'External owner contribution.'),
  ('legacy-2026-07-15-jakub-ikze-transfer-192', 1, 'Jakub', 'XTB', 'PLN brokerage', null, null, 'transfer', 0, -192, 0, 'PLN', null, -192, null, null),
  ('legacy-2026-07-15-jakub-ikze-transfer-192', 2, 'Jakub', 'XTB', 'IKZE', null, null, 'transfer', 0, 192, 0, 'PLN', null, 192, null, null),
  ('legacy-2026-07-15-nvda-buy', 1, 'Jakub', 'XTB', 'IKZE', 'NVDA', 'NASDAQ', 'principal', 0.25, -198.72, 198.72, 'PLN', 794.88, -198.72, 198.72, null),
  ('legacy-2026-07-15-natalia-pln-deposit-100', 1, 'Natalia', 'XTB', 'PLN brokerage', null, null, 'transfer', 0, 100, 0, 'PLN', null, 100, null, 'External owner contribution.'),
  ('legacy-2026-07-15-natalia-ike-transfer-100', 1, 'Natalia', 'XTB', 'PLN brokerage', null, null, 'transfer', 0, -100, 0, 'PLN', null, -100, null, null),
  ('legacy-2026-07-15-natalia-ike-transfer-100', 2, 'Natalia', 'XTB', 'IKE', null, null, 'transfer', 0, 100, 0, 'PLN', null, 100, null, null),
  ('legacy-2026-07-15-mpwr-buy', 1, 'Natalia', 'XTB', 'IKE', 'MPWR', 'NASDAQ', 'principal', 0.025, -127.06, 127.06, 'PLN', 5082.4, -127.06, 127.06, null),
  ('legacy-2026-07-15-jakub-pln-deposit-1400', 1, 'Jakub', 'XTB', 'PLN brokerage', null, null, 'transfer', 0, 1400, 0, 'PLN', null, 1400, null, 'External owner contribution.'),
  ('legacy-2026-07-15-xtb-pln-usd', 1, 'Jakub', 'XTB', 'PLN brokerage', null, null, 'transfer', 0, -1481.61, 0, 'PLN', null, -1481.61, null, null),
  ('legacy-2026-07-15-xtb-pln-usd', 2, 'Jakub', 'XTB', 'USD brokerage', null, null, 'transfer', 0, 389.95, 0, 'USD', null, 1481.61, null, null),
  ('legacy-2026-07-15-avgo-buy', 1, 'Jakub', 'XTB', 'USD brokerage', 'AVGO', 'NASDAQ', 'principal', 0.25, -97.18, 97.18, 'USD', 388.72, null, null, null),
  ('legacy-2026-07-15-mu-buy', 1, 'Jakub', 'XTB', 'USD brokerage', 'MU', 'NASDAQ', 'principal', 0.15, -135.91, 135.91, 'USD', 906.0666666666666666666666667, null, null, null),
  ('legacy-2026-07-15-sndk-buy', 1, 'Jakub', 'XTB', 'USD brokerage', 'SNDK', 'NASDAQ', 'principal', 0.1, -155, 155, 'USD', 1550, null, null, null),
  ('legacy-2026-07-15-bitvavo-eur-deposit', 1, 'Jakub', 'Bitvavo', 'Crypto', null, null, 'transfer', 0, 57.49, 0, 'EUR', null, 250, null, 'External owner contribution.'),
  ('legacy-2026-07-15-bitvavo-btc-buy', 1, 'Jakub', 'Bitvavo', 'Crypto', 'BTC', null, 'principal', 0.001, -57.37, 57.37, 'EUR', 57370, null, null, null),
  ('legacy-2026-07-17-cpt-dividend', 1, 'Jakub', 'XTB', 'USD brokerage', 'CPT', 'NYSE', 'income', 0, 5.3, 0, 'USD', null, null, null, 'Gross dividend.'),
  ('legacy-2026-07-17-cpt-dividend', 2, 'Jakub', 'XTB', 'USD brokerage', 'CPT', 'NYSE', 'tax', 0, -0.8, 0, 'USD', null, null, null, 'Withholding tax.'),
  ('legacy-2026-07-20-jakub-pln-deposit-370', 1, 'Jakub', 'XTB', 'PLN brokerage', null, null, 'transfer', 0, 370, 0, 'PLN', null, 370, null, 'External owner contribution.'),
  ('legacy-2026-07-20-jakub-ike-transfer-39602', 1, 'Jakub', 'XTB', 'PLN brokerage', null, null, 'transfer', 0, -396.02, 0, 'PLN', null, -396.02, null, null),
  ('legacy-2026-07-20-jakub-ike-transfer-39602', 2, 'Jakub', 'XTB', 'IKE', null, null, 'transfer', 0, 396.02, 0, 'PLN', null, 396.02, null, null),
  ('legacy-2026-07-20-is3n-buy', 1, 'Jakub', 'XTB', 'IKE', 'IS3N.DE', 'XETRA', 'principal', 2, -396.55, 396.55, 'PLN', 198.275, -396.55, 396.55, null),
  ('legacy-2026-07-20-wpl-ike-dividend', 1, 'Natalia', 'XTB', 'IKE', 'WPL', 'GPW', 'income', 0, 41.6, 0, 'PLN', null, 41.6, 0, 'Gross dividend.'),
  ('legacy-2026-07-20-wpl-ikze-dividend', 1, 'Natalia', 'XTB', 'IKZE', 'WPL', 'GPW', 'income', 0, 41.6, 0, 'PLN', null, 41.6, 0, 'Gross dividend.'),
  ('legacy-2026-07-20-wpl-ike-sell', 1, 'Natalia', 'XTB', 'IKE', 'WPL', 'GPW', 'principal', -32, 1897.7, -1897.7, 'PLN', 59.303125, 1897.7, -1897.7, null),
  ('legacy-2026-07-20-lpp-buy', 1, 'Natalia', 'XTB', 'IKE', 'LPP', 'GPW', 'principal', 0.04, -806.4, 806.4, 'PLN', 20160, -806.4, 806.4, null),
  ('legacy-2026-07-20-kty-buy', 1, 'Natalia', 'XTB', 'IKE', 'KTY', 'GPW', 'principal', 0.15, -197.7, 197.7, 'PLN', 1318, -197.7, 197.7, null),
  ('legacy-2026-07-20-unt-buy', 1, 'Natalia', 'XTB', 'IKE', 'UNT', 'GPW', 'principal', 2, -335.2, 335.2, 'PLN', 167.6, -335.2, 335.2, null),
  ('legacy-2026-07-20-cbf-buy-3', 1, 'Natalia', 'XTB', 'IKE', 'CBF', 'GPW', 'principal', 3, -564.3, 564.3, 'PLN', 188.1, -564.3, 564.3, null),
  ('legacy-2026-07-20-ase-ikze-sell-1302', 1, 'Natalia', 'XTB', 'IKZE', 'ASE', 'GPW', 'principal', -10, 619, -619, 'PLN', 61.9, 619, -619, null),
  ('legacy-2026-07-20-elt-buy', 1, 'Natalia', 'XTB', 'IKZE', 'ELT', 'GPW', 'principal', 5, -270.5, 270.5, 'PLN', 54.1, -270.5, 270.5, null),
  ('legacy-2026-07-20-cbf-buy-2', 1, 'Natalia', 'XTB', 'IKE', 'CBF', 'GPW', 'principal', 2, -376.2, 376.2, 'PLN', 188.1, -376.2, 376.2, null),
  ('legacy-2026-07-20-ase-ikze-sell-1312', 1, 'Natalia', 'XTB', 'IKZE', 'ASE', 'GPW', 'principal', -5, 309.5, -309.5, 'PLN', 61.9, 309.5, -309.5, null),
  ('legacy-2026-07-20-natalia-pln-deposit-530', 1, 'Natalia', 'XTB', 'PLN brokerage', null, null, 'transfer', 0, 530, 0, 'PLN', null, 530, null, 'External owner contribution.'),
  ('legacy-2026-07-20-natalia-ikze-transfer-530', 1, 'Natalia', 'XTB', 'PLN brokerage', null, null, 'transfer', 0, -530, 0, 'PLN', null, -530, null, null),
  ('legacy-2026-07-20-natalia-ikze-transfer-530', 2, 'Natalia', 'XTB', 'IKZE', null, null, 'transfer', 0, 530, 0, 'PLN', null, 530, null, null),
  ('legacy-2026-07-20-is3r-ikze-buy', 1, 'Natalia', 'XTB', 'IKZE', 'IS3R.DE', 'XETRA', 'principal', 2, -867.76, 867.76, 'PLN', 433.88, -867.76, 867.76, null),
  ('legacy-2026-07-20-jakub-pln-deposit-350', 1, 'Jakub', 'XTB', 'PLN brokerage', null, null, 'transfer', 0, 350, 0, 'PLN', null, 350, null, 'External owner contribution.'),
  ('legacy-2026-07-20-jakub-ike-transfer-350', 1, 'Jakub', 'XTB', 'PLN brokerage', null, null, 'transfer', 0, -350, 0, 'PLN', null, -350, null, null),
  ('legacy-2026-07-20-jakub-ike-transfer-350', 2, 'Jakub', 'XTB', 'IKE', null, null, 'transfer', 0, 350, 0, 'PLN', null, 350, null, null),
  ('legacy-2026-07-20-abe-ike-buy', 1, 'Jakub', 'XTB', 'IKE', 'ABE', 'GPW', 'principal', 2, -270, 270, 'PLN', 135, -270, 270, null),
  ('legacy-2026-07-20-pas-buy', 1, 'Jakub', 'XTB', 'IKE', 'PAS', 'GPW', 'principal', 1, -119.2, 119.2, 'PLN', 119.2, -119.2, 119.2, null),
  ('legacy-2026-07-20-ase-ikze-sell-1441', 1, 'Natalia', 'XTB', 'IKZE', 'ASE', 'GPW', 'principal', -10, 619, -619, 'PLN', 61.9, 619, -619, null),
  ('legacy-2026-07-20-nwg-buy', 1, 'Natalia', 'XTB', 'IKZE', 'NWG', 'GPW', 'principal', 8, -697.6, 697.6, 'PLN', 87.2, -697.6, 697.6, null),
  ('legacy-2026-07-20-jakub-pln-deposit-375-ikze', 1, 'Jakub', 'XTB', 'PLN brokerage', null, null, 'transfer', 0, 375, 0, 'PLN', null, 375, null, 'External owner contribution.'),
  ('legacy-2026-07-20-jakub-ikze-transfer-375', 1, 'Jakub', 'XTB', 'PLN brokerage', null, null, 'transfer', 0, -375, 0, 'PLN', null, -375, null, null),
  ('legacy-2026-07-20-jakub-ikze-transfer-375', 2, 'Jakub', 'XTB', 'IKZE', null, null, 'transfer', 0, 375, 0, 'PLN', null, 375, null, null),
  ('legacy-2026-07-20-tsm-buy', 1, 'Jakub', 'XTB', 'IKZE', 'TSM', 'NYSE', 'principal', 0.25, -385.08, 385.08, 'PLN', 1540.32, -385.08, 385.08, null),
  ('legacy-2026-07-20-jakub-pln-deposit-375-usd', 1, 'Jakub', 'XTB', 'PLN brokerage', null, null, 'transfer', 0, 375, 0, 'PLN', null, 375, null, 'External owner contribution.'),
  ('legacy-2026-07-20-xtb-pln-usd', 1, 'Jakub', 'XTB', 'PLN brokerage', null, null, 'transfer', 0, -392.87, 0, 'PLN', null, -392.87, null, null),
  ('legacy-2026-07-20-xtb-pln-usd', 2, 'Jakub', 'XTB', 'USD brokerage', null, null, 'transfer', 0, 102.95, 0, 'USD', null, 392.87, null, null),
  ('legacy-2026-07-20-sndk-buy', 1, 'Jakub', 'XTB', 'USD brokerage', 'SNDK', 'NASDAQ', 'principal', 0.05, -70.59, 70.59, 'USD', 1411.8, null, null, null),
  ('legacy-2026-07-20-mu-buy', 1, 'Jakub', 'XTB', 'USD brokerage', 'MU', 'NASDAQ', 'principal', 0.05, -43.81, 43.81, 'USD', 876.2, null, null, null),
  ('legacy-2026-07-21-mu-dividend', 1, 'Jakub', 'XTB', 'USD brokerage', 'MU', 'NASDAQ', 'income', 0, 0.08, 0, 'USD', null, null, null, 'Gross dividend.'),
  ('legacy-2026-07-21-mu-dividend', 2, 'Jakub', 'XTB', 'USD brokerage', 'MU', 'NASDAQ', 'tax', 0, -0.01, 0, 'USD', null, null, null, 'Withholding tax.'),
  ('legacy-2026-07-24-elt-ike-dividend', 1, 'Natalia', 'XTB', 'IKE', 'ELT', 'GPW', 'income', 0, 150, 0, 'PLN', null, 150, 0, 'Gross dividend.'),
  ('legacy-2026-07-24-elt-ikze-dividend', 1, 'Natalia', 'XTB', 'IKZE', 'ELT', 'GPW', 'income', 0, 100, 0, 'PLN', null, 100, 0, 'Gross dividend.'),
  ('legacy-2026-07-27-jakub-pln-deposit-600', 1, 'Jakub', 'XTB', 'PLN brokerage', null, null, 'transfer', 0, 600, 0, 'PLN', null, 600, null, 'External owner contribution.'),
  ('legacy-2026-07-27-jakub-ikze-transfer-130', 1, 'Jakub', 'XTB', 'PLN brokerage', null, null, 'transfer', 0, -130, 0, 'PLN', null, -130, null, null),
  ('legacy-2026-07-27-jakub-ikze-transfer-130', 2, 'Jakub', 'XTB', 'IKZE', null, null, 'transfer', 0, 130, 0, 'PLN', null, 130, null, null),
  ('legacy-2026-07-27-abe-ikze-buy', 1, 'Jakub', 'XTB', 'IKZE', 'ABE', 'GPW', 'principal', 1, -136, 136, 'PLN', 136, -136, 136, null),
  ('legacy-2026-07-27-jakub-ike-transfer-470', 1, 'Jakub', 'XTB', 'PLN brokerage', null, null, 'transfer', 0, -470, 0, 'PLN', null, -470, null, null),
  ('legacy-2026-07-27-jakub-ike-transfer-470', 2, 'Jakub', 'XTB', 'IKE', null, null, 'transfer', 0, 470, 0, 'PLN', null, 470, null, null),
  ('legacy-2026-07-27-snt-buy', 1, 'Jakub', 'XTB', 'IKE', 'SNT', 'GPW', 'principal', 1, -367.2, 367.2, 'PLN', 367.2, -367.2, 367.2, null),
  ('legacy-2026-07-27-pas-buy', 1, 'Jakub', 'XTB', 'IKE', 'PAS', 'GPW', 'principal', 1, -124.8, 124.8, 'PLN', 124.8, -124.8, 124.8, null),
  ('legacy-2026-07-27-natalia-pln-deposit-400', 1, 'Natalia', 'XTB', 'PLN brokerage', null, null, 'transfer', 0, 400, 0, 'PLN', null, 400, null, 'External owner contribution.'),
  ('legacy-2026-07-27-natalia-ikze-transfer-400', 1, 'Natalia', 'XTB', 'PLN brokerage', null, null, 'transfer', 0, -400, 0, 'PLN', null, -400, null, null),
  ('legacy-2026-07-27-natalia-ikze-transfer-400', 2, 'Natalia', 'XTB', 'IKZE', null, null, 'transfer', 0, 400, 0, 'PLN', null, 400, null, null),
  ('legacy-2026-07-27-cbf-ikze-buy-1', 1, 'Natalia', 'XTB', 'IKZE', 'CBF', 'GPW', 'principal', 1, -193.5, 193.5, 'PLN', 193.5, -193.5, 193.5, null),
  ('legacy-2026-07-27-wpl-ikze-sell', 1, 'Natalia', 'XTB', 'IKZE', 'WPL', 'GPW', 'principal', -32, 1843.2, -1843.2, 'PLN', 57.6, 1843.2, -1843.2, null),
  ('legacy-2026-07-27-is3r-ikze-buy', 1, 'Natalia', 'XTB', 'IKZE', 'IS3R.DE', 'XETRA', 'principal', 2, -881.13, 881.13, 'PLN', 440.565, -881.13, 881.13, null),
  ('legacy-2026-07-27-ase-ikze-sell-5', 1, 'Natalia', 'XTB', 'IKZE', 'ASE', 'GPW', 'principal', -5, 342.5, -342.5, 'PLN', 68.5, 342.5, -342.5, null),
  ('legacy-2026-07-27-ase-ike-sell-20', 1, 'Natalia', 'XTB', 'IKE', 'ASE', 'GPW', 'principal', -20, 1370, -1370, 'PLN', 68.5, 1370, -1370, null),
  ('legacy-2026-07-27-bft-buy', 1, 'Natalia', 'XTB', 'IKZE', 'BFT', 'GPW', 'principal', 0.2, -1036, 1036, 'PLN', 5180, -1036, 1036, null),
  ('legacy-2026-07-27-cbf-ikze-buy-3', 1, 'Natalia', 'XTB', 'IKZE', 'CBF', 'GPW', 'principal', 3, -580.5, 580.5, 'PLN', 193.5, -580.5, 580.5, null),
  ('legacy-2026-07-27-bitvavo-eur-deposit-1208', 1, 'Jakub', 'Bitvavo', 'Crypto', null, null, 'transfer', 0, 57.57, 0, 'EUR', null, 250, null, 'External owner contribution.'),
  ('legacy-2026-07-27-bitvavo-btc-buy-1209', 1, 'Jakub', 'Bitvavo', 'Crypto', 'BTC', null, 'principal', 0.001, -57.37, 57.37, 'EUR', 57370, null, null, null),
  ('legacy-2026-07-27-jakub-pln-deposit-250', 1, 'Jakub', 'XTB', 'PLN brokerage', null, null, 'transfer', 0, 250, 0, 'PLN', null, 250, null, 'External owner contribution.'),
  ('legacy-2026-07-27-xtb-pln-usd', 1, 'Jakub', 'XTB', 'PLN brokerage', null, null, 'transfer', 0, -250, 0, 'PLN', null, -250, null, null),
  ('legacy-2026-07-27-xtb-pln-usd', 2, 'Jakub', 'XTB', 'USD brokerage', null, null, 'transfer', 0, 65.43, 0, 'USD', null, 250, null, null),
  ('legacy-2026-07-27-sndk-buy', 1, 'Jakub', 'XTB', 'USD brokerage', 'SNDK', 'NASDAQ', 'principal', 0.05, -64.06, 64.06, 'USD', 1281.2, null, null, null),
  ('legacy-2026-07-27-tsm-natalia-buy', 1, 'Natalia', 'XTB', 'IKE', 'TSM', 'NYSE', 'principal', 0.25, -375.09, 375.09, 'PLN', 1500.36, -375.09, 375.09, null),
  ('legacy-2026-07-27-asml-buy-005', 1, 'Natalia', 'XTB', 'IKE', 'ASML', 'NASDAQ', 'principal', 0.05, -314.9, 314.9, 'PLN', 6298, -314.9, 314.9, null),
  ('legacy-2026-07-27-mu-natalia-buy', 1, 'Natalia', 'XTB', 'IKE', 'MU', 'NASDAQ', 'principal', 0.2, -663.83, 663.83, 'PLN', 3319.15, -663.83, 663.83, null),
  ('legacy-2026-07-27-natalia-pln-deposit-250', 1, 'Natalia', 'XTB', 'PLN brokerage', null, null, 'transfer', 0, 250, 0, 'PLN', null, 250, null, 'External owner contribution.'),
  ('legacy-2026-07-27-natalia-ike-transfer-250', 1, 'Natalia', 'XTB', 'PLN brokerage', null, null, 'transfer', 0, -250, 0, 'PLN', null, -250, null, null),
  ('legacy-2026-07-27-natalia-ike-transfer-250', 2, 'Natalia', 'XTB', 'IKE', null, null, 'transfer', 0, 250, 0, 'PLN', null, 250, null, null),
  ('legacy-2026-07-27-asml-buy-0075', 1, 'Natalia', 'XTB', 'IKE', 'ASML', 'NASDAQ', 'principal', 0.075, -464.16, 464.16, 'PLN', 6188.8, -464.16, 464.16, null),
  ('legacy-2026-07-27-bitvavo-eur-deposit-1737', 1, 'Jakub', 'Bitvavo', 'Crypto', null, null, 'transfer', 0, 57.49, 0, 'EUR', null, 250, null, 'External owner contribution.'),
  ('legacy-2026-07-27-bitvavo-btc-buy-1738', 1, 'Jakub', 'Bitvavo', 'Crypto', 'BTC', null, 'principal', 0.001, -57.22, 57.22, 'EUR', 57220, null, null, null),
  ('legacy-2026-07-31-maa-dividend', 1, 'Jakub', 'XTB', 'USD brokerage', 'MAA', 'NYSE', 'income', 0, 7.65, 0, 'USD', null, null, null, 'Gross dividend.'),
  ('legacy-2026-07-31-maa-dividend', 2, 'Jakub', 'XTB', 'USD brokerage', 'MAA', 'NYSE', 'tax', 0, -1.15, 0, 'USD', null, null, null, 'Withholding tax.'),
  ('legacy-2026-08-03-kru-sell', 1, 'Natalia', 'XTB', 'IKE', 'KRU', 'GPW', 'principal', -4, 1735.6, -1735.6, 'PLN', 433.9, 1735.6, -1735.6, null),
  ('legacy-2026-08-03-unt-buy', 1, 'Natalia', 'XTB', 'IKE', 'UNT', 'GPW', 'principal', 1, -165.6, 165.6, 'PLN', 165.6, -165.6, 165.6, null),
  ('legacy-2026-08-03-kty-buy', 1, 'Natalia', 'XTB', 'IKE', 'KTY', 'GPW', 'principal', 0.5, -643.5, 643.5, 'PLN', 1287, -643.5, 643.5, null),
  ('legacy-2026-08-03-is3r-ike-buy', 1, 'Natalia', 'XTB', 'IKE', 'IS3R.DE', 'XETRA', 'principal', 2, -848.04, 848.04, 'PLN', 424.02, -848.04, 848.04, null),
  ('legacy-2026-08-03-jakub-pln-deposit-1000', 1, 'Jakub', 'XTB', 'PLN brokerage', null, null, 'transfer', 0, 1000, 0, 'PLN', null, 1000, null, 'External owner contribution.'),
  ('legacy-2026-08-03-jakub-ikze-transfer-272', 1, 'Jakub', 'XTB', 'PLN brokerage', null, null, 'transfer', 0, -272, 0, 'PLN', null, -272, null, null),
  ('legacy-2026-08-03-jakub-ikze-transfer-272', 2, 'Jakub', 'XTB', 'IKZE', null, null, 'transfer', 0, 272, 0, 'PLN', null, 272, null, null),
  ('legacy-2026-08-03-abe-ikze-buy', 1, 'Jakub', 'XTB', 'IKZE', 'ABE', 'GPW', 'principal', 2, -272, 272, 'PLN', 136, -272, 272, null),
  ('legacy-2026-08-03-jakub-ike-transfer-728', 1, 'Jakub', 'XTB', 'PLN brokerage', null, null, 'transfer', 0, -728, 0, 'PLN', null, -728, null, null),
  ('legacy-2026-08-03-jakub-ike-transfer-728', 2, 'Jakub', 'XTB', 'IKE', null, null, 'transfer', 0, 728, 0, 'PLN', null, 728, null, null),
  ('legacy-2026-08-03-snt-buy', 1, 'Jakub', 'XTB', 'IKE', 'SNT', 'GPW', 'principal', 1, -365.4, 365.4, 'PLN', 365.4, -365.4, 365.4, null),
  ('legacy-2026-08-03-xnas-buy', 1, 'Jakub', 'XTB', 'IKE', 'XNAS.DE', 'XETRA', 'principal', 1, -247.18, 247.18, 'PLN', 247.18, -247.18, 247.18, null),
  ('legacy-2026-08-03-pas-buy', 1, 'Jakub', 'XTB', 'IKE', 'PAS', 'GPW', 'principal', 1, -123.2, 123.2, 'PLN', 123.2, -123.2, 123.2, null),
  ('legacy-2026-08-03-natalia-pln-deposit-500', 1, 'Natalia', 'XTB', 'PLN brokerage', null, null, 'transfer', 0, 500, 0, 'PLN', null, 500, null, 'External owner contribution.'),
  ('legacy-2026-08-03-natalia-ike-transfer-500', 1, 'Natalia', 'XTB', 'PLN brokerage', null, null, 'transfer', 0, -500, 0, 'PLN', null, -500, null, null),
  ('legacy-2026-08-03-natalia-ike-transfer-500', 2, 'Natalia', 'XTB', 'IKE', null, null, 'transfer', 0, 500, 0, 'PLN', null, 500, null, null),
  ('legacy-2026-08-03-jakub-pln-deposit-500', 1, 'Jakub', 'XTB', 'PLN brokerage', null, null, 'transfer', 0, 500, 0, 'PLN', null, 500, null, 'External owner contribution.'),
  ('legacy-2026-08-03-xtb-pln-usd', 1, 'Jakub', 'XTB', 'PLN brokerage', null, null, 'transfer', 0, -500, 0, 'PLN', null, -500, null, null),
  ('legacy-2026-08-03-xtb-pln-usd', 2, 'Jakub', 'XTB', 'USD brokerage', null, null, 'transfer', 0, 133.01, 0, 'USD', null, 500, null, null),
  ('legacy-2026-08-03-cpt-sell', 1, 'Jakub', 'XTB', 'USD brokerage', 'CPT', 'NYSE', 'principal', -5, 557.15, -557.15, 'USD', 111.43, null, null, null),
  ('legacy-2026-08-03-mu-natalia-buy', 1, 'Natalia', 'XTB', 'IKE', 'MU', 'NASDAQ', 'principal', 0.2, -615.38, 615.38, 'PLN', 3076.9, -615.38, 615.38, null),
  ('legacy-2026-08-03-maa-buy', 1, 'Jakub', 'XTB', 'USD brokerage', 'MAA', 'NYSE', 'principal', 3, -400.74, 400.74, 'USD', 133.58, null, null, null),
  ('legacy-2026-08-03-ctre-buy', 1, 'Jakub', 'XTB', 'USD brokerage', 'CTRE', 'NYSE', 'principal', 3, -125.04, 125.04, 'USD', 41.68, null, null, null),
  ('legacy-2026-08-03-avgo-buy', 1, 'Jakub', 'XTB', 'USD brokerage', 'AVGO', 'NASDAQ', 'principal', 0.25, -95.83, 95.83, 'USD', 383.32, null, null, null),
  ('legacy-2026-08-03-sndk-buy', 1, 'Jakub', 'XTB', 'USD brokerage', 'SNDK', 'NASDAQ', 'principal', 0.05, -63, 63, 'USD', 1260, null, null, null),
  ('legacy-2026-08-05-asml-jakub-dividend', 1, 'Jakub', 'XTB', 'USD brokerage', 'ASML', 'NASDAQ', 'income', 0, 0.81, 0, 'USD', null, null, null, 'Gross dividend.'),
  ('legacy-2026-08-05-asml-jakub-dividend', 2, 'Jakub', 'XTB', 'USD brokerage', 'ASML', 'NASDAQ', 'tax', 0, -0.12, 0, 'USD', null, null, null, 'Withholding tax.'),
  ('legacy-2026-08-05-asml-natalia-dividend', 1, 'Natalia', 'XTB', 'IKE', 'ASML', 'NASDAQ', 'income', 0, 1.0, 0, 'PLN', null, 1.0, 0, 'Gross dividend.'),
  ('legacy-2026-08-05-asml-natalia-dividend', 2, 'Natalia', 'XTB', 'IKE', 'ASML', 'NASDAQ', 'tax', 0, -0.15, 0, 'PLN', null, -0.15, 0, 'Withholding tax.');

-- ============================================================
-- 4. SAFETY CHECK: THE ONLY ALREADY-EXISTING POST-BASELINE
--    MANUAL/UNREFERENCED OPERATIONS MUST BE THE 10 TEST/REAL
--    OPERATIONS PREVIOUSLY ENTERED ON 2026-08-03.
--
-- They are replaced with the fully normalized import records so
-- every operation gets a deterministic external reference.
-- ============================================================

do $$
declare
  v_existing_unreferenced_count integer;
begin
  select
    count(*)
  into
    v_existing_unreferenced_count
  from public.portfolio_operations as operations
  join public.workspaces as workspaces
    on workspaces.id = operations.workspace_id
  where workspaces.name = 'Kosterna Portfolio'
    and operations.source = 'manual'
    and operations.external_reference is null
    and operations.operation_date >= date '2026-06-14'
    and operations.operation_date <= date '2026-08-05';

  if v_existing_unreferenced_count <> 10 then
    raise exception
      'Expected exactly 10 existing unreferenced manual operations before detailed-history import; found %.',
      v_existing_unreferenced_count;
  end if;
end;
$$;

delete from public.portfolio_operations as operations
using public.workspaces as workspaces
where workspaces.id = operations.workspace_id
  and workspaces.name = 'Kosterna Portfolio'
  and operations.source = 'manual'
  and operations.external_reference is null
  and operations.operation_date >= date '2026-06-14'
  and operations.operation_date <= date '2026-08-05';

-- ============================================================
-- 5. RESOLUTION CHECKS BEFORE INSERT.
-- ============================================================

do $$
declare
  v_missing_account_count integer;
  v_missing_instrument_count integer;
begin
  select
    count(*)
  into
    v_missing_account_count
  from historical_entries as staged
  join public.workspaces as workspaces
    on workspaces.name = 'Kosterna Portfolio'
  left join public.owners as owners
    on owners.workspace_id = workspaces.id
    and owners.display_name = staged.owner_name
  left join public.providers as providers
    on providers.workspace_id = workspaces.id
    and providers.name = staged.provider_name
  left join public.accounts as accounts
    on accounts.workspace_id = workspaces.id
    and accounts.owner_id = owners.id
    and accounts.provider_id = providers.id
    and accounts.name = staged.account_name
  where accounts.id is null;

  if v_missing_account_count <> 0 then
    raise exception
      'Historical import contains % entries whose account could not be resolved.',
      v_missing_account_count;
  end if;

  select
    count(*)
  into
    v_missing_instrument_count
  from historical_entries as staged
  join public.workspaces as workspaces
    on workspaces.name = 'Kosterna Portfolio'
  left join public.instruments as instruments
    on instruments.workspace_id = workspaces.id
    and upper(instruments.ticker) = upper(staged.instrument_ticker)
    and coalesce(upper(instruments.exchange), '') =
        coalesce(upper(staged.instrument_exchange), '')
  where staged.instrument_ticker is not null
    and instruments.id is null;

  if v_missing_instrument_count <> 0 then
    raise exception
      'Historical import contains % entries whose instrument could not be resolved.',
      v_missing_instrument_count;
  end if;
end;
$$;

-- ============================================================
-- 6. INSERT OPERATIONS.
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
  staged.operation_date,
  (
    staged.operation_date +
    staged.operation_time
  ) at time zone workspaces.timezone,
  staged.operation_type,
  'posted',
  'import',
  staged.description,
  staged.notes,
  staged.external_reference
from historical_operations as staged
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

-- ============================================================
-- 7. INSERT OPERATION ENTRIES.
-- ============================================================

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
  staged.sequence_no,
  accounts.id,
  instruments.id,
  staged.component,
  staged.quantity_delta,
  staged.cash_delta,
  staged.value_delta,
  staged.currency,
  staged.unit_price,
  case
    when staged.base_cash_delta is not null
      and staged.cash_delta <> 0
      then abs(
        staged.base_cash_delta /
        staged.cash_delta
      )
    else null
  end,
  staged.base_cash_delta,
  staged.base_value_delta,
  staged.memo
from historical_entries as staged
join public.workspaces as workspaces
  on workspaces.name = 'Kosterna Portfolio'
join public.portfolio_operations as operations
  on operations.workspace_id = workspaces.id
  and operations.source = 'import'
  and operations.external_reference =
    staged.external_reference
join public.owners as owners
  on owners.workspace_id = workspaces.id
  and owners.display_name = staged.owner_name
join public.providers as providers
  on providers.workspace_id = workspaces.id
  and providers.name = staged.provider_name
join public.accounts as accounts
  on accounts.workspace_id = workspaces.id
  and accounts.owner_id = owners.id
  and accounts.provider_id = providers.id
  and accounts.name = staged.account_name
left join public.instruments as instruments
  on staged.instrument_ticker is not null
  and instruments.workspace_id = workspaces.id
  and upper(instruments.ticker) =
    upper(staged.instrument_ticker)
  and coalesce(
    upper(instruments.exchange),
    ''
  ) = coalesce(
    upper(staged.instrument_exchange),
    ''
  )
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

-- ============================================================
-- 8. EXPECTED CURRENT QUANTITIES FROM BROKER/CRYPTO SCREENSHOTS.
--    Zero rows are intentionally included for closed positions.
-- ============================================================

create temporary table expected_current_quantities (
  owner_name text not null,
  provider_name text not null,
  account_name text not null,
  instrument_ticker text not null,
  instrument_exchange text,
  quantity numeric(28, 10) not null
)
on commit drop;

insert into expected_current_quantities (
  owner_name,
  provider_name,
  account_name,
  instrument_ticker,
  instrument_exchange,
  quantity
)
values
  ('Jakub', 'Binance', 'Crypto', 'BTC', null, 0),
  ('Jakub', 'Bitvavo', 'Crypto', 'BTC', null, 0.068),

  ('Jakub', 'XTB', 'IKE', 'ABE', 'GPW', 40),
  ('Jakub', 'XTB', 'IKE', 'COG', 'GPW', 500),
  ('Jakub', 'XTB', 'IKE', 'DIG', 'GPW', 75),
  ('Jakub', 'XTB', 'IKE', 'IS3N.DE', 'XETRA', 38),
  ('Jakub', 'XTB', 'IKE', 'MBR', 'GPW', 23),
  ('Jakub', 'XTB', 'IKE', 'PAS', 'GPW', 48),
  ('Jakub', 'XTB', 'IKE', 'RBW', 'GPW', 0),
  ('Jakub', 'XTB', 'IKE', 'SNT', 'GPW', 45),
  ('Jakub', 'XTB', 'IKE', 'TOA', 'GPW', 483),
  ('Jakub', 'XTB', 'IKE', 'XNAS.DE', 'XETRA', 56),
  ('Jakub', 'XTB', 'IKE', 'XTB', 'GPW', 350),
  ('Jakub', 'XTB', 'IKZE', 'ABE', 'GPW', 20),
  ('Jakub', 'XTB', 'IKZE', 'NVDA', 'NASDAQ', 3.5),
  ('Jakub', 'XTB', 'IKZE', 'TOA', 'GPW', 325),
  ('Jakub', 'XTB', 'IKZE', 'TSM', 'NYSE', 1.5),
  ('Jakub', 'XTB', 'IKZE', 'XNAS.DE', 'XETRA', 30),
  ('Jakub', 'XTB', 'IKZE', 'XTB', 'GPW', 50),
  ('Jakub', 'XTB', 'USD brokerage', 'ASML', 'NASDAQ', 0.375),
  ('Jakub', 'XTB', 'USD brokerage', 'AVGO', 'NASDAQ', 2),
  ('Jakub', 'XTB', 'USD brokerage', 'CPT', 'NYSE', 0),
  ('Jakub', 'XTB', 'USD brokerage', 'CTRE', 'NYSE', 28),
  ('Jakub', 'XTB', 'USD brokerage', 'EQIX', 'NASDAQ', 1),
  ('Jakub', 'XTB', 'USD brokerage', 'IWMO.UK', 'LSE', 7),
  ('Jakub', 'XTB', 'USD brokerage', 'MAA', 'NYSE', 8),
  ('Jakub', 'XTB', 'USD brokerage', 'MU', 'NASDAQ', 0.8),
  ('Jakub', 'XTB', 'USD brokerage', 'SNDK', 'NASDAQ', 0.55),
  ('Jakub', 'XTB', 'USD brokerage', 'VRT', 'NYSE', 1.5),
  ('Natalia', 'XTB', 'IKE', 'ANET', 'NYSE', 3),
  ('Natalia', 'XTB', 'IKE', 'ASB', 'GPW', 160),
  ('Natalia', 'XTB', 'IKE', 'ASE', 'GPW', 0),
  ('Natalia', 'XTB', 'IKE', 'ASML', 'NASDAQ', 0.125),
  ('Natalia', 'XTB', 'IKE', 'BDX', 'GPW', 10),
  ('Natalia', 'XTB', 'IKE', 'CBF', 'GPW', 36),
  ('Natalia', 'XTB', 'IKE', 'ELT', 'GPW', 75),
  ('Natalia', 'XTB', 'IKE', 'IS3R.DE', 'XETRA', 22),
  ('Natalia', 'XTB', 'IKE', 'KRU', 'GPW', 36),
  ('Natalia', 'XTB', 'IKE', 'KTY', 'GPW', 6),
  ('Natalia', 'XTB', 'IKE', 'LPP', 'GPW', 0.7),
  ('Natalia', 'XTB', 'IKE', 'MPWR', 'NASDAQ', 0.4),
  ('Natalia', 'XTB', 'IKE', 'MU', 'NASDAQ', 0.4),
  ('Natalia', 'XTB', 'IKE', 'TSM', 'NYSE', 0.25),
  ('Natalia', 'XTB', 'IKE', 'UNT', 'GPW', 36),
  ('Natalia', 'XTB', 'IKE', 'WPL', 'GPW', 0),
  ('Natalia', 'XTB', 'IKZE', 'ASE', 'GPW', 0),
  ('Natalia', 'XTB', 'IKZE', 'BFT', 'GPW', 1.2),
  ('Natalia', 'XTB', 'IKZE', 'CBF', 'GPW', 28),
  ('Natalia', 'XTB', 'IKZE', 'ELT', 'GPW', 60),
  ('Natalia', 'XTB', 'IKZE', 'IS3R.DE', 'XETRA', 22),
  ('Natalia', 'XTB', 'IKZE', 'NWG', 'GPW', 50),
  ('Natalia', 'XTB', 'IKZE', 'WPL', 'GPW', 0);

-- ============================================================
-- 9. VALIDATION.
-- ============================================================

do $$
declare
  v_imported_operation_count integer;
  v_imported_entry_count integer;
  v_legacy_flow_count integer;
  v_legacy_flow_sum numeric(28, 10);
  v_20260711_quantity_mismatch_count integer;
  v_current_quantity_mismatch_count integer;
  v_extra_current_position_count integer;
  v_cumulative_20260630 numeric(28, 10);
  v_cumulative_20260711 numeric(28, 10);
  v_cumulative_20260806 numeric(28, 10);
begin
  select
    count(*)
  into
    v_imported_operation_count
  from public.portfolio_operations as operations
  join public.workspaces as workspaces
    on workspaces.id = operations.workspace_id
  where workspaces.name = 'Kosterna Portfolio'
    and operations.source = 'import'
    and operations.external_reference like 'legacy-2026-%';

  if v_imported_operation_count <> 206 then
    raise exception
      'Expected 206 imported detailed operations, found %.',
      v_imported_operation_count;
  end if;

  select
    count(*)
  into
    v_imported_entry_count
  from public.portfolio_operation_entries as entries
  join public.portfolio_operations as operations
    on operations.id = entries.operation_id
    and operations.workspace_id = entries.workspace_id
  join public.workspaces as workspaces
    on workspaces.id = operations.workspace_id
  where workspaces.name = 'Kosterna Portfolio'
    and operations.source = 'import'
    and operations.external_reference like 'legacy-2026-%';

  if v_imported_entry_count <> 250 then
    raise exception
      'Expected 250 imported detailed-operation entries, found %.',
      v_imported_entry_count;
  end if;

  select
    count(*),
    coalesce(sum(flows.amount_base), 0)
  into
    v_legacy_flow_count,
    v_legacy_flow_sum
  from public.portfolio_legacy_external_flows as flows
  join public.workspaces as workspaces
    on workspaces.id = flows.workspace_id
  where workspaces.name = 'Kosterna Portfolio'
    and flows.external_reference like 'legacy-xirr-flow-%';

  if v_legacy_flow_count <> 27
     or abs(v_legacy_flow_sum - 236000) > 0.00000001 then
    raise exception
      'Legacy XIRR vector validation failed: % rows, % PLN.',
      v_legacy_flow_count,
      v_legacy_flow_sum;
  end if;

  -- Compare all unit-tracked 2026-07-11 snapshots against
  -- quantities produced by opening state + imported operations.
  select
    count(*)
  into
    v_20260711_quantity_mismatch_count
  from public.position_snapshots as snapshots
  join public.workspaces as workspaces
    on workspaces.id = snapshots.workspace_id
  join public.instruments as instruments
    on instruments.id = snapshots.instrument_id
    and instruments.workspace_id = snapshots.workspace_id
  left join public.get_portfolio_unit_positions_as_of(
    workspaces.id,
    date '2026-07-11'
  ) as actual
    on actual.account_id = snapshots.account_id
    and actual.instrument_id = snapshots.instrument_id
  where workspaces.name = 'Kosterna Portfolio'
    and snapshots.snapshot_date = date '2026-07-11'
    and instruments.tracking_mode = 'units'
    and (
      actual.quantity is null
      or snapshots.quantity is null
      or abs(
        actual.quantity -
        snapshots.quantity
      ) > 0.00000001
    );

  if v_20260711_quantity_mismatch_count <> 0 then
    raise exception
      '2026-07-11 checkpoint contains % quantity mismatches after detailed-history import.',
      v_20260711_quantity_mismatch_count;
  end if;

  -- Every user-confirmed current position, including closed
  -- zero-quantity positions, must match the reconstructed ledger.
  select
    count(*)
  into
    v_current_quantity_mismatch_count
  from expected_current_quantities as expected
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
    and upper(instruments.ticker) =
      upper(expected.instrument_ticker)
    and coalesce(
      upper(instruments.exchange),
      ''
    ) = coalesce(
      upper(expected.instrument_exchange),
      ''
    )
  left join public.get_portfolio_unit_positions_as_of(
    workspaces.id,
    date '2026-08-06'
  ) as actual
    on actual.account_id = accounts.id
    and actual.instrument_id = instruments.id
  where abs(
    coalesce(actual.quantity, 0) -
    expected.quantity
  ) > 0.00000001;

  if v_current_quantity_mismatch_count <> 0 then
    raise exception
      'Current holdings reconciliation found % quantity mismatches.',
      v_current_quantity_mismatch_count;
  end if;

  -- Also reject any unexpected non-zero position not present in
  -- the user-confirmed current matrix.
  select
    count(*)
  into
    v_extra_current_position_count
  from public.workspaces as workspaces
  cross join lateral public.get_portfolio_unit_positions_as_of(
    workspaces.id,
    date '2026-08-06'
  ) as actual
  join public.accounts as accounts
    on accounts.id = actual.account_id
    and accounts.workspace_id = workspaces.id
  join public.owners as owners
    on owners.id = accounts.owner_id
    and owners.workspace_id = workspaces.id
  join public.providers as providers
    on providers.id = accounts.provider_id
    and providers.workspace_id = workspaces.id
  join public.instruments as instruments
    on instruments.id = actual.instrument_id
    and instruments.workspace_id = workspaces.id
  left join expected_current_quantities as expected
    on expected.owner_name = owners.display_name
    and expected.provider_name = providers.name
    and expected.account_name = accounts.name
    and upper(expected.instrument_ticker) =
      upper(instruments.ticker)
    and coalesce(
      upper(expected.instrument_exchange),
      ''
    ) = coalesce(
      upper(instruments.exchange),
      ''
    )
  where workspaces.name = 'Kosterna Portfolio'
    and abs(actual.quantity) > 0.00000001
    and expected.instrument_ticker is null;

  if v_extra_current_position_count <> 0 then
    raise exception
      'Current holdings reconciliation found % unexpected non-zero positions.',
      v_extra_current_position_count;
  end if;

  select cumulative_value
  into v_cumulative_20260630
  from private.calculate_cumulative_contributions_as_of(
    (
      select id
      from public.workspaces
      where name = 'Kosterna Portfolio'
      limit 1
    ),
    date '2026-06-30'
  );

  select cumulative_value
  into v_cumulative_20260711
  from private.calculate_cumulative_contributions_as_of(
    (
      select id
      from public.workspaces
      where name = 'Kosterna Portfolio'
      limit 1
    ),
    date '2026-07-11'
  );

  select cumulative_value
  into v_cumulative_20260806
  from private.calculate_cumulative_contributions_as_of(
    (
      select id
      from public.workspaces
      where name = 'Kosterna Portfolio'
      limit 1
    ),
    date '2026-08-06'
  );

  if abs(v_cumulative_20260630 - 241000) > 0.00000001 then
    raise exception
      'Expected cumulative contributions 241000 PLN on 2026-06-30, found %.',
      v_cumulative_20260630;
  end if;

  if abs(v_cumulative_20260711 - 243000) > 0.00000001 then
    raise exception
      'Expected cumulative contributions 243000 PLN on 2026-07-11, found %.',
      v_cumulative_20260711;
  end if;

  if abs(v_cumulative_20260806 - 251000) > 0.00000001 then
    raise exception
      'Expected cumulative contributions 251000 PLN on 2026-08-06, found %.',
      v_cumulative_20260806;
  end if;
end;
$$;

commit;