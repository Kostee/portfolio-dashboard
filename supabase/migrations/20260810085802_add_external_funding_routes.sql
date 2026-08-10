begin;

-- ============================================================
-- EXTERNAL FUNDING ROUTES
-- ============================================================

create table public.portfolio_funding_routes (
  id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null
    references public.workspaces(id)
    on delete cascade,

  owner_id uuid not null,

  contribution_date date not null,

  contribution_executed_at timestamptz,

  contribution_amount_base numeric(28, 10)
    not null
    check (contribution_amount_base > 0),

  base_currency char(3) not null
    check (base_currency ~ '^[A-Z]{3}$'),

  destination_account_id uuid not null,

  status text not null default 'in_transit'
    check (
      status in (
        'in_transit',
        'completed',
        'cancelled'
      )
    ),

  completed_at timestamptz,

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

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  created_by uuid
    references auth.users(id)
    on delete set null
    default auth.uid(),

  constraint portfolio_funding_routes_owner_fk
    foreign key (
      workspace_id,
      owner_id
    )
    references public.owners(
      workspace_id,
      id
    )
    on delete restrict,

  constraint portfolio_funding_routes_destination_account_fk
    foreign key (
      workspace_id,
      destination_account_id
    )
    references public.accounts(
      workspace_id,
      id
    )
    on delete restrict,

  constraint portfolio_funding_routes_workspace_id_id_key
    unique (
      workspace_id,
      id
    )
);

comment on table public.portfolio_funding_routes is
  'Tracks one external portfolio contribution through off-portfolio FX/transfer channels until it reaches a tracked destination account.';

comment on column
  public.portfolio_funding_routes.contribution_amount_base
is
  'External contribution measured in the workspace base currency at the moment money leaves the owner private funds for the portfolio funding route.';


-- ============================================================
-- FUNDING ROUTE STEPS
-- ============================================================

create table public.portfolio_funding_route_steps (
  id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null,

  funding_route_id uuid not null,

  sequence_no smallint not null
    check (sequence_no > 0),

  step_date date not null,

  occurred_at timestamptz,

  step_type text not null
    check (
      step_type in (
        'exchange',
        'transfer',
        'arrival',
        'other'
      )
    ),

  exchange_channel_id uuid,

  from_location text
    check (
      from_location is null
      or btrim(from_location) <> ''
    ),

  to_location text
    check (
      to_location is null
      or btrim(to_location) <> ''
    ),

  from_amount numeric(28, 10)
    check (
      from_amount is null
      or from_amount > 0
    ),

  from_currency char(3)
    check (
      from_currency is null
      or from_currency ~ '^[A-Z]{3}$'
    ),

  to_amount numeric(28, 10)
    check (
      to_amount is null
      or to_amount > 0
    ),

  to_currency char(3)
    check (
      to_currency is null
      or to_currency ~ '^[A-Z]{3}$'
    ),

  fee_amount numeric(28, 10)
    check (
      fee_amount is null
      or fee_amount >= 0
    ),

  fee_currency char(3)
    check (
      fee_currency is null
      or fee_currency ~ '^[A-Z]{3}$'
    ),

  notes text
    check (
      notes is null
      or btrim(notes) <> ''
    ),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  created_by uuid
    references auth.users(id)
    on delete set null
    default auth.uid(),

  constraint portfolio_funding_route_steps_route_fk
    foreign key (
      workspace_id,
      funding_route_id
    )
    references public.portfolio_funding_routes(
      workspace_id,
      id
    )
    on delete cascade,

  constraint portfolio_funding_route_steps_channel_fk
    foreign key (
      workspace_id,
      exchange_channel_id
    )
    references public.exchange_channels(
      workspace_id,
      id
    )
    on delete restrict,

  constraint portfolio_funding_route_steps_sequence_key
    unique (
      funding_route_id,
      sequence_no
    )
);


-- ============================================================
-- LINK NORMAL LEDGER OPERATIONS TO A FUNDING ROUTE
-- ============================================================

alter table public.portfolio_operations
  add column funding_route_id uuid;

alter table public.portfolio_operations
  add constraint portfolio_operations_funding_route_fk
  foreign key (
    workspace_id,
    funding_route_id
  )
  references public.portfolio_funding_routes(
    workspace_id,
    id
  )
  on delete restrict;

create index portfolio_operations_funding_route_idx
  on public.portfolio_operations(
    funding_route_id
  )
  where funding_route_id is not null;

-- One posted destination deposit per route.
-- Trades linked to the same route may be numerous.
create unique index
  portfolio_operations_funding_route_deposit_key
on public.portfolio_operations(
  funding_route_id
)
where
  funding_route_id is not null
  and operation_type =
    'deposit'::public.portfolio_operation_type
  and status =
    'posted'::public.portfolio_operation_status;


-- ============================================================
-- UPDATED_AT
-- ============================================================

create trigger portfolio_funding_routes_set_updated_at
before update on public.portfolio_funding_routes
for each row
execute function public.set_updated_at();

create trigger portfolio_funding_route_steps_set_updated_at
before update on public.portfolio_funding_route_steps
for each row
execute function public.set_updated_at();


-- ============================================================
-- RLS
-- ============================================================

alter table public.portfolio_funding_routes
  enable row level security;

alter table public.portfolio_funding_route_steps
  enable row level security;

create policy portfolio_funding_routes_select
on public.portfolio_funding_routes
for select
to authenticated
using (
  private.is_workspace_member(
    workspace_id
  )
);

create policy portfolio_funding_routes_insert
on public.portfolio_funding_routes
for insert
to authenticated
with check (
  private.can_edit_workspace(
    workspace_id
  )
);

create policy portfolio_funding_routes_update
on public.portfolio_funding_routes
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

create policy portfolio_funding_routes_delete
on public.portfolio_funding_routes
for delete
to authenticated
using (
  private.can_edit_workspace(
    workspace_id
  )
);

create policy portfolio_funding_route_steps_select
on public.portfolio_funding_route_steps
for select
to authenticated
using (
  private.is_workspace_member(
    workspace_id
  )
);

create policy portfolio_funding_route_steps_insert
on public.portfolio_funding_route_steps
for insert
to authenticated
with check (
  private.can_edit_workspace(
    workspace_id
  )
);

create policy portfolio_funding_route_steps_update
on public.portfolio_funding_route_steps
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

create policy portfolio_funding_route_steps_delete
on public.portfolio_funding_route_steps
for delete
to authenticated
using (
  private.can_edit_workspace(
    workspace_id
  )
);

grant select, insert, update, delete
  on public.portfolio_funding_routes
  to authenticated;

grant select, insert, update, delete
  on public.portfolio_funding_route_steps
  to authenticated;


-- ============================================================
-- STANDARD CHANNELS
-- ============================================================

insert into public.exchange_channels (
  workspace_id,
  name
)
select
  workspaces.id,
  channels.name
from public.workspaces as workspaces
cross join (
  values
    ('Walutomat'::text),
    ('Revolut'::text)
) as channels(name)
on conflict (
  workspace_id,
  name
)
do nothing;


-- ============================================================
-- CREATE A COMPLETED FUNDING ROUTE
-- ============================================================

create function public.create_completed_funding_route(
  p_workspace_id uuid,
  p_owner_id uuid,
  p_contribution_date date,
  p_contribution_amount_base numeric,
  p_destination_account_id uuid,
  p_destination_date date,
  p_destination_amount numeric,
  p_destination_currency text,
  p_steps jsonb,
  p_contribution_time time without time zone default null,
  p_destination_time time without time zone default null,
  p_description text default null,
  p_notes text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_workspace_base_currency char(3);
  v_workspace_timezone text;

  v_owner_workspace_id uuid;

  v_destination_workspace_id uuid;
  v_destination_owner_id uuid;
  v_destination_account_currency char(3);

  v_destination_currency char(3);

  v_contribution_executed_at timestamptz;
  v_destination_executed_at timestamptz;

  v_description text;
  v_notes text;

  v_route_id uuid;
  v_deposit_operation_id uuid;

  v_step jsonb;
  v_sequence_no smallint := 0;

  v_step_date date;
  v_step_time time without time zone;
  v_step_occurred_at timestamptz;

  v_step_type text;
  v_exchange_channel_id uuid;

  v_from_location text;
  v_to_location text;

  v_from_amount numeric(28, 10);
  v_from_currency char(3);

  v_to_amount numeric(28, 10);
  v_to_currency char(3);

  v_fee_amount numeric(28, 10);
  v_fee_currency char(3);

  v_step_notes text;

  v_effective_fx_rate numeric(28, 10);
begin
  if auth.uid() is null then
    raise exception
      'Authentication is required.';
  end if;

  if p_workspace_id is null
     or p_owner_id is null then
    raise exception
      'Workspace and owner are required.';
  end if;

  if p_contribution_date is null then
    raise exception
      'Contribution date is required.';
  end if;

  if p_contribution_amount_base is null
     or p_contribution_amount_base <= 0 then
    raise exception
      'Contribution amount must be greater than zero.';
  end if;

  if p_destination_account_id is null then
    raise exception
      'Destination account is required.';
  end if;

  if p_destination_date is null then
    raise exception
      'Destination date is required.';
  end if;

  if p_destination_amount is null
     or p_destination_amount <= 0 then
    raise exception
      'Destination amount must be greater than zero.';
  end if;

  if p_destination_currency is null
     or upper(
       btrim(p_destination_currency)
     ) !~ '^[A-Z]{3}$' then
    raise exception
      'Destination currency must use a three-letter code.';
  end if;

  if p_steps is null
     or jsonb_typeof(p_steps) <> 'array' then
    raise exception
      'Funding route steps must be a JSON array.';
  end if;

  if not private.can_edit_workspace(
    p_workspace_id
  ) then
    raise exception
      'The current user cannot edit this workspace.';
  end if;

  select
    workspaces.base_currency,
    workspaces.timezone
  into
    v_workspace_base_currency,
    v_workspace_timezone
  from public.workspaces as workspaces
  where workspaces.id = p_workspace_id
  limit 1;

  if v_workspace_base_currency is null then
    raise exception
      'The selected workspace is unavailable.';
  end if;

  select
    owners.workspace_id
  into
    v_owner_workspace_id
  from public.owners as owners
  where owners.id = p_owner_id
    and owners.workspace_id =
      p_workspace_id
  limit 1;

  if v_owner_workspace_id is null then
    raise exception
      'The selected owner is unavailable.';
  end if;

  select
    accounts.workspace_id,
    accounts.owner_id,
    accounts.base_currency
  into
    v_destination_workspace_id,
    v_destination_owner_id,
    v_destination_account_currency
  from public.accounts as accounts
  where accounts.id =
      p_destination_account_id
    and accounts.workspace_id =
      p_workspace_id
    and accounts.is_active = true
  limit 1;

  if v_destination_workspace_id is null then
    raise exception
      'The selected destination account is unavailable.';
  end if;

  if v_destination_owner_id <>
     p_owner_id then
    raise exception
      'The destination account must belong to the funding-route owner.';
  end if;

  v_destination_currency :=
    upper(
      btrim(p_destination_currency)
    );

  if v_destination_account_currency <>
     v_destination_currency then
    raise exception
      'Destination currency must match the destination account currency.';
  end if;

  v_description :=
    nullif(
      btrim(p_description),
      ''
    );

  v_notes :=
    nullif(
      btrim(p_notes),
      ''
    );

  v_contribution_executed_at :=
    case
      when p_contribution_time is null
        then null
      else
        (
          p_contribution_date
          + p_contribution_time
        )
        at time zone
          v_workspace_timezone
    end;

  v_destination_executed_at :=
    case
      when p_destination_time is null
        then null
      else
        (
          p_destination_date
          + p_destination_time
        )
        at time zone
          v_workspace_timezone
    end;

  insert into public.portfolio_funding_routes (
    workspace_id,
    owner_id,
    contribution_date,
    contribution_executed_at,
    contribution_amount_base,
    base_currency,
    destination_account_id,
    status,
    completed_at,
    description,
    notes
  )
  values (
    p_workspace_id,
    p_owner_id,
    p_contribution_date,
    v_contribution_executed_at,
    p_contribution_amount_base,
    v_workspace_base_currency,
    p_destination_account_id,
    'completed',
    v_destination_executed_at,
    v_description,
    v_notes
  )
  returning id
  into v_route_id;

  for v_step in
    select value
    from jsonb_array_elements(
      p_steps
    )
  loop
    v_sequence_no :=
      v_sequence_no + 1;

    v_step_date :=
      nullif(
        v_step ->> 'date',
        ''
      )::date;

    if v_step_date is null then
      raise exception
        'Every funding-route step requires a date.';
    end if;

    v_step_time :=
      case
        when nullif(
          v_step ->> 'time',
          ''
        ) is null then null
        else (
          v_step ->> 'time'
        )::time without time zone
      end;

    v_step_occurred_at :=
      case
        when v_step_time is null
          then null
        else
          (
            v_step_date
            + v_step_time
          )
          at time zone
            v_workspace_timezone
      end;

    v_step_type :=
      nullif(
        btrim(
          v_step ->> 'stepType'
        ),
        ''
      );

    if v_step_type is null
       or v_step_type not in (
         'exchange',
         'transfer',
         'arrival',
         'other'
       ) then
      raise exception
        'Unsupported funding-route step type.';
    end if;

    v_exchange_channel_id :=
      case
        when nullif(
          v_step ->> 'exchangeChannelId',
          ''
        ) is null then null
        else (
          v_step ->>
            'exchangeChannelId'
        )::uuid
      end;

    v_from_location :=
      nullif(
        btrim(
          v_step ->> 'fromLocation'
        ),
        ''
      );

    v_to_location :=
      nullif(
        btrim(
          v_step ->> 'toLocation'
        ),
        ''
      );

    v_from_amount :=
      case
        when nullif(
          v_step ->> 'fromAmount',
          ''
        ) is null then null
        else (
          v_step ->>
            'fromAmount'
        )::numeric
      end;

    v_from_currency :=
      case
        when nullif(
          v_step ->> 'fromCurrency',
          ''
        ) is null then null
        else upper(
          btrim(
            v_step ->>
              'fromCurrency'
          )
        )::char(3)
      end;

    v_to_amount :=
      case
        when nullif(
          v_step ->> 'toAmount',
          ''
        ) is null then null
        else (
          v_step ->>
            'toAmount'
        )::numeric
      end;

    v_to_currency :=
      case
        when nullif(
          v_step ->> 'toCurrency',
          ''
        ) is null then null
        else upper(
          btrim(
            v_step ->>
              'toCurrency'
          )
        )::char(3)
      end;

    v_fee_amount :=
      case
        when nullif(
          v_step ->> 'feeAmount',
          ''
        ) is null then null
        else (
          v_step ->>
            'feeAmount'
        )::numeric
      end;

    v_fee_currency :=
      case
        when nullif(
          v_step ->> 'feeCurrency',
          ''
        ) is null then null
        else upper(
          btrim(
            v_step ->>
              'feeCurrency'
          )
        )::char(3)
      end;

    v_step_notes :=
      nullif(
        btrim(
          v_step ->> 'notes'
        ),
        ''
      );

    insert into public.portfolio_funding_route_steps (
      workspace_id,
      funding_route_id,
      sequence_no,
      step_date,
      occurred_at,
      step_type,
      exchange_channel_id,
      from_location,
      to_location,
      from_amount,
      from_currency,
      to_amount,
      to_currency,
      fee_amount,
      fee_currency,
      notes
    )
    values (
      p_workspace_id,
      v_route_id,
      v_sequence_no,
      v_step_date,
      v_step_occurred_at,
      v_step_type,
      v_exchange_channel_id,
      v_from_location,
      v_to_location,
      v_from_amount,
      v_from_currency,
      v_to_amount,
      v_to_currency,
      v_fee_amount,
      v_fee_currency,
      v_step_notes
    );
  end loop;

  /*
   * The real ledger receives only the money
   * that actually reached the tracked account.
   */
  v_deposit_operation_id :=
    public.create_cash_operation(
      p_destination_account_id,
      p_destination_date,
      'deposit'::public.portfolio_operation_type,
      p_destination_amount,
      v_destination_currency,
      coalesce(
        v_description,
        'External funding route'
      ),
      v_notes,
      p_destination_time
    );

  update public.portfolio_operations
  set funding_route_id =
    v_route_id
  where id =
    v_deposit_operation_id
    and workspace_id =
      p_workspace_id;

  /*
   * Give the foreign-currency arrival an explicit
   * base-currency value. This is the effective
   * all-in route rate, including FX fees.
   *
   * The deposit itself is excluded from
   * contribution/XIRR counting below, so this does
   * NOT create a second contribution.
   */
  v_effective_fx_rate :=
    p_contribution_amount_base
    / p_destination_amount;

  update public.portfolio_operation_entries
  set
    fx_rate_to_base =
      v_effective_fx_rate,

    base_cash_delta =
      p_contribution_amount_base

  where operation_id =
      v_deposit_operation_id
    and workspace_id =
      p_workspace_id
    and cash_delta > 0;

  return v_route_id;
end;
$$;

revoke all on function
  public.create_completed_funding_route(
    uuid,
    uuid,
    date,
    numeric,
    uuid,
    date,
    numeric,
    text,
    jsonb,
    time without time zone,
    time without time zone,
    text,
    text
  )
from public;

grant execute on function
  public.create_completed_funding_route(
    uuid,
    uuid,
    date,
    numeric,
    uuid,
    date,
    numeric,
    text,
    jsonb,
    time without time zone,
    time without time zone,
    text,
    text
  )
to authenticated;


-- ============================================================
-- CREATE A TRADE LINKED TO A FUNDING ROUTE
-- ============================================================

create function public.create_funding_route_trade(
  p_funding_route_id uuid,
  p_account_id uuid,
  p_instrument_id uuid,
  p_operation_date date,
  p_operation_type public.portfolio_operation_type,
  p_quantity numeric,
  p_actual_cash_amount numeric,
  p_cash_currency text,
  p_fee_amount numeric default null,
  p_tax_amount numeric default null,
  p_base_value numeric default null,
  p_description text default null,
  p_notes text default null,
  p_operation_time time without time zone default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_route_workspace_id uuid;
  v_destination_account_id uuid;
  v_route_status text;

  v_operation_id uuid;
begin
  if auth.uid() is null then
    raise exception
      'Authentication is required.';
  end if;

  select
    routes.workspace_id,
    routes.destination_account_id,
    routes.status
  into
    v_route_workspace_id,
    v_destination_account_id,
    v_route_status
  from public.portfolio_funding_routes
    as routes
  where routes.id =
    p_funding_route_id
  limit 1;

  if v_route_workspace_id is null then
    raise exception
      'The selected funding route is unavailable.';
  end if;

  if not private.can_edit_workspace(
    v_route_workspace_id
  ) then
    raise exception
      'The current user cannot edit this workspace.';
  end if;

  if v_route_status <> 'completed' then
    raise exception
      'Only a completed funding route can be linked to a trade.';
  end if;

  if p_account_id <>
     v_destination_account_id then
    raise exception
      'The trade account must match the funding-route destination account.';
  end if;

  v_operation_id :=
    public.create_trade_operation(
      p_account_id,
      p_instrument_id,
      p_operation_date,
      p_operation_type,
      p_quantity,
      p_actual_cash_amount,
      p_cash_currency,
      p_fee_amount,
      p_tax_amount,
      p_base_value,
      p_description,
      p_notes,
      p_operation_time
    );

  update public.portfolio_operations
  set funding_route_id =
    p_funding_route_id
  where id =
      v_operation_id
    and workspace_id =
      v_route_workspace_id;

  return v_operation_id;
end;
$$;

revoke all on function
  public.create_funding_route_trade(
    uuid,
    uuid,
    uuid,
    date,
    public.portfolio_operation_type,
    numeric,
    numeric,
    text,
    numeric,
    numeric,
    numeric,
    text,
    text,
    time without time zone
  )
from public;

grant execute on function
  public.create_funding_route_trade(
    uuid,
    uuid,
    uuid,
    date,
    public.portfolio_operation_type,
    numeric,
    numeric,
    text,
    numeric,
    numeric,
    numeric,
    text,
    text,
    time without time zone
  )
to authenticated;


-- ============================================================
-- CUMULATIVE CONTRIBUTIONS
-- ============================================================

create or replace function
  private.calculate_cumulative_contributions_as_of(
    p_workspace_id uuid,
    p_as_of_date date
  )
returns table (
  baseline_id uuid,
  baseline_date date,
  baseline_value numeric,
  external_flows_value numeric,
  cumulative_value numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_workspace_base_currency char(3);

  v_baseline_id uuid;
  v_baseline_date date;

  v_baseline_value numeric(28, 10);

  v_external_flows_value numeric(28, 10);

  v_missing_base_value_count integer;
begin
  select
    workspaces.base_currency
  into
    v_workspace_base_currency
  from public.workspaces
    as workspaces
  where workspaces.id =
    p_workspace_id
  limit 1;

  if v_workspace_base_currency
       is null then
    raise exception
      'The selected workspace is unavailable.';
  end if;

  select
    baselines.id,
    baselines.baseline_date,
    baselines.cumulative_contributions_base
  into
    v_baseline_id,
    v_baseline_date,
    v_baseline_value
  from public.portfolio_contribution_baselines
    as baselines
  where baselines.workspace_id =
      p_workspace_id
    and baselines.baseline_date <=
      p_as_of_date
  order by
    baselines.baseline_date desc,
    baselines.updated_at desc,
    baselines.id desc
  limit 1;

  if v_baseline_id is null then
    raise exception
      'A cumulative contribution baseline is required on or before the report date.';
  end if;

  with operation_flows as (
    select
      case
        when entries.base_cash_delta
          is not null then
          entries.base_cash_delta

        when upper(
          entries.currency::text
        ) = upper(
          v_workspace_base_currency::text
        ) then
          entries.cash_delta

        else null
      end as base_value

    from public.portfolio_operations
      as operations

    join public.portfolio_operation_entries
      as entries
      on entries.operation_id =
        operations.id
      and entries.workspace_id =
        operations.workspace_id

    where operations.workspace_id =
        p_workspace_id

      and operations.status::text =
        'posted'

      and operations.funding_route_id
        is null

      and operations.operation_date >
        v_baseline_date

      and operations.operation_date <=
        p_as_of_date

      and operations.operation_type::text
        in (
          'deposit',
          'withdrawal'
        )

      and entries.component::text
        in (
          'transfer',
          'principal'
        )

      and entries.cash_delta <> 0
  ),

  route_flows as (
    select
      routes.contribution_amount_base
        as base_value

    from public.portfolio_funding_routes
      as routes

    join public.portfolio_operations
      as destination_deposit
      on destination_deposit.workspace_id =
        routes.workspace_id
      and destination_deposit.funding_route_id =
        routes.id
      and destination_deposit.operation_type::text =
        'deposit'
      and destination_deposit.status::text =
        'posted'

    where routes.workspace_id =
        p_workspace_id

      and routes.status =
        'completed'

      and routes.contribution_date >
        v_baseline_date

      and routes.contribution_date <=
        p_as_of_date
  ),

  external_flows as (
    select base_value
    from operation_flows

    union all

    select base_value
    from route_flows
  )

  select
    count(*) filter (
      where external_flows.base_value
        is null
    ),

    coalesce(
      sum(
        external_flows.base_value
      ),
      0
    )::numeric(28, 10)

  into
    v_missing_base_value_count,
    v_external_flows_value

  from external_flows;

  if v_missing_base_value_count > 0 then
    raise exception
      'Every foreign-currency deposit or withdrawal requires a base-currency value.';
  end if;

  return query
  select
    v_baseline_id,
    v_baseline_date,
    v_baseline_value,
    v_external_flows_value,

    (
      v_baseline_value +
      v_external_flows_value
    )::numeric(28, 10);
end;
$$;

comment on function
  private.calculate_cumulative_contributions_as_of(
    uuid,
    date
  )
is
  'Calculates cumulative external contributions. Completed external funding routes count at their original base-currency contribution amount; their destination deposits are excluded from contribution counting.';


-- ============================================================
-- XIRR EXTERNAL FLOWS
-- ============================================================

create or replace function
  private.get_report_xirr_external_flows(
    p_report_run_id uuid
  )
returns table (
  flow_date date,
  flow_kind text,
  amount_base numeric,
  source_kind text,
  legacy_external_flow_id uuid,
  operation_id uuid,
  description text
)
language sql
stable
set search_path = ''
as $$
  with report as (
    select
      runs.workspace_id,
      runs.as_of_date,
      workspaces.detailed_tracking_start_date
    from public.portfolio_report_runs
      as runs
    join public.workspaces
      as workspaces
      on workspaces.id =
        runs.workspace_id
    where runs.id =
        p_report_run_id
      and runs.report_type =
        'monthly'
    limit 1
  ),

  legacy as (
    select
      flows.flow_date,

      flows.flow_type
        as flow_kind,

      case flows.flow_type
        when 'contribution'
          then -flows.amount_base
        when 'withdrawal'
          then flows.amount_base
      end::numeric(28, 10)
        as amount_base,

      'legacy_flow'::text
        as source_kind,

      flows.id
        as legacy_external_flow_id,

      null::uuid
        as operation_id,

      coalesce(
        nullif(
          btrim(flows.notes),
          ''
        ),
        flows.external_reference
      ) as description

    from report

    join public.portfolio_legacy_external_flows
      as flows
      on flows.workspace_id =
        report.workspace_id

    where flows.flow_date <=
        report.as_of_date

      and (
        report.detailed_tracking_start_date
          is null
        or flows.flow_date <=
          report.detailed_tracking_start_date
      )
  ),

  detailed as (
    select
      operations.operation_date
        as flow_date,

      case operations.operation_type::text
        when 'deposit'
          then 'contribution'
        when 'withdrawal'
          then 'withdrawal'
      end as flow_kind,

      (
        -sum(
          entries.base_cash_delta
        )
      )::numeric(28, 10)
        as amount_base,

      'operation'::text
        as source_kind,

      null::uuid
        as legacy_external_flow_id,

      operations.id
        as operation_id,

      coalesce(
        nullif(
          btrim(
            operations.description
          ),
          ''
        ),
        operations.external_reference,
        operations.operation_type::text
      ) as description

    from report

    join public.portfolio_operations
      as operations
      on operations.workspace_id =
        report.workspace_id

    join public.portfolio_operation_entries
      as entries
      on entries.workspace_id =
        operations.workspace_id
      and entries.operation_id =
        operations.id

    join public.accounts
      as accounts
      on accounts.workspace_id =
        entries.workspace_id
      and accounts.id =
        entries.account_id

    where operations.status::text =
        'posted'

      and operations.funding_route_id
        is null

      and operations.operation_type::text
        in (
          'deposit',
          'withdrawal'
        )

      and operations.operation_date <=
        report.as_of_date

      and (
        report.detailed_tracking_start_date
          is null
        or operations.operation_date >
          report.detailed_tracking_start_date
      )

      and accounts.account_type::text
        <> 'ppk'

      and entries.cash_delta <> 0

    group by
      operations.id,
      operations.operation_date,
      operations.operation_type,
      operations.description,
      operations.external_reference

    having
      sum(
        entries.base_cash_delta
      ) <> 0
  ),

  routes as (
    select
      funding_routes.contribution_date
        as flow_date,

      'contribution'::text
        as flow_kind,

      (
        -funding_routes
          .contribution_amount_base
      )::numeric(28, 10)
        as amount_base,

      'operation'::text
        as source_kind,

      null::uuid
        as legacy_external_flow_id,

      destination_deposit.id
        as operation_id,

      coalesce(
        nullif(
          btrim(
            funding_routes.description
          ),
          ''
        ),
        nullif(
          btrim(
            destination_deposit.description
          ),
          ''
        ),
        'External funding route'
      ) as description

    from report

    join public.portfolio_funding_routes
      as funding_routes
      on funding_routes.workspace_id =
        report.workspace_id

    join public.portfolio_operations
      as destination_deposit
      on destination_deposit.workspace_id =
        funding_routes.workspace_id
      and destination_deposit.funding_route_id =
        funding_routes.id
      and destination_deposit.operation_type::text =
        'deposit'
      and destination_deposit.status::text =
        'posted'

    join public.accounts
      as destination_account
      on destination_account.workspace_id =
        funding_routes.workspace_id
      and destination_account.id =
        funding_routes.destination_account_id

    where funding_routes.status =
        'completed'

      and funding_routes.contribution_date <=
        report.as_of_date

      and (
        report.detailed_tracking_start_date
          is null
        or funding_routes.contribution_date >
          report.detailed_tracking_start_date
      )

      and destination_account.account_type::text
        <> 'ppk'
  )

  select * from legacy

  union all

  select * from detailed

  union all

  select * from routes;
$$;

comment on function
  private.get_report_xirr_external_flows(uuid)
is
  'Builds report XIRR flows from legacy flows, ordinary detailed deposits/withdrawals, and completed external funding routes. A funding route uses its original contribution date/value; the linked destination deposit is not counted twice.';


commit;