begin;

-- ============================================================
-- DAILY MARKET OPEN PRICE HISTORY
-- ============================================================

create table public.instrument_daily_open_prices (
  id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null
    references public.workspaces(id)
    on delete cascade,

  instrument_id uuid not null,

  trading_date date not null,

  open_price numeric(28, 10) not null
    check (open_price > 0),

  currency char(3) not null
    check (currency ~ '^[A-Z]{3}$'),

  provider text not null
    check (
      provider in (
        'eodhd',
        'alpha_vantage',
        'twelve_data'
      )
    ),

  provider_symbol text not null
    check (btrim(provider_symbol) <> ''),

  provider_timestamp timestamptz,

  fetched_at timestamptz not null
    default now(),

  metadata jsonb not null
    default '{}'::jsonb
    check (
      jsonb_typeof(metadata) = 'object'
    ),

  created_at timestamptz not null
    default now(),

  updated_at timestamptz not null
    default now(),

  constraint instrument_daily_open_prices_instrument_workspace_fk
    foreign key (
      workspace_id,
      instrument_id
    )
    references public.instruments (
      workspace_id,
      id
    )
    on delete cascade,

  constraint instrument_daily_open_prices_workspace_instrument_date_key
    unique (
      workspace_id,
      instrument_id,
      trading_date
    )
);

create index instrument_daily_open_prices_workspace_date_idx
  on public.instrument_daily_open_prices (
    workspace_id,
    trading_date desc
  );

create index instrument_daily_open_prices_instrument_date_idx
  on public.instrument_daily_open_prices (
    instrument_id,
    trading_date desc
  );


-- ============================================================
-- DAILY MARKET OPEN SYNC RUNS
-- ============================================================

create table public.daily_market_open_sync_runs (
  id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null
    references public.workspaces(id)
    on delete cascade,

  market_region text not null
    check (
      market_region in (
        'europe',
        'us'
      )
    ),

  trading_date date not null,

  status text not null
    check (
      status in (
        'running',
        'completed',
        'partial',
        'failed',
        'skipped_market_closed'
      )
    ),

  trigger_source text not null
    default 'cron'
    check (
      trigger_source in (
        'cron',
        'manual'
      )
    ),

  instrument_success_count integer not null
    default 0
    check (instrument_success_count >= 0),

  instrument_skipped_count integer not null
    default 0
    check (instrument_skipped_count >= 0),

  instrument_failure_count integer not null
    default 0
    check (instrument_failure_count >= 0),

  started_at timestamptz not null
    default now(),

  completed_at timestamptz,

  notes text,

  created_at timestamptz not null
    default now(),

  updated_at timestamptz not null
    default now(),

  constraint daily_market_open_sync_runs_workspace_region_date_key
    unique (
      workspace_id,
      market_region,
      trading_date
    )
);

create index daily_market_open_sync_runs_workspace_date_idx
  on public.daily_market_open_sync_runs (
    workspace_id,
    trading_date desc,
    market_region
  );


-- ============================================================
-- DAILY MARKET OPEN SYNC ITEMS
-- ============================================================

create table public.daily_market_open_sync_items (
  id uuid primary key default gen_random_uuid(),

  run_id uuid not null
    references public.daily_market_open_sync_runs(id)
    on delete cascade,

  workspace_id uuid not null,

  instrument_id uuid not null,

  status text not null
    check (
      status in (
        'success',
        'skipped_market_closed',
        'failed',
        'no_source'
      )
    ),

  provider text
    check (
      provider is null
      or provider in (
        'eodhd',
        'alpha_vantage',
        'twelve_data'
      )
    ),

  provider_symbol text,

  trading_date date,

  open_price numeric(28, 10)
    check (
      open_price is null
      or open_price > 0
    ),

  currency char(3)
    check (
      currency is null
      or currency ~ '^[A-Z]{3}$'
    ),

  provider_timestamp timestamptz,

  error_message text,

  metadata jsonb not null
    default '{}'::jsonb
    check (
      jsonb_typeof(metadata) = 'object'
    ),

  created_at timestamptz not null
    default now(),

  updated_at timestamptz not null
    default now(),

  constraint daily_market_open_sync_items_instrument_workspace_fk
    foreign key (
      workspace_id,
      instrument_id
    )
    references public.instruments (
      workspace_id,
      id
    )
    on delete cascade,

  constraint daily_market_open_sync_items_run_instrument_key
    unique (
      run_id,
      instrument_id
    )
);

create index daily_market_open_sync_items_run_status_idx
  on public.daily_market_open_sync_items (
    run_id,
    status
  );


-- ============================================================
-- SECURITY
-- ============================================================

alter table public.instrument_daily_open_prices
  enable row level security;

alter table public.daily_market_open_sync_runs
  enable row level security;

alter table public.daily_market_open_sync_items
  enable row level security;

revoke all
  on public.instrument_daily_open_prices
  from anon, authenticated;

revoke all
  on public.daily_market_open_sync_runs
  from anon, authenticated;

revoke all
  on public.daily_market_open_sync_items
  from anon, authenticated;

grant all
  on public.instrument_daily_open_prices
  to service_role;

grant all
  on public.daily_market_open_sync_runs
  to service_role;

grant all
  on public.daily_market_open_sync_items
  to service_role;


-- ============================================================
-- COMPLETE EODHD MAPPINGS FOR EUROPEAN DAILY OPEN
-- ============================================================

insert into public.market_data_instrument_sources (
  workspace_id,
  instrument_id,
  provider,
  provider_symbol,
  priority,
  is_enabled,
  notes
)
select
  i.workspace_id,
  i.id,
  'eodhd',
  case i.ticker
    when 'IS3N.DE' then 'IS3N.XETRA'
    when 'IS3R.DE' then 'IS3R.XETRA'
    when 'IWMO.UK' then 'IWMO.LSE'
  end,
  2,
  true,
  'EODHD mapping available for daily European market-open synchronization.'
from public.instruments i
where
  i.ticker in (
    'IS3N.DE',
    'IS3R.DE',
    'IWMO.UK'
  )
  and not exists (
    select 1
    from public.market_data_instrument_sources s
    where
      s.workspace_id = i.workspace_id
      and s.instrument_id = i.id
      and s.provider = 'eodhd'
  );

commit;