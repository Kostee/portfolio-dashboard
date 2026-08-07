begin;

-- ============================================================
-- VERIFIED HISTORICAL INSTRUMENT CATALOG
-- ============================================================

create temporary table
  historical_instrument_catalog (
    asset_class_code text
      not null,

    name text
      not null,

    ticker text
      not null,

    exchange text,

    default_currency char(3)
      not null,

    instrument_kind
      public.instrument_kind
      not null,

    tracking_mode
      public.instrument_tracking_mode
      not null,

    isin text,

    is_active boolean
      not null
  )
on commit drop;


insert into
  historical_instrument_catalog (
    asset_class_code,
    name,
    ticker,
    exchange,
    default_currency,
    instrument_kind,
    tracking_mode,
    isin,
    is_active
  )
values

  -- ==========================================================
  -- POLISH STOCKS
  -- ==========================================================

  (
    'polish_stocks',
    'Digital Network S.A.',
    'DIG',
    'GPW',
    'PLN',
    'stock',
    'units',
    'PL4FNMD00013',
    true
  ),

  (
    'polish_stocks',
    'Synektik S.A.',
    'SNT',
    'GPW',
    'PLN',
    'stock',
    'units',
    'PLSNKTK00019',
    true
  ),

  (
    'polish_stocks',
    'Mo-BRUK S.A.',
    'MBR',
    'GPW',
    'PLN',
    'stock',
    'units',
    'PLMOBRK00013',
    true
  ),

  (
    'polish_stocks',
    'Passus S.A.',
    'PAS',
    'GPW',
    'PLN',
    'stock',
    'units',
    'PLPSSUS00018',
    true
  ),

  (
    'polish_stocks',
    'AB S.A.',
    'ABE',
    'GPW',
    'PLN',
    'stock',
    'units',
    'PLAB00000019',
    true
  ),

  (
    'polish_stocks',
    'TOYA S.A.',
    'TOA',
    'GPW',
    'PLN',
    'stock',
    'units',
    'PLTOYA000011',
    true
  ),

  (
    'polish_stocks',
    'Cognor Holding S.A.',
    'COG',
    'GPW',
    'PLN',
    'stock',
    'units',
    'PLCNTSL00014',
    true
  ),

  (
    'polish_stocks',
    'Rainbow Tours S.A.',
    'RBW',
    'GPW',
    'PLN',
    'stock',
    'units',
    'PLRNBWT00031',
    true
  ),

  (
    'polish_stocks',
    'ASBISc Enterprises Plc',
    'ASB',
    'GPW',
    'PLN',
    'stock',
    'units',
    'CY1000031710',
    true
  ),

  (
    'polish_stocks',
    'KRUK S.A.',
    'KRU',
    'GPW',
    'PLN',
    'stock',
    'units',
    'PLKRK0000010',
    true
  ),

  (
    'polish_stocks',
    'LPP S.A.',
    'LPP',
    'GPW',
    'PLN',
    'stock',
    'units',
    'PLLPP0000011',
    true
  ),

  (
    'polish_stocks',
    'Grupa Kęty S.A.',
    'KTY',
    'GPW',
    'PLN',
    'stock',
    'units',
    'PLKETY000011',
    true
  ),

  (
    'polish_stocks',
    'Budimex S.A.',
    'BDX',
    'GPW',
    'PLN',
    'stock',
    'units',
    'PLBUDMX00013',
    true
  ),

  (
    'polish_stocks',
    'Cyber_Folks S.A.',
    'CBF',
    'GPW',
    'PLN',
    'stock',
    'units',
    'PLR220000018',
    true
  ),

  (
    'polish_stocks',
    'Unimot S.A.',
    'UNT',
    'GPW',
    'PLN',
    'stock',
    'units',
    'PLUNMOT00013',
    true
  ),

  (
    'polish_stocks',
    'Elektrotim S.A.',
    'ELT',
    'GPW',
    'PLN',
    'stock',
    'units',
    'PLELEKT00016',
    true
  ),

  (
    'polish_stocks',
    'Wirtualna Polska Holding S.A.',
    'WPL',
    'GPW',
    'PLN',
    'stock',
    'units',
    'PLWRTPL00027',
    true
  ),

  (
    'polish_stocks',
    'Asseco South Eastern Europe S.A.',
    'ASE',
    'GPW',
    'PLN',
    'stock',
    'units',
    'PLASSEE00014',
    true
  ),

  (
    'polish_stocks',
    'Benefit Systems S.A.',
    'BFT',
    'GPW',
    'PLN',
    'stock',
    'units',
    'PLBNFTS00018',
    true
  ),

  (
    'polish_stocks',
    'NEWAG S.A.',
    'NWG',
    'GPW',
    'PLN',
    'stock',
    'units',
    'PLNEWAG00012',
    true
  ),

  -- ==========================================================
  -- GLOBAL ETF LISTINGS
  -- ==========================================================

  (
    'global_etfs',
    'Xtrackers NASDAQ 100 UCITS ETF 1C',
    'XNAS.DE',
    'XETRA',
    'EUR',
    'etf',
    'units',
    'IE00BMFKG444',
    true
  ),

  (
    'global_etfs',
    'iShares Core MSCI EM IMI UCITS ETF USD (Acc)',
    'IS3N.DE',
    'XETRA',
    'EUR',
    'etf',
    'units',
    'IE00BKM4GZ66',
    true
  ),

  (
    'global_etfs',
    'iShares Edge MSCI World Momentum Factor UCITS ETF USD (Acc)',
    'IS3R.DE',
    'XETRA',
    'EUR',
    'etf',
    'units',
    'IE00BP3QZ825',
    true
  ),

  (
    'global_etfs',
    'iShares Edge MSCI World Momentum Factor UCITS ETF USD (Acc)',
    'IWMO.UK',
    'LSE',
    'USD',
    'etf',
    'units',
    'IE00BP3QZ825',
    true
  ),

  -- ==========================================================
  -- U.S. REIT
  -- ==========================================================

  (
    'us_reits',
    'Equinix, Inc.',
    'EQIX',
    'NASDAQ',
    'USD',
    'reit',
    'units',
    'US29444U7000',
    true
  ),

  -- ==========================================================
  -- SEMICONDUCTOR / AI INFRASTRUCTURE BASKET
  -- ==========================================================

  (
    'semiconductor_stocks',
    'NVIDIA Corporation',
    'NVDA',
    'NASDAQ',
    'USD',
    'stock',
    'units',
    'US67066G1040',
    true
  ),

  (
    'semiconductor_stocks',
    'ASML Holding N.V. ADR',
    'ASML',
    'NASDAQ',
    'USD',
    'stock',
    'units',
    'USN070592100',
    true
  ),

  (
    'semiconductor_stocks',
    'Vertiv Holdings Co',
    'VRT',
    'NYSE',
    'USD',
    'stock',
    'units',
    'US92537N1081',
    true
  ),

  (
    'semiconductor_stocks',
    'Taiwan Semiconductor Manufacturing Company Limited ADR',
    'TSM',
    'NYSE',
    'USD',
    'stock',
    'units',
    'US8740391003',
    true
  ),

  (
    'semiconductor_stocks',
    'Arista Networks, Inc.',
    'ANET',
    'NYSE',
    'USD',
    'stock',
    'units',
    'US0404132054',
    true
  ),

  (
    'semiconductor_stocks',
    'Monolithic Power Systems, Inc.',
    'MPWR',
    'NASDAQ',
    'USD',
    'stock',
    'units',
    'US6098391054',
    true
  ),

  -- ==========================================================
  -- BITCOIN
  -- ==========================================================

  (
    'bitcoin',
    'Bitcoin',
    'BTC',
    null,
    'EUR',
    'crypto',
    'units',
    null,
    true
  );


-- ============================================================
-- INSERT MISSING RECORDS
-- ============================================================

insert into public.instruments (
  workspace_id,
  name,
  ticker,
  exchange,
  asset_class_id,
  default_currency,
  is_active,
  instrument_kind,
  tracking_mode,
  isin
)

select
  workspaces.id,
  catalog.name,
  catalog.ticker,
  catalog.exchange,
  asset_classes.id,
  catalog.default_currency,
  catalog.is_active,
  catalog.instrument_kind,
  catalog.tracking_mode,
  catalog.isin

from historical_instrument_catalog
  as catalog

join public.workspaces
  as workspaces
  on workspaces.name =
    'Kosterna Portfolio'

join public.asset_classes
  as asset_classes
  on asset_classes.workspace_id =
    workspaces.id

  and asset_classes.code =
    catalog.asset_class_code

where not exists (
  select 1

  from public.instruments
    as existing_instruments

  where existing_instruments.workspace_id =
    workspaces.id

    and upper(
      existing_instruments.ticker
    ) =
      upper(
        catalog.ticker
      )

    and coalesce(
      upper(
        existing_instruments.exchange
      ),
      ''
    ) =
      coalesce(
        upper(
          catalog.exchange
        ),
        ''
      )
);


-- ============================================================
-- KEEP CATALOG RECORDS SYNCHRONIZED
-- ============================================================

update public.instruments
  as instruments

set
  name =
    catalog.name,

  asset_class_id =
    asset_classes.id,

  default_currency =
    catalog.default_currency,

  is_active =
    catalog.is_active,

  instrument_kind =
    catalog.instrument_kind,

  tracking_mode =
    catalog.tracking_mode,

  isin =
    catalog.isin,

  updated_at =
    now()

from historical_instrument_catalog
  as catalog

join public.workspaces
  as workspaces
  on workspaces.name =
    'Kosterna Portfolio'

join public.asset_classes
  as asset_classes
  on asset_classes.workspace_id =
    workspaces.id

  and asset_classes.code =
    catalog.asset_class_code

where instruments.workspace_id =
    workspaces.id

  and upper(
    instruments.ticker
  ) =
    upper(
      catalog.ticker
    )

  and coalesce(
    upper(
      instruments.exchange
    ),
    ''
  ) =
    coalesce(
      upper(
        catalog.exchange
      ),
      ''
    );


-- ============================================================
-- VALIDATE THE CATALOG
-- ============================================================

do $$
declare
  v_expected_count integer := 32;
  v_actual_count integer;

  v_momentum_listing_count integer;
begin
  select
    count(*)
  into
    v_actual_count

  from historical_instrument_catalog
    as catalog

  join public.workspaces
    as workspaces
    on workspaces.name =
      'Kosterna Portfolio'

  join public.instruments
    as instruments
    on instruments.workspace_id =
      workspaces.id

    and upper(
      instruments.ticker
    ) =
      upper(
        catalog.ticker
      )

    and coalesce(
      upper(
        instruments.exchange
      ),
      ''
    ) =
      coalesce(
        upper(
          catalog.exchange
        ),
        ''
      );

  if v_actual_count <>
    v_expected_count then

    raise exception
      'Expected % verified catalog instruments, found %.',
      v_expected_count,
      v_actual_count;
  end if;


  select
    count(*)
  into
    v_momentum_listing_count

  from public.instruments
    as instruments

  join public.workspaces
    as workspaces
    on workspaces.id =
      instruments.workspace_id

  where workspaces.name =
      'Kosterna Portfolio'

    and instruments.isin =
      'IE00BP3QZ825'

    and instruments.ticker
      in (
        'IS3R.DE',
        'IWMO.UK'
      );

  if v_momentum_listing_count <> 2 then
    raise exception
      'Expected two separate MSCI World Momentum listings, found %.',
      v_momentum_listing_count;
  end if;
end;
$$;


commit;