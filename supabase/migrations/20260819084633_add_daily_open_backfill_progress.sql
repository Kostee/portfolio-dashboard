-- ============================================================
-- DAILY MARKET OPEN HISTORICAL BACKFILL PROGRESS
-- ============================================================

create table public.daily_market_open_backfill_progress (
  id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null
    references public.workspaces(id)
    on delete cascade,

  instrument_id uuid not null
    references public.instruments(id)
    on delete cascade,

  provider text not null
    check (
      provider in (
        'eodhd',
        'twelve_data'
      )
    ),

  provider_symbol text not null
    check (
      btrim(
        provider_symbol
      ) <> ''
    ),

  coverage_start_date date,
  coverage_end_date date,

  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  completed_at timestamptz,

  created_at timestamptz not null
    default now(),

  updated_at timestamptz not null
    default now(),

  constraint daily_market_open_backfill_progress_workspace_instrument_key
    unique (
      workspace_id,
      instrument_id
    )
);

create index daily_market_open_backfill_progress_workspace_attempt_idx
  on public.daily_market_open_backfill_progress (
    workspace_id,
    completed_at,
    last_attempt_at
  );

alter table public.daily_market_open_backfill_progress
  enable row level security;

revoke all
  on public.daily_market_open_backfill_progress
  from anon, authenticated;

grant all
  on public.daily_market_open_backfill_progress
  to service_role;

comment on table public.daily_market_open_backfill_progress is
  'Service-only progress for immutable historical daily-open backfill. Existing open-price rows are never overwritten.';
