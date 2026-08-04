begin;

create type public.instrument_kind as enum (
  'stock',
  'etf',
  'reit',
  'crypto',
  'government_bond',
  'ppk_fund',
  'other'
);

create type public.instrument_tracking_mode as enum (
  'units',
  'balance'
);

alter table public.instruments
  add column instrument_kind public.instrument_kind
    not null default 'other',

  add column tracking_mode public.instrument_tracking_mode
    not null default 'units',

  add column isin text;

alter table public.instruments
  add constraint instruments_isin_format_check
  check (
    isin is null
    or isin ~ '^[A-Z]{2}[A-Z0-9]{9}[0-9]$'
  );

create unique index instruments_workspace_ticker_exchange_key
  on public.instruments (
    workspace_id,
    upper(ticker),
    coalesce(upper(exchange), '')
  )
  where ticker is not null;

create unique index instruments_workspace_isin_key
  on public.instruments (workspace_id, isin)
  where isin is not null;

create index instruments_workspace_kind_idx
  on public.instruments (
    workspace_id,
    instrument_kind,
    is_active
  );

create index instruments_workspace_tracking_mode_idx
  on public.instruments (
    workspace_id,
    tracking_mode,
    is_active
  );

grant usage on type public.instrument_kind
  to authenticated, service_role;

grant usage on type public.instrument_tracking_mode
  to authenticated, service_role;

commit;