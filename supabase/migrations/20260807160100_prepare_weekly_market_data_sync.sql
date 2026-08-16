create table if not exists public.market_data_instrument_sources (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null
    references public.workspaces(id)
    on delete cascade,
  instrument_id uuid not null,
  provider text not null
    check (
      provider in (
        'eodhd',
        'alpha_vantage',
        'bitvavo'
      )
    ),
  provider_symbol text not null,
  priority smallint not null
    check (priority > 0),
  is_enabled boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint market_data_instrument_sources_instrument_workspace_fk
    foreign key (workspace_id, instrument_id)
    references public.instruments(workspace_id, id)
    on delete cascade,

  constraint market_data_instrument_sources_provider_unique
    unique (workspace_id, instrument_id, provider),

  constraint market_data_instrument_sources_priority_unique
    unique (workspace_id, instrument_id, priority)
);

create index if not exists market_data_instrument_sources_workspace_enabled_idx
  on public.market_data_instrument_sources (
    workspace_id,
    is_enabled,
    priority
  );

create table if not exists public.market_data_sync_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null
    references public.workspaces(id)
    on delete cascade,
  target_saturday date not null,
  market_data_through_date date not null,
  status text not null
    check (
      status in (
        'running',
        'completed',
        'partial',
        'failed'
      )
    ),
  trigger_source text not null default 'cron'
    check (
      trigger_source in (
        'cron',
        'manual'
      )
    ),
  instrument_success_count integer not null default 0
    check (instrument_success_count >= 0),
  instrument_failure_count integer not null default 0
    check (instrument_failure_count >= 0),
  fx_success_count integer not null default 0
    check (fx_success_count >= 0),
  fx_failure_count integer not null default 0
    check (fx_failure_count >= 0),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint market_data_sync_runs_workspace_saturday_unique
    unique (workspace_id, target_saturday)
);

create index if not exists market_data_sync_runs_workspace_date_idx
  on public.market_data_sync_runs (
    workspace_id,
    target_saturday desc
  );

create table if not exists public.market_data_sync_items (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null
    references public.market_data_sync_runs(id)
    on delete cascade,
  workspace_id uuid not null
    references public.workspaces(id)
    on delete cascade,
  item_key text not null,
  item_type text not null
    check (
      item_type in (
        'instrument',
        'fx'
      )
    ),
  instrument_id uuid,
  provider text not null,
  provider_symbol text,
  source_date date,
  value numeric(28, 12),
  currency char(3),
  status text not null
    check (
      status in (
        'success',
        'failed'
      )
    ),
  error_message text,
  raw_metadata jsonb,
  created_at timestamptz not null default now(),

  constraint market_data_sync_items_instrument_workspace_fk
    foreign key (workspace_id, instrument_id)
    references public.instruments(workspace_id, id)
    on delete cascade,

  constraint market_data_sync_items_run_key_unique
    unique (run_id, item_key),

  constraint market_data_sync_items_success_value_check
    check (
      status <> 'success'
      or (
        source_date is not null
        and value is not null
        and value >= 0
        and currency is not null
      )
    )
);

create index if not exists market_data_sync_items_workspace_instrument_idx
  on public.market_data_sync_items (
    workspace_id,
    instrument_id,
    source_date desc
  );

alter table public.market_data_instrument_sources
  enable row level security;

alter table public.market_data_sync_runs
  enable row level security;

alter table public.market_data_sync_items
  enable row level security;

drop policy if exists "Workspace members can read market data sources"
  on public.market_data_instrument_sources;

create policy "Workspace members can read market data sources"
  on public.market_data_instrument_sources
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.workspace_members wm
      where
        wm.workspace_id =
          market_data_instrument_sources.workspace_id
        and wm.user_id = auth.uid()
    )
  );

drop policy if exists "Workspace members can read market sync runs"
  on public.market_data_sync_runs;

create policy "Workspace members can read market sync runs"
  on public.market_data_sync_runs
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.workspace_members wm
      where
        wm.workspace_id =
          market_data_sync_runs.workspace_id
        and wm.user_id = auth.uid()
    )
  );

drop policy if exists "Workspace members can read market sync items"
  on public.market_data_sync_items;

create policy "Workspace members can read market sync items"
  on public.market_data_sync_items
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.workspace_members wm
      where
        wm.workspace_id =
          market_data_sync_items.workspace_id
        and wm.user_id = auth.uid()
    )
  );

revoke all
  on table public.market_data_instrument_sources
  from anon;

revoke all
  on table public.market_data_sync_runs
  from anon;

revoke all
  on table public.market_data_sync_items
  from anon;

grant select
  on table public.market_data_instrument_sources
  to authenticated;

grant select
  on table public.market_data_sync_runs
  to authenticated;

grant select
  on table public.market_data_sync_items
  to authenticated;
-- Instrument-specific provider mappings are private deployment configuration
-- and are intentionally not seeded by the public repository.
create or replace function public.get_monthly_market_proposals(
  p_workspace_id uuid,
  p_as_of_date date
)
returns table (
  account_id uuid,
  instrument_id uuid,
  owner_name text,
  provider_name text,
  account_name text,
  instrument_name text,
  instrument_ticker text,
  instrument_exchange text,
  quantity numeric,
  existing_snapshot_date date,
  existing_valuation_status text,
  quote_date date,
  unit_price numeric,
  currency text,
  quote_provider text,
  quote_provider_symbol text,
  quote_notes text,
  fx_rate_date date,
  fx_rate_to_base numeric,
  market_value numeric,
  market_value_base numeric,
  proposal_status text
)
language sql
stable
security invoker
set search_path = public
as $function$
  select
    p.account_id,
    p.instrument_id,
    o.display_name::text as owner_name,
    pr.name::text as provider_name,
    a.name::text as account_name,
    i.name::text as instrument_name,
    i.ticker::text as instrument_ticker,
    i.exchange::text as instrument_exchange,
    p.quantity::numeric,
    p.valuation_date as existing_snapshot_date,
    p.valuation_status::text
      as existing_valuation_status,
    q.price_date as quote_date,
    q.price::numeric as unit_price,
    q.currency::text as currency,
    si.provider::text as quote_provider,
    si.provider_symbol::text
      as quote_provider_symbol,
    q.notes::text as quote_notes,
    fx.rate_date as fx_rate_date,
    fx.rate::numeric as fx_rate_to_base,
    case
      when q.price is null then null
      else
        p.quantity::numeric *
        q.price::numeric
    end as market_value,
    case
      when q.price is null then null
      when q.currency = w.base_currency then
        p.quantity::numeric *
        q.price::numeric
      when fx.rate is null then null
      else
        p.quantity::numeric *
        q.price::numeric *
        fx.rate::numeric
    end as market_value_base,
    case
      when
        p.valuation_date = p_as_of_date
        and p.valuation_status = 'matched'
      then 'already_confirmed'
      when not exists (
        select 1
        from public.market_data_instrument_sources ms
        where
          ms.workspace_id = p_workspace_id
          and ms.instrument_id = p.instrument_id
          and ms.is_enabled
      )
      then 'manual_only'
      when q.price is null
      then 'missing_price'
      when p_as_of_date - q.price_date > 7
      then 'stale_price'
      when q.currency <> w.base_currency
        and fx.rate is null
      then 'missing_fx'
      when q.currency <> w.base_currency
        and p_as_of_date - fx.rate_date > 7
      then 'stale_fx'
      else 'ready'
    end::text as proposal_status
  from public.get_portfolio_unit_positions_as_of(
    p_workspace_id,
    p_as_of_date
  ) p
  join public.instruments i
    on i.workspace_id = p_workspace_id
    and i.id = p.instrument_id
  join public.accounts a
    on a.workspace_id = p_workspace_id
    and a.id = p.account_id
  join public.owners o
    on o.workspace_id = p_workspace_id
    and o.id = a.owner_id
  join public.providers pr
    on pr.workspace_id = p_workspace_id
    and pr.id = a.provider_id
  join public.workspaces w
    on w.id = p_workspace_id
  left join lateral (
    select
      ip.price_date,
      ip.price,
      ip.currency,
      ip.notes,
      ip.updated_at
    from public.instrument_prices ip
    where
      ip.workspace_id = p_workspace_id
      and ip.instrument_id = p.instrument_id
      and ip.price_date <= p_as_of_date
      and ip.source = 'automatic'
    order by
      ip.price_date desc,
      ip.updated_at desc
    limit 1
  ) q on true
  left join lateral (
    select
      er.rate_date,
      er.rate,
      er.updated_at
    from public.exchange_rates er
    where
      q.currency is not null
      and q.currency <> w.base_currency
      and er.workspace_id = p_workspace_id
      and er.from_currency = q.currency
      and er.to_currency = w.base_currency
      and er.rate_date <= p_as_of_date
      and er.source = 'automatic'
    order by
      er.rate_date desc,
      er.updated_at desc
    limit 1
  ) fx on true
  left join lateral (
    select
      mdi.provider,
      mdi.provider_symbol
    from public.market_data_sync_items mdi
    where
      mdi.workspace_id = p_workspace_id
      and mdi.instrument_id = p.instrument_id
      and mdi.item_type = 'instrument'
      and mdi.status = 'success'
      and mdi.source_date = q.price_date
    order by mdi.created_at desc
    limit 1
  ) si on true
  where
    p.quantity is not null
    and p.quantity > 0
  order by
    o.sort_order,
    a.name,
    i.name;
$function$;

revoke all
  on function public.get_monthly_market_proposals(uuid, date)
  from public;

grant execute
  on function public.get_monthly_market_proposals(uuid, date)
  to authenticated;

create or replace function public.apply_monthly_market_proposals(
  p_workspace_id uuid,
  p_as_of_date date
)
returns integer
language plpgsql
security invoker
set search_path = public
as $function$
declare
  v_proposal record;
  v_applied integer := 0;
  v_note text;
begin
  if not exists (
    select 1
    from public.workspace_members wm
    where
      wm.workspace_id = p_workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('admin', 'editor')
  ) then
    raise exception
      'You cannot apply market proposals in this workspace.';
  end if;

  for v_proposal in
    select *
    from public.get_monthly_market_proposals(
      p_workspace_id,
      p_as_of_date
    )
    where proposal_status = 'ready'
  loop
    v_note :=
      'Automatic market close accepted for monthly report. '
      || 'Quote date: '
      || v_proposal.quote_date::text
      || '; source: '
      || coalesce(
        v_proposal.quote_provider,
        'automatic'
      )
      || coalesce(
        ' (' ||
          v_proposal.quote_provider_symbol ||
          ')',
        ''
      )
      || case
        when
          v_proposal.currency <>
          (
            select base_currency
            from public.workspaces
            where id = p_workspace_id
          )
        then
          '; FX date: '
          || coalesce(
            v_proposal.fx_rate_date::text,
            'missing'
          )
          || '; FX source: NBP table A'
        else ''
      end
      || '.';

    perform public.upsert_position_snapshot(
      p_account_id =>
        v_proposal.account_id,
      p_instrument_id =>
        v_proposal.instrument_id,
      p_snapshot_date =>
        p_as_of_date,
      p_quantity =>
        v_proposal.quantity,
      p_unit_price =>
        v_proposal.unit_price,
      p_market_value =>
        v_proposal.market_value,
      p_currency =>
        v_proposal.currency,
      p_market_value_base =>
        v_proposal.market_value_base,
      p_notes =>
        v_note
    );

    v_applied := v_applied + 1;
  end loop;

  return v_applied;
end;
$function$;

revoke all
  on function public.apply_monthly_market_proposals(uuid, date)
  from public;

grant execute
  on function public.apply_monthly_market_proposals(uuid, date)
  to authenticated;
