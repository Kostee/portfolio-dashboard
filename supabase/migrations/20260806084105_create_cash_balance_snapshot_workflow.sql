begin;

-- ============================================================
-- CASH BALANCE SNAPSHOTS
-- ============================================================

create table public.cash_balance_snapshots (
  id uuid primary key
    default gen_random_uuid(),

  workspace_id uuid not null
    references public.workspaces(id)
    on delete cascade,

  account_id uuid not null,

  snapshot_date date not null,

  amount numeric(28, 10) not null,

  currency char(3) not null,

  fx_rate_to_base numeric(28, 10),

  market_value_base numeric(28, 10),

  source public.portfolio_data_source
    not null
    default 'manual',

  notes text,

  created_by uuid,

  created_at timestamptz
    not null
    default now(),

  updated_at timestamptz
    not null
    default now(),

  constraint
    cash_balance_snapshots_account_workspace_fk
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
    cash_balance_snapshots_currency_check
  check (
    currency::text ~ '^[A-Z]{3}$'
  ),

  constraint
    cash_balance_snapshots_fx_rate_check
  check (
    fx_rate_to_base is null
    or fx_rate_to_base > 0
  ),

  constraint
    cash_balance_snapshots_workspace_account_date_key
  unique (
    workspace_id,
    account_id,
    snapshot_date
  )
);

create index
  cash_balance_snapshots_workspace_date_idx
on public.cash_balance_snapshots (
  workspace_id,
  snapshot_date desc
);

create index
  cash_balance_snapshots_workspace_account_date_idx
on public.cash_balance_snapshots (
  workspace_id,
  account_id,
  snapshot_date desc
);

alter table
  public.cash_balance_snapshots
enable row level security;

create policy
  cash_balance_snapshots_select
on public.cash_balance_snapshots
for select
to authenticated
using (
  private.can_edit_workspace(
    workspace_id
  )
);

create policy
  cash_balance_snapshots_insert
on public.cash_balance_snapshots
for insert
to authenticated
with check (
  private.can_edit_workspace(
    workspace_id
  )
);

create policy
  cash_balance_snapshots_update
on public.cash_balance_snapshots
for update
to authenticated
using (
  private.can_edit_workspace(
    workspace_id
  )
)
with check (
  private.can_edit_workspace(
    workspace_id
  )
);

create policy
  cash_balance_snapshots_delete
on public.cash_balance_snapshots
for delete
to authenticated
using (
  private.can_edit_workspace(
    workspace_id
  )
);

revoke all
  on public.cash_balance_snapshots
  from anon;

grant select, insert, update, delete
  on public.cash_balance_snapshots
  to authenticated;

grant all
  on public.cash_balance_snapshots
  to service_role;


-- ============================================================
-- UPSERT CASH BALANCE SNAPSHOT
-- ============================================================

create function
  public.upsert_cash_balance_snapshot(
    p_account_id uuid,
    p_snapshot_date date,
    p_amount numeric,
    p_currency text,
    p_market_value_base numeric
      default null,
    p_notes text
      default null
  )
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_workspace_id uuid;

  v_account_currency char(3);
  v_workspace_base_currency char(3);

  v_currency char(3);

  v_market_value_base
    numeric(28, 10);

  v_fx_rate_to_base
    numeric(28, 10);

  v_notes text;

  v_snapshot_id uuid;
begin
  if auth.uid() is null then
    raise exception
      'Authentication is required.';
  end if;

  if p_account_id is null then
    raise exception
      'Account is required.';
  end if;

  if p_snapshot_date is null then
    raise exception
      'Snapshot date is required.';
  end if;

  if p_amount is null then
    raise exception
      'Cash amount is required.';
  end if;

  if p_currency is null
     or upper(
       btrim(p_currency)
     ) !~ '^[A-Z]{3}$' then
    raise exception
      'Currency must use a three-letter code.';
  end if;

  v_currency :=
    upper(
      btrim(p_currency)
    );

  v_notes :=
    nullif(
      btrim(p_notes),
      ''
    );

  select
    accounts.workspace_id,
    upper(
      accounts.base_currency
    ),
    upper(
      workspaces.base_currency
    )
  into
    v_workspace_id,
    v_account_currency,
    v_workspace_base_currency
  from public.accounts
    as accounts

  join public.workspaces
    as workspaces
    on workspaces.id =
      accounts.workspace_id

  where accounts.id =
    p_account_id

    and accounts.is_active =
      true

  limit 1;

  if v_workspace_id is null then
    raise exception
      'The selected account is unavailable.';
  end if;

  if not private.can_edit_workspace(
    v_workspace_id
  ) then
    raise exception
      'The current user cannot edit this workspace.';
  end if;

  if v_currency <>
     v_account_currency then
    raise exception
      'Snapshot currency must match the account currency.';
  end if;

  if v_currency =
     v_workspace_base_currency then
    v_market_value_base :=
      p_amount;

    v_fx_rate_to_base := 1;
  else
    v_market_value_base :=
      p_market_value_base;

    if p_amount = 0 then
      if coalesce(
        p_market_value_base,
        0
      ) <> 0 then
        raise exception
          'A zero cash balance must have a zero base-currency value.';
      end if;

      v_fx_rate_to_base := null;
    elsif p_market_value_base
          is not null then
      if sign(
        p_market_value_base
      ) <> sign(
        p_amount
      ) then
        raise exception
          'Cash amount and base-currency value must use the same sign.';
      end if;

      v_fx_rate_to_base :=
        p_market_value_base
        / p_amount;
    else
      v_fx_rate_to_base := null;
    end if;
  end if;

  insert into
    public.cash_balance_snapshots (
      workspace_id,
      account_id,
      snapshot_date,
      amount,
      currency,
      fx_rate_to_base,
      market_value_base,
      source,
      notes,
      created_by
    )
  values (
    v_workspace_id,
    p_account_id,
    p_snapshot_date,
    p_amount,
    v_currency,
    v_fx_rate_to_base,
    v_market_value_base,
    'manual',
    v_notes,
    auth.uid()
  )

  on conflict (
    workspace_id,
    account_id,
    snapshot_date
  )
  do update set
    amount =
      excluded.amount,

    currency =
      excluded.currency,

    fx_rate_to_base =
      excluded.fx_rate_to_base,

    market_value_base =
      excluded.market_value_base,

    source =
      excluded.source,

    notes =
      excluded.notes,

    updated_at =
      now()

  returning id
  into v_snapshot_id;

  return v_snapshot_id;
end;
$$;

revoke all on function
  public.upsert_cash_balance_snapshot(
    uuid,
    date,
    numeric,
    text,
    numeric,
    text
  )
from public;

grant execute on function
  public.upsert_cash_balance_snapshot(
    uuid,
    date,
    numeric,
    text,
    numeric,
    text
  )
to authenticated;


-- ============================================================
-- CASH SNAPSHOT HISTORY
-- ============================================================

create view
  public.portfolio_cash_balance_snapshot_history
with (
  security_invoker = true
)
as
select
  snapshots.workspace_id,

  snapshots.id
    as snapshot_id,

  snapshots.snapshot_date,

  snapshots.account_id,

  accounts.owner_id,
  owners.display_name
    as owner_name,

  accounts.provider_id,
  providers.name
    as provider_name,

  accounts.name
    as account_name,

  accounts.base_currency
    as account_currency,

  snapshots.amount,
  snapshots.currency,

  snapshots.fx_rate_to_base,
  snapshots.market_value_base,

  snapshots.source,
  snapshots.notes,

  snapshots.created_at,
  snapshots.updated_at

from public.cash_balance_snapshots
  as snapshots

join public.accounts
  as accounts
  on accounts.id =
    snapshots.account_id

  and accounts.workspace_id =
    snapshots.workspace_id

join public.owners
  as owners
  on owners.id =
    accounts.owner_id

  and owners.workspace_id =
    accounts.workspace_id

join public.providers
  as providers
  on providers.id =
    accounts.provider_id

  and providers.workspace_id =
    accounts.workspace_id;

revoke all
  on public.portfolio_cash_balance_snapshot_history
  from anon;

grant select
  on public.portfolio_cash_balance_snapshot_history
  to authenticated, service_role;


-- ============================================================
-- LATEST CASH SNAPSHOT PER ACCOUNT
-- ============================================================

create view
  public.portfolio_latest_cash_balance_snapshots
with (
  security_invoker = true
)
as
select distinct on (
  history.workspace_id,
  history.account_id
)
  history.*,

  min(
    history.snapshot_date
  ) over (
    partition by
      history.workspace_id,
      history.account_id
  )
  as first_snapshot_date

from
  public.portfolio_cash_balance_snapshot_history
    as history

order by
  history.workspace_id,
  history.account_id,
  history.snapshot_date desc,
  history.updated_at desc,
  history.snapshot_id desc;

revoke all
  on public.portfolio_latest_cash_balance_snapshots
  from anon;

grant select
  on public.portfolio_latest_cash_balance_snapshots
  to authenticated, service_role;

commit;