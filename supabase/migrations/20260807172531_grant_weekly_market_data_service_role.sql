begin;

-- Edge Function reads the automatic source catalog.
grant select
  on table public.market_data_instrument_sources
  to service_role;

-- Edge Function creates and updates the sync audit.
grant select, insert, update, delete
  on table public.market_data_sync_runs
  to service_role;

grant select, insert, update, delete
  on table public.market_data_sync_items
  to service_role;

-- Portfolio inventory used to determine which instruments are actually held.
grant select
  on table public.portfolio_operation_entries
  to service_role;

grant select
  on table public.portfolio_operations
  to service_role;

grant select
  on table public.accounts
  to service_role;

grant select
  on table public.owners
  to service_role;

grant select
  on table public.providers
  to service_role;

grant select
  on table public.instruments
  to service_role;

grant select
  on table public.position_snapshots
  to service_role;

grant execute
  on function public.get_portfolio_unit_positions_as_of(uuid, date)
  to service_role;

-- Automatic quotes and FX are persisted by the Edge Function.
grant select, insert, update
  on table public.instrument_prices
  to service_role;

grant select, insert, update
  on table public.exchange_rates
  to service_role;

commit;
