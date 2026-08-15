begin;

-- ============================================================
-- GOVERNMENT BOND VALUATION CONFIGURATION
-- ============================================================
--
-- This table stores private per-position configuration.
-- The public repository contains the schema only.
-- Actual bond series, purchase dates and quantities MUST NOT
-- be seeded in migrations or committed to source control.
-- ============================================================

create table public.government_bond_valuation_configs (
  id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null
    references public.workspaces(id)
    on delete cascade,

  account_id uuid not null,

  instrument_id uuid not null,

  product_type text not null
    check (
      product_type in ('edo')
    ),

  series_code text not null
    check (
      series_code ~ '^[A-Z]{3}[0-9]{4}$'
    ),

  purchase_date date not null,

  maturity_date date not null,

  nominal_value numeric(28, 10)
    not null default 100
    check (nominal_value > 0),

  -- Decimal rate, e.g. 0.068 = 6.80%.
  first_period_rate numeric(18, 12)
    not null
    check (first_period_rate >= 0),

  -- Decimal margin, e.g. 0.020 = 2.00%.
  margin_rate numeric(18, 12)
    not null
    check (margin_rate >= 0),

  -- Normally NULL: quantity is read from the portfolio ledger.
  -- Can support a specific lot in the future.
  quantity_override numeric(28, 10)
    check (
      quantity_override is null
      or quantity_override > 0
    ),

  is_active boolean
    not null default true,

  notes text
    check (
      notes is null
      or btrim(notes) <> ''
    ),

  created_at timestamptz
    not null default now(),

  updated_at timestamptz
    not null default now(),

  constraint
    government_bond_configs_account_workspace_fk
    foreign key (
      workspace_id,
      account_id
    )
    references public.accounts (
      workspace_id,
      id
    )
    on delete cascade,

  constraint
    government_bond_configs_instrument_workspace_fk
    foreign key (
      workspace_id,
      instrument_id
    )
    references public.instruments (
      workspace_id,
      id
    )
    on delete cascade,

  constraint
    government_bond_configs_dates_check
    check (
      maturity_date >
      purchase_date
    ),

  constraint
    government_bond_configs_position_unique
    unique (
      workspace_id,
      account_id,
      instrument_id,
      purchase_date
    )
);

create index
  government_bond_configs_workspace_active_idx
on public.government_bond_valuation_configs (
  workspace_id,
  is_active
);

create trigger
  government_bond_valuation_configs_set_updated_at
before update
on public.government_bond_valuation_configs
for each row
execute function public.set_updated_at();


-- ============================================================
-- INTEREST PERIOD RATE CACHE
-- ============================================================
--
-- Annual rates obtained from official data are cached here.
-- This makes calculations deterministic and auditable.
-- ============================================================

create table public.government_bond_interest_period_rates (
  id uuid primary key default gen_random_uuid(),

  config_id uuid not null
    references
      public.government_bond_valuation_configs(id)
    on delete cascade,

  period_number integer not null
    check (
      period_number >= 1
      and period_number <= 12
    ),

  period_start date not null,

  period_end date not null,

  annual_rate numeric(18, 12)
    not null
    check (annual_rate >= 0),

  inflation_rate numeric(18, 12)
    check (
      inflation_rate is null
      or inflation_rate >= 0
    ),

  rate_source text not null
    check (
      rate_source in (
        'configured',
        'gus'
      )
    ),

  source_reference text,

  created_at timestamptz
    not null default now(),

  updated_at timestamptz
    not null default now(),

  constraint
    government_bond_period_rates_dates_check
    check (
      period_end >
      period_start
    ),

  constraint
    government_bond_period_rates_unique
    unique (
      config_id,
      period_number
    )
);

create trigger
  government_bond_interest_period_rates_set_updated_at
before update
on public.government_bond_interest_period_rates
for each row
execute function public.set_updated_at();


-- ============================================================
-- AUTOMATIC VALUATION RUN AUDIT
-- ============================================================

create table public.government_bond_valuation_runs (
  id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null
    references public.workspaces(id)
    on delete cascade,

  valuation_date date not null,

  status text not null
    check (
      status in (
        'running',
        'completed',
        'partial',
        'failed'
      )
    ),

  trigger_source text
    not null default 'cron'
    check (
      trigger_source in (
        'cron',
        'manual'
      )
    ),

  success_count integer
    not null default 0
    check (success_count >= 0),

  failure_count integer
    not null default 0
    check (failure_count >= 0),

  notes text,

  started_at timestamptz
    not null default now(),

  completed_at timestamptz,

  created_at timestamptz
    not null default now(),

  updated_at timestamptz
    not null default now(),

  constraint
    government_bond_valuation_runs_unique
    unique (
      workspace_id,
      valuation_date
    )
);

create trigger
  government_bond_valuation_runs_set_updated_at
before update
on public.government_bond_valuation_runs
for each row
execute function public.set_updated_at();


-- ============================================================
-- PRIVATE ACCESS
-- ============================================================
--
-- Configuration contains private portfolio information.
-- It is intentionally unavailable to anon/authenticated users.
-- Edge Functions access it only through service_role.
-- ============================================================

alter table
  public.government_bond_valuation_configs
enable row level security;

alter table
  public.government_bond_interest_period_rates
enable row level security;

alter table
  public.government_bond_valuation_runs
enable row level security;

revoke all
  on table
    public.government_bond_valuation_configs,
    public.government_bond_interest_period_rates,
    public.government_bond_valuation_runs
  from anon, authenticated;

grant select, insert, update, delete
  on table
    public.government_bond_valuation_configs,
    public.government_bond_interest_period_rates
  to service_role;

grant select, insert, update
  on table
    public.government_bond_valuation_runs
  to service_role;

-- Required by the Edge Function.
grant select
  on table public.workspaces
  to service_role;

-- Existing weekly sync only needed SELECT here.
-- Bond valuation additionally persists automatic snapshots.
grant select, insert, update
  on table public.position_snapshots
  to service_role;

grant execute
  on function
    public.get_portfolio_unit_positions_as_of(
      uuid,
      date
    )
  to service_role;

commit;