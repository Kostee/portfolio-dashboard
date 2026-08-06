begin;

-- ============================================================
-- CURRENT UNIT POSITIONS WITH THEIR LATEST VALUATION
-- ============================================================

create or replace view
  public.portfolio_current_valued_unit_positions
with (security_invoker = true)
as
select
  positions.workspace_id,

  positions.account_id,
  positions.owner_id,
  positions.owner_name,

  positions.provider_id,
  positions.provider_name,

  positions.account_name,
  positions.account_currency,

  positions.instrument_id,
  positions.instrument_name,
  positions.instrument_ticker,
  positions.instrument_exchange,
  positions.instrument_currency,

  positions.quantity,

  positions.first_activity_date,
  positions.last_activity_date,

  latest.snapshot_id,
  latest.snapshot_date as valuation_date,

  latest.quantity as valuation_quantity,
  latest.unit_price as valuation_unit_price,

  latest.market_value as valuation_market_value,
  latest.currency as valuation_currency,

  latest.fx_rate_to_base
    as valuation_fx_rate_to_base,

  latest.market_value_base
    as valuation_market_value_base,

  latest.source as valuation_source,
  latest.notes as valuation_notes,

  case
    when latest.snapshot_id is null then
      'missing'

    when latest.quantity is null then
      'missing_quantity'

    when abs(
      latest.quantity - positions.quantity
    ) <= 0.00000001 then
      'matched'

    else
      'quantity_mismatch'
  end as valuation_status,

  case
    when latest.quantity is null then null
    else
      (
        latest.quantity
        - positions.quantity
      )::numeric(28, 10)
  end as valuation_quantity_difference

from public.portfolio_current_unit_positions
  as positions

left join public.portfolio_latest_position_snapshots
  as latest
  on latest.workspace_id =
    positions.workspace_id
  and latest.account_id =
    positions.account_id
  and latest.instrument_id =
    positions.instrument_id
  and latest.tracking_mode = 'units';

revoke all
  on public.portfolio_current_valued_unit_positions
  from anon;

grant select
  on public.portfolio_current_valued_unit_positions
  to authenticated, service_role;

comment on view
  public.portfolio_current_valued_unit_positions
is
  'Current posted unit positions combined with the latest account-specific valuation snapshot.';

commit;