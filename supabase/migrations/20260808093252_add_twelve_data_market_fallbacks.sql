begin;

alter table public.market_data_instrument_sources
  drop constraint if exists market_data_instrument_sources_provider_check;

alter table public.market_data_instrument_sources
  add constraint market_data_instrument_sources_provider_check
  check (
    provider in (
      'eodhd',
      'alpha_vantage',
      'twelve_data',
      'bitvavo'
    )
  );

-- US-listed instruments:
-- Twelve Data becomes primary, Alpha Vantage becomes fallback.
update public.market_data_instrument_sources s
set
  priority = 100,
  updated_at = now()
from public.instruments i
where
  i.workspace_id = s.workspace_id
  and i.id = s.instrument_id
  and s.provider = 'alpha_vantage'
  and i.exchange in ('NASDAQ', 'NYSE');

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
  'twelve_data',
  i.ticker,
  1,
  true,
  'Primary US-listed market-data source; Alpha Vantage fallback.'
from public.instruments i
where
  i.exchange in ('NASDAQ', 'NYSE')
  and exists (
    select 1
    from public.market_data_instrument_sources s
    where
      s.workspace_id = i.workspace_id
      and s.instrument_id = i.id
      and s.provider = 'alpha_vantage'
  )
on conflict (workspace_id, instrument_id, provider)
do update set
  provider_symbol = excluded.provider_symbol,
  priority = excluded.priority,
  is_enabled = excluded.is_enabled,
  notes = excluded.notes,
  updated_at = now();

update public.market_data_instrument_sources s
set
  priority = 2,
  updated_at = now()
from public.instruments i
where
  i.workspace_id = s.workspace_id
  and i.id = s.instrument_id
  and s.provider = 'alpha_vantage'
  and i.exchange in ('NASDAQ', 'NYSE');

-- Verified fallback for XNAS.DE.
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
  'XNAS.XETRA',
  2,
  true,
  'Verified EODHD fallback for XNAS.DE.'
from public.instruments i
where i.ticker = 'XNAS.DE'
on conflict (workspace_id, instrument_id, provider)
do update set
  provider_symbol = excluded.provider_symbol,
  priority = excluded.priority,
  is_enabled = excluded.is_enabled,
  notes = excluded.notes,
  updated_at = now();

commit;