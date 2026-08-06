begin;

-- ============================================================
-- FROZEN CHART METADATA
-- ============================================================

alter table public.portfolio_report_items
  add column asset_class_code text,
  add column asset_class_color text,
  add column instrument_exchange text;

comment on column
  public.portfolio_report_items.asset_class_code
is
  'Asset-class code frozen when the report revision is created.';

comment on column
  public.portfolio_report_items.asset_class_color
is
  'Asset-class HEX color frozen when the report revision is created.';

comment on column
  public.portfolio_report_items.instrument_exchange
is
  'Instrument exchange frozen when the report revision is created.';


-- ============================================================
-- BACKFILL ANY EXISTING REPORT ITEMS
-- ============================================================

update public.portfolio_report_items
  as items
set
  instrument_exchange =
    instruments.exchange
from public.instruments
  as instruments
where instruments.id =
    items.instrument_id

  and instruments.workspace_id =
    items.workspace_id;


update public.portfolio_report_items
  as items
set
  asset_class_code =
    asset_classes.code,

  asset_class_color =
    asset_classes.color_hex
from public.asset_classes
  as asset_classes
where asset_classes.id =
    items.asset_class_id

  and asset_classes.workspace_id =
    items.workspace_id;


-- ============================================================
-- AUTOMATICALLY FREEZE METADATA ON INSERT
-- ============================================================

create or replace function
  private.populate_report_item_chart_metadata()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select
    instruments.exchange
  into
    new.instrument_exchange
  from public.instruments
    as instruments
  where instruments.id =
    new.instrument_id

    and instruments.workspace_id =
      new.workspace_id
  limit 1;

  if new.asset_class_id is not null then
    select
      asset_classes.code,
      asset_classes.color_hex
    into
      new.asset_class_code,
      new.asset_class_color
    from public.asset_classes
      as asset_classes
    where asset_classes.id =
      new.asset_class_id

      and asset_classes.workspace_id =
        new.workspace_id
    limit 1;
  else
    new.asset_class_code := null;
    new.asset_class_color := null;
  end if;

  return new;
end;
$$;


drop trigger if exists
  portfolio_report_items_chart_metadata_trigger
on public.portfolio_report_items;


create trigger
  portfolio_report_items_chart_metadata_trigger
before insert or update of
  instrument_id,
  asset_class_id
on public.portfolio_report_items
for each row
execute function
  private.populate_report_item_chart_metadata();


-- ============================================================
-- REPORT ITEMS ARE IMMUTABLE
-- ============================================================

drop policy if exists
  portfolio_report_items_update
on public.portfolio_report_items;

drop policy if exists
  portfolio_report_items_delete
on public.portfolio_report_items;

revoke update, delete
  on public.portfolio_report_items
  from authenticated;

grant select, insert
  on public.portfolio_report_items
  to authenticated;


-- ============================================================
-- SUPPORTING CHART INDEXES
-- ============================================================

create index
  portfolio_report_items_run_asset_class_idx
on public.portfolio_report_items (
  report_run_id,
  asset_class_code,
  market_value_base desc
);


create index
  portfolio_report_items_run_account_idx
on public.portfolio_report_items (
  report_run_id,
  account_id
);


create index
  portfolio_report_items_run_instrument_idx
on public.portfolio_report_items (
  report_run_id,
  instrument_id
);

commit;