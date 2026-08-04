begin;

-- ============================================================
-- ENUMS
-- ============================================================

create type public.workspace_role as enum (
  'admin',
  'editor',
  'viewer'
);

create type public.provider_type as enum (
  'brokerage',
  'bank',
  'fund_manager',
  'crypto_platform',
  'other'
);

create type public.account_type as enum (
  'brokerage_pln',
  'brokerage_foreign',
  'ike',
  'ikze',
  'oki',
  'ppk',
  'bonds',
  'crypto',
  'other'
);

-- ============================================================
-- ACCESS AND OWNERSHIP
-- ============================================================

create table public.profiles (
  user_id uuid primary key
    references auth.users (id)
    on delete cascade,

  display_name text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),

  name text not null
    check (btrim(name) <> ''),

  base_currency char(3) not null default 'PLN'
    check (base_currency ~ '^[A-Z]{3}$'),

  timezone text not null default 'Europe/Warsaw'
    check (btrim(timezone) <> ''),

  detailed_tracking_start_date date,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  created_by uuid
    references auth.users (id)
    on delete set null
    default auth.uid()
);

create table public.workspace_members (
  workspace_id uuid not null
    references public.workspaces (id)
    on delete cascade,

  user_id uuid not null
    references auth.users (id)
    on delete cascade,

  role public.workspace_role not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  created_by uuid
    references auth.users (id)
    on delete set null
    default auth.uid(),

  primary key (workspace_id, user_id)
);

create table public.owners (
  id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null
    references public.workspaces (id)
    on delete cascade,

  display_name text not null
    check (btrim(display_name) <> ''),

  is_active boolean not null default true,
  sort_order integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  created_by uuid
    references auth.users (id)
    on delete set null
    default auth.uid(),

  constraint owners_workspace_display_name_key
    unique (workspace_id, display_name),

  constraint owners_workspace_id_id_key
    unique (workspace_id, id)
);

-- ============================================================
-- PORTFOLIO CONFIGURATION
-- ============================================================

create table public.providers (
  id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null
    references public.workspaces (id)
    on delete cascade,

  name text not null
    check (btrim(name) <> ''),

  provider_type public.provider_type not null,

  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  created_by uuid
    references auth.users (id)
    on delete set null
    default auth.uid(),

  constraint providers_workspace_name_key
    unique (workspace_id, name),

  constraint providers_workspace_id_id_key
    unique (workspace_id, id)
);

create table public.accounts (
  id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null
    references public.workspaces (id)
    on delete cascade,

  owner_id uuid not null,
  provider_id uuid not null,

  name text not null
    check (btrim(name) <> ''),

  account_type public.account_type not null,

  base_currency char(3) not null
    check (base_currency ~ '^[A-Z]{3}$'),

  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  created_by uuid
    references auth.users (id)
    on delete set null
    default auth.uid(),

  constraint accounts_owner_workspace_fk
    foreign key (workspace_id, owner_id)
    references public.owners (workspace_id, id)
    on delete restrict,

  constraint accounts_provider_workspace_fk
    foreign key (workspace_id, provider_id)
    references public.providers (workspace_id, id)
    on delete restrict,

  constraint accounts_workspace_owner_provider_name_key
    unique (workspace_id, owner_id, provider_id, name),

  constraint accounts_workspace_id_id_key
    unique (workspace_id, id)
);

create table public.exchange_channels (
  id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null
    references public.workspaces (id)
    on delete cascade,

  name text not null
    check (btrim(name) <> ''),

  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  created_by uuid
    references auth.users (id)
    on delete set null
    default auth.uid(),

  constraint exchange_channels_workspace_name_key
    unique (workspace_id, name),

  constraint exchange_channels_workspace_id_id_key
    unique (workspace_id, id)
);

create table public.asset_classes (
  id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null
    references public.workspaces (id)
    on delete cascade,

  name text not null
    check (btrim(name) <> ''),

  color_hex char(7) not null
    check (color_hex ~ '^#[0-9A-Fa-f]{6}$'),

  sort_order integer not null default 0,
  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  created_by uuid
    references auth.users (id)
    on delete set null
    default auth.uid(),

  constraint asset_classes_workspace_name_key
    unique (workspace_id, name),

  constraint asset_classes_workspace_id_id_key
    unique (workspace_id, id)
);

create table public.instruments (
  id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null
    references public.workspaces (id)
    on delete cascade,

  name text not null
    check (btrim(name) <> ''),

  ticker text,
  exchange text,

  asset_class_id uuid not null,

  default_currency char(3) not null
    check (default_currency ~ '^[A-Z]{3}$'),

  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  created_by uuid
    references auth.users (id)
    on delete set null
    default auth.uid(),

  constraint instruments_asset_class_workspace_fk
    foreign key (workspace_id, asset_class_id)
    references public.asset_classes (workspace_id, id)
    on delete restrict,

  constraint instruments_workspace_id_id_key
    unique (workspace_id, id)
);

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.set_updated_at() from public;

create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

create trigger workspaces_set_updated_at
before update on public.workspaces
for each row
execute function public.set_updated_at();

create trigger workspace_members_set_updated_at
before update on public.workspace_members
for each row
execute function public.set_updated_at();

create trigger owners_set_updated_at
before update on public.owners
for each row
execute function public.set_updated_at();

create trigger providers_set_updated_at
before update on public.providers
for each row
execute function public.set_updated_at();

create trigger accounts_set_updated_at
before update on public.accounts
for each row
execute function public.set_updated_at();

create trigger exchange_channels_set_updated_at
before update on public.exchange_channels
for each row
execute function public.set_updated_at();

create trigger asset_classes_set_updated_at
before update on public.asset_classes
for each row
execute function public.set_updated_at();

create trigger instruments_set_updated_at
before update on public.instruments
for each row
execute function public.set_updated_at();

-- ============================================================
-- PROFILE CREATION FOR AUTH USERS
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (
    user_id,
    display_name
  )
  values (
    new.id,
    coalesce(
      nullif(
        btrim(new.raw_user_meta_data ->> 'display_name'),
        ''
      ),
      nullif(
        split_part(coalesce(new.email, ''), '@', 1),
        ''
      )
    )
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

-- The test user already exists, so create a profile for existing users too.
insert into public.profiles (
  user_id,
  display_name
)
select
  users.id,
  coalesce(
    nullif(
      btrim(users.raw_user_meta_data ->> 'display_name'),
      ''
    ),
    nullif(
      split_part(coalesce(users.email, ''), '@', 1),
      ''
    )
  )
from auth.users as users
on conflict (user_id) do nothing;

-- ============================================================
-- PRIVATE AUTHORIZATION HELPERS
-- ============================================================

create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to authenticated;
grant usage on schema private to service_role;

create or replace function private.current_workspace_role(
  p_workspace_id uuid
)
returns public.workspace_role
language sql
stable
security definer
set search_path = ''
as $$
  select members.role
  from public.workspace_members as members
  where members.workspace_id = p_workspace_id
    and members.user_id = (select auth.uid())
  limit 1;
$$;

create or replace function private.is_workspace_member(
  p_workspace_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select auth.uid()) is not null
    and private.current_workspace_role(p_workspace_id) is not null;
$$;

create or replace function private.can_edit_workspace(
  p_workspace_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    private.current_workspace_role(p_workspace_id)::text
      in ('admin', 'editor'),
    false
  );
$$;

create or replace function private.is_workspace_admin(
  p_workspace_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    private.current_workspace_role(p_workspace_id)::text = 'admin',
    false
  );
$$;

revoke all on function private.current_workspace_role(uuid) from public;
revoke all on function private.is_workspace_member(uuid) from public;
revoke all on function private.can_edit_workspace(uuid) from public;
revoke all on function private.is_workspace_admin(uuid) from public;

grant execute on function private.current_workspace_role(uuid)
  to authenticated, service_role;

grant execute on function private.is_workspace_member(uuid)
  to authenticated, service_role;

grant execute on function private.can_edit_workspace(uuid)
  to authenticated, service_role;

grant execute on function private.is_workspace_admin(uuid)
  to authenticated, service_role;

-- ============================================================
-- SECURE WORKSPACE BOOTSTRAP
-- ============================================================

create or replace function public.create_workspace(
  p_name text,
  p_base_currency text default 'PLN',
  p_timezone text default 'Europe/Warsaw',
  p_detailed_tracking_start_date date default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_workspace_id uuid;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  if p_name is null or btrim(p_name) = '' then
    raise exception 'Workspace name is required.';
  end if;

  if p_base_currency is null
     or upper(btrim(p_base_currency)) !~ '^[A-Z]{3}$' then
    raise exception 'Base currency must use a three-letter code.';
  end if;

  if p_timezone is null or btrim(p_timezone) = '' then
    raise exception 'Timezone is required.';
  end if;

  insert into public.workspaces (
    name,
    base_currency,
    timezone,
    detailed_tracking_start_date,
    created_by
  )
  values (
    btrim(p_name),
    upper(btrim(p_base_currency)),
    btrim(p_timezone),
    p_detailed_tracking_start_date,
    v_user_id
  )
  returning id into v_workspace_id;

  insert into public.workspace_members (
    workspace_id,
    user_id,
    role,
    created_by
  )
  values (
    v_workspace_id,
    v_user_id,
    'admin',
    v_user_id
  );

  return v_workspace_id;
end;
$$;

revoke all on function public.create_workspace(
  text,
  text,
  text,
  date
) from public;

grant execute on function public.create_workspace(
  text,
  text,
  text,
  date
) to authenticated;

-- ============================================================
-- INDEXES
-- ============================================================

create index workspace_members_user_workspace_idx
  on public.workspace_members (user_id, workspace_id);

create index owners_workspace_active_sort_idx
  on public.owners (workspace_id, is_active, sort_order);

create index providers_workspace_active_idx
  on public.providers (workspace_id, is_active);

create index accounts_workspace_owner_idx
  on public.accounts (workspace_id, owner_id);

create index accounts_workspace_provider_idx
  on public.accounts (workspace_id, provider_id);

create index accounts_workspace_type_idx
  on public.accounts (workspace_id, account_type);

create index accounts_workspace_active_idx
  on public.accounts (workspace_id, is_active);

create index exchange_channels_workspace_active_idx
  on public.exchange_channels (workspace_id, is_active);

create index asset_classes_workspace_active_sort_idx
  on public.asset_classes (workspace_id, is_active, sort_order);

create index instruments_workspace_asset_class_idx
  on public.instruments (workspace_id, asset_class_id);

create index instruments_workspace_ticker_idx
  on public.instruments (workspace_id, ticker);

create index instruments_workspace_active_idx
  on public.instruments (workspace_id, is_active);

create index instruments_workspace_name_idx
  on public.instruments (workspace_id, name);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.owners enable row level security;
alter table public.providers enable row level security;
alter table public.accounts enable row level security;
alter table public.exchange_channels enable row level security;
alter table public.asset_classes enable row level security;
alter table public.instruments enable row level security;

-- Profiles

create policy "Users can read their own profile"
on public.profiles
for select
to authenticated
using (
  (select auth.uid()) is not null
  and user_id = (select auth.uid())
);

create policy "Users can update their own profile"
on public.profiles
for update
to authenticated
using (
  (select auth.uid()) is not null
  and user_id = (select auth.uid())
)
with check (
  (select auth.uid()) is not null
  and user_id = (select auth.uid())
);

-- Workspaces

create policy "Members can read their workspaces"
on public.workspaces
for select
to authenticated
using (
  private.is_workspace_member(id)
);

create policy "Admins can update their workspaces"
on public.workspaces
for update
to authenticated
using (
  private.is_workspace_admin(id)
)
with check (
  private.is_workspace_admin(id)
);

-- Workspace members

create policy "Members can read workspace membership"
on public.workspace_members
for select
to authenticated
using (
  private.is_workspace_member(workspace_id)
);

create policy "Admins can add workspace members"
on public.workspace_members
for insert
to authenticated
with check (
  private.is_workspace_admin(workspace_id)
);

create policy "Admins can update workspace members"
on public.workspace_members
for update
to authenticated
using (
  private.is_workspace_admin(workspace_id)
)
with check (
  private.is_workspace_admin(workspace_id)
);

create policy "Admins can remove workspace members"
on public.workspace_members
for delete
to authenticated
using (
  private.is_workspace_admin(workspace_id)
);

-- Owners

create policy "Members can read owners"
on public.owners
for select
to authenticated
using (
  private.is_workspace_member(workspace_id)
);

create policy "Editors can manage owners"
on public.owners
for all
to authenticated
using (
  private.can_edit_workspace(workspace_id)
)
with check (
  private.can_edit_workspace(workspace_id)
);

-- Providers

create policy "Members can read providers"
on public.providers
for select
to authenticated
using (
  private.is_workspace_member(workspace_id)
);

create policy "Editors can manage providers"
on public.providers
for all
to authenticated
using (
  private.can_edit_workspace(workspace_id)
)
with check (
  private.can_edit_workspace(workspace_id)
);

-- Accounts

create policy "Members can read accounts"
on public.accounts
for select
to authenticated
using (
  private.is_workspace_member(workspace_id)
);

create policy "Editors can manage accounts"
on public.accounts
for all
to authenticated
using (
  private.can_edit_workspace(workspace_id)
)
with check (
  private.can_edit_workspace(workspace_id)
);

-- Exchange channels

create policy "Members can read exchange channels"
on public.exchange_channels
for select
to authenticated
using (
  private.is_workspace_member(workspace_id)
);

create policy "Editors can manage exchange channels"
on public.exchange_channels
for all
to authenticated
using (
  private.can_edit_workspace(workspace_id)
)
with check (
  private.can_edit_workspace(workspace_id)
);

-- Asset classes

create policy "Members can read asset classes"
on public.asset_classes
for select
to authenticated
using (
  private.is_workspace_member(workspace_id)
);

create policy "Editors can manage asset classes"
on public.asset_classes
for all
to authenticated
using (
  private.can_edit_workspace(workspace_id)
)
with check (
  private.can_edit_workspace(workspace_id)
);

-- Instruments

create policy "Members can read instruments"
on public.instruments
for select
to authenticated
using (
  private.is_workspace_member(workspace_id)
);

create policy "Editors can manage instruments"
on public.instruments
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

revoke all on public.profiles from anon;
revoke all on public.workspaces from anon;
revoke all on public.workspace_members from anon;
revoke all on public.owners from anon;
revoke all on public.providers from anon;
revoke all on public.accounts from anon;
revoke all on public.exchange_channels from anon;
revoke all on public.asset_classes from anon;
revoke all on public.instruments from anon;

grant select, update
  on public.profiles
  to authenticated;

grant select, update
  on public.workspaces
  to authenticated;

grant select, insert, update, delete
  on public.workspace_members
  to authenticated;

grant select, insert, update, delete
  on public.owners
  to authenticated;

grant select, insert, update, delete
  on public.providers
  to authenticated;

grant select, insert, update, delete
  on public.accounts
  to authenticated;

grant select, insert, update, delete
  on public.exchange_channels
  to authenticated;

grant select, insert, update, delete
  on public.asset_classes
  to authenticated;

grant select, insert, update, delete
  on public.instruments
  to authenticated;

grant all on public.profiles to service_role;
grant all on public.workspaces to service_role;
grant all on public.workspace_members to service_role;
grant all on public.owners to service_role;
grant all on public.providers to service_role;
grant all on public.accounts to service_role;
grant all on public.exchange_channels to service_role;
grant all on public.asset_classes to service_role;
grant all on public.instruments to service_role;

grant usage on type public.workspace_role
  to authenticated, service_role;

grant usage on type public.provider_type
  to authenticated, service_role;

grant usage on type public.account_type
  to authenticated, service_role;

commit;