begin;

-- Daily market-open data is private portfolio data.
-- Members may read it through the authenticated application session.
-- Writes remain service-role only and are performed by the Edge Function.

drop policy if exists
  instrument_daily_open_prices_select
on public.instrument_daily_open_prices;

create policy
  instrument_daily_open_prices_select
on public.instrument_daily_open_prices
for select
to authenticated
using (
  private.is_workspace_member(
    workspace_id
  )
);

drop policy if exists
  daily_market_open_sync_runs_select
on public.daily_market_open_sync_runs;

create policy
  daily_market_open_sync_runs_select
on public.daily_market_open_sync_runs
for select
to authenticated
using (
  private.is_workspace_member(
    workspace_id
  )
);

drop policy if exists
  daily_market_open_sync_items_select
on public.daily_market_open_sync_items;

create policy
  daily_market_open_sync_items_select
on public.daily_market_open_sync_items
for select
to authenticated
using (
  private.is_workspace_member(
    workspace_id
  )
);

grant select
  on public.instrument_daily_open_prices
  to authenticated;

grant select
  on public.daily_market_open_sync_runs
  to authenticated;

grant select
  on public.daily_market_open_sync_items
  to authenticated;

commit;