begin;

-- ============================================================
-- ENUMS
-- ============================================================

create type public.portfolio_operation_type as enum (
  'opening_position',
  'deposit',
  'withdrawal',
  'internal_transfer',
  'currency_exchange',
  'buy',
  'sell',
  'dividend',
  'interest',
  'fee',
  'tax',
  'balance_adjustment',
  'quantity_adjustment',
  'other'
);

create type public.portfolio_operation_status as enum (
  'draft',
  'posted',
  'voided'
);

create type public.portfolio_operation_component as enum (
  'principal',
  'fee',
  'tax',
  'income',
  'transfer',
  'adjustment'
);

create type public.portfolio_data_source as enum (
  'manual',
  'import',
  'market_data',
  'broker_sync',
  'system'
);

-- ============================================================
-- PORTFOLIO OPERATIONS
-- ============================================================

create table public.portfolio_operations (
  id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null
    references public.workspaces (id)
    on delete cascade,

  operation_date date not null,

  executed_at timestamptz,

  operation_type public.portfolio_operation_type not null,

  status public.portfolio_operation_status
    not null default 'posted',

  source public.portfolio_data_source
    not null default 'manual',

  description text
    check (
      description is null
      or btrim(description) <> ''
    ),

  notes text
    check (
      notes is null
      or btrim(notes) <> ''
    ),

  external_reference text
    check (
      external_reference is null
      or btrim(external_reference) <> ''
    ),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  created_by uuid
    references auth.users (id)
    on delete set null
    default auth.uid(),

  constraint portfolio_operations_workspace_id_id_key
    unique (workspace_id, id)
);

-- ============================================================
-- OPERATION ENTRIES
-- ============================================================

create table public.portfolio_operation_entries (
  id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null,

  operation_id uuid not null,

  sequence_no smallint not null default 1
    check (sequence_no > 0),

  account_id uuid not null,

  instrument_id uuid,

  component public.portfolio_operation_component
    not null default 'principal',

  quantity_delta numeric(28, 10)
    not null default 0,

  cash_delta numeric(28, 10)
    not null default 0,

  value_delta numeric(28, 10)
    not null default 0,

  currency char(3) not null
    check (currency ~ '^[A-Z]{3}$'),

  unit_price numeric(28, 10)
    check (
      unit_price is null
      or unit_price > 0
    ),

  fx_rate_to_base numeric(28, 10)
    check (
      fx_rate_to_base is null
      or fx_rate_to_base > 0
    ),

  base_cash_delta numeric(28, 10),

  base_value_delta numeric(28, 10),

  memo text
    check (
      memo is null
      or btrim(memo) <> ''
    ),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  created_by uuid
    references auth.users (id)
    on delete set null
    default auth.uid(),

  constraint portfolio_operation_entries_operation_workspace_fk
    foreign key (workspace_id, operation_id)
    references public.portfolio_operations (workspace_id, id)
    on delete cascade,

  constraint portfolio_operation_entries_account_workspace_fk
    foreign key (workspace_id, account_id)
    references public.accounts (workspace_id, id)
    on delete restrict,

  constraint portfolio_operation_entries_instrument_workspace_fk
    foreign key (workspace_id, instrument_id)
    references public.instruments (workspace_id, id)
    on delete restrict,

  constraint portfolio_operation_entries_has_effect_check
    check (
      quantity_delta <> 0
      or cash_delta <> 0
      or value_delta <> 0
    ),

  constraint portfolio_operation_entries_instrument_effect_check
    check (
      instrument_id is not null
      or (
        quantity_delta = 0
        and value_delta = 0
      )
    ),

  constraint portfolio_operation_entries_operation_sequence_key
    unique (operation_id, sequence_no)
);

-- ============================================================
-- HISTORICAL EXCHANGE RATES
-- ============================================================

create table public.exchange_rates (
  id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null
    references public.workspaces (id)
    on delete cascade,

  rate_date date not null,

  from_currency char(3) not null
    check (from_currency ~ '^[A-Z]{3}$'),

  to_currency char(3) not null
    check (to_currency ~ '^[A-Z]{3}$'),

  rate numeric(28, 10) not null
    check (rate > 0),

  source public.portfolio_data_source
    not null default 'manual',

  notes text
    check (
      notes is null
      or btrim(notes) <> ''
    ),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  created_by uuid
    references auth.users (id)
    on delete set null
    default auth.uid(),

  constraint exchange_rates_currency_pair_check
    check (from_currency <> to_currency),

  constraint exchange_rates_workspace_date_pair_key
    unique (
      workspace_id,
      rate_date,
      from_currency,
      to_currency
    )
);

-- ============================================================
-- INSTRUMENT PRICE HISTORY
-- ============================================================

create table public.instrument_prices (
  id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null,

  instrument_id uuid not null,

  price_date date not null,

  price numeric(28, 10) not null
    check (price >= 0),

  currency char(3) not null
    check (currency ~ '^[A-Z]{3}$'),

  source public.portfolio_data_source
    not null default 'manual',

  notes text
    check (
      notes is null
      or btrim(notes) <> ''
    ),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  created_by uuid
    references auth.users (id)
    on delete set null
    default auth.uid(),

  constraint instrument_prices_instrument_workspace_fk
    foreign key (workspace_id, instrument_id)
    references public.instruments (workspace_id, id)
    on delete cascade,

  constraint instrument_prices_workspace_instrument_date_currency_key
    unique (
      workspace_id,
      instrument_id,
      price_date,
      currency
    )
);

-- ============================================================
-- POSITION SNAPSHOTS
-- ============================================================

create table public.position_snapshots (
  id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null,

  account_id uuid not null,

  instrument_id uuid not null,

  snapshot_date date not null,

  quantity numeric(28, 10),

  unit_price numeric(28, 10)
    check (
      unit_price is null
      or unit_price >= 0
    ),

  market_value numeric(28, 10) not null
    check (market_value >= 0),

  currency char(3) not null
    check (currency ~ '^[A-Z]{3}$'),

  fx_rate_to_base numeric(28, 10)
    check (
      fx_rate_to_base is null
      or fx_rate_to_base > 0
    ),

  market_value_base numeric(28, 10)
    check (
      market_value_base is null
      or market_value_base >= 0
    ),

  source public.portfolio_data_source
    not null default 'manual',

  notes text
    check (
      notes is null
      or btrim(notes) <> ''
    ),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  created_by uuid
    references auth.users (id)
    on delete set null
    default auth.uid(),

  constraint position_snapshots_account_workspace_fk
    foreign key (workspace_id, account_id)
    references public.accounts (workspace_id, id)
    on delete restrict,

  constraint position_snapshots_instrument_workspace_fk
    foreign key (workspace_id, instrument_id)
    references public.instruments (workspace_id, id)
    on delete restrict,

  constraint position_snapshots_workspace_position_date_key
    unique (
      workspace_id,
      account_id,
      instrument_id,
      snapshot_date
    )
);

-- ============================================================
-- UPDATED_AT TRIGGERS
-- ============================================================

create trigger portfolio_operations_set_updated_at
before update on public.portfolio_operations
for each row
execute function public.set_updated_at();

create trigger portfolio_operation_entries_set_updated_at
before update on public.portfolio_operation_entries
for each row
execute function public.set_updated_at();

create trigger exchange_rates_set_updated_at
before update on public.exchange_rates
for each row
execute function public.set_updated_at();

create trigger instrument_prices_set_updated_at
before update on public.instrument_prices
for each row
execute function public.set_updated_at();

create trigger position_snapshots_set_updated_at
before update on public.position_snapshots
for each row
execute function public.set_updated_at();

-- ============================================================
-- INDEXES
-- ============================================================

create index portfolio_operations_workspace_date_idx
  on public.portfolio_operations (
    workspace_id,
    operation_date desc
  );

create index portfolio_operations_workspace_status_date_idx
  on public.portfolio_operations (
    workspace_id,
    status,
    operation_date desc
  );

create index portfolio_operations_workspace_type_date_idx
  on public.portfolio_operations (
    workspace_id,
    operation_type,
    operation_date desc
  );

create unique index portfolio_operations_external_reference_key
  on public.portfolio_operations (
    workspace_id,
    source,
    external_reference
  )
  where external_reference is not null;

create index portfolio_operation_entries_operation_idx
  on public.portfolio_operation_entries (
    operation_id,
    sequence_no
  );

create index portfolio_operation_entries_account_idx
  on public.portfolio_operation_entries (
    workspace_id,
    account_id
  );

create index portfolio_operation_entries_instrument_idx
  on public.portfolio_operation_entries (
    workspace_id,
    instrument_id
  )
  where instrument_id is not null;

create index exchange_rates_workspace_date_idx
  on public.exchange_rates (
    workspace_id,
    rate_date desc
  );

create index instrument_prices_workspace_date_idx
  on public.instrument_prices (
    workspace_id,
    price_date desc
  );

create index instrument_prices_instrument_date_idx
  on public.instrument_prices (
    workspace_id,
    instrument_id,
    price_date desc
  );

create index position_snapshots_workspace_date_idx
  on public.position_snapshots (
    workspace_id,
    snapshot_date desc
  );

create index position_snapshots_account_date_idx
  on public.position_snapshots (
    workspace_id,
    account_id,
    snapshot_date desc
  );

create index position_snapshots_instrument_date_idx
  on public.position_snapshots (
    workspace_id,
    instrument_id,
    snapshot_date desc
  );

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.portfolio_operations
  enable row level security;

alter table public.portfolio_operation_entries
  enable row level security;

alter table public.exchange_rates
  enable row level security;

alter table public.instrument_prices
  enable row level security;

alter table public.position_snapshots
  enable row level security;

create policy "Members can read portfolio operations"
on public.portfolio_operations
for select
to authenticated
using (
  private.is_workspace_member(workspace_id)
);

create policy "Editors can manage portfolio operations"
on public.portfolio_operations
for all
to authenticated
using (
  private.can_edit_workspace(workspace_id)
)
with check (
  private.can_edit_workspace(workspace_id)
);

create policy "Members can read portfolio operation entries"
on public.portfolio_operation_entries
for select
to authenticated
using (
  private.is_workspace_member(workspace_id)
);

create policy "Editors can manage portfolio operation entries"
on public.portfolio_operation_entries
for all
to authenticated
using (
  private.can_edit_workspace(workspace_id)
)
with check (
  private.can_edit_workspace(workspace_id)
);

create policy "Members can read exchange rates"
on public.exchange_rates
for select
to authenticated
using (
  private.is_workspace_member(workspace_id)
);

create policy "Editors can manage exchange rates"
on public.exchange_rates
for all
to authenticated
using (
  private.can_edit_workspace(workspace_id)
)
with check (
  private.can_edit_workspace(workspace_id)
);

create policy "Members can read instrument prices"
on public.instrument_prices
for select
to authenticated
using (
  private.is_workspace_member(workspace_id)
);

create policy "Editors can manage instrument prices"
on public.instrument_prices
for all
to authenticated
using (
  private.can_edit_workspace(workspace_id)
)
with check (
  private.can_edit_workspace(workspace_id)
);

create policy "Members can read position snapshots"
on public.position_snapshots
for select
to authenticated
using (
  private.is_workspace_member(workspace_id)
);

create policy "Editors can manage position snapshots"
on public.position_snapshots
for all
to authenticated
using (
  private.can_edit_workspace(workspace_id)
)
with check (
  private.can_edit_workspace(workspace_id)
);

-- ============================================================
-- DATABASE PRIVILEGES
-- ============================================================

revoke all on public.portfolio_operations from anon;
revoke all on public.portfolio_operation_entries from anon;
revoke all on public.exchange_rates from anon;
revoke all on public.instrument_prices from anon;
revoke all on public.position_snapshots from anon;

grant select, insert, update, delete
  on public.portfolio_operations
  to authenticated;

grant select, insert, update, delete
  on public.portfolio_operation_entries
  to authenticated;

grant select, insert, update, delete
  on public.exchange_rates
  to authenticated;

grant select, insert, update, delete
  on public.instrument_prices
  to authenticated;

grant select, insert, update, delete
  on public.position_snapshots
  to authenticated;

grant all on public.portfolio_operations
  to service_role;

grant all on public.portfolio_operation_entries
  to service_role;

grant all on public.exchange_rates
  to service_role;

grant all on public.instrument_prices
  to service_role;

grant all on public.position_snapshots
  to service_role;

grant usage on type public.portfolio_operation_type
  to authenticated, service_role;

grant usage on type public.portfolio_operation_status
  to authenticated, service_role;

grant usage on type public.portfolio_operation_component
  to authenticated, service_role;

grant usage on type public.portfolio_data_source
  to authenticated, service_role;

commit;