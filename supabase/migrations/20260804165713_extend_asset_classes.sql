begin;

alter table public.asset_classes
  add column code text not null
    check (code ~ '^[a-z0-9_]+$'),

  add column include_in_allocation_chart boolean not null
    default true,

  add column include_in_xirr boolean not null
    default true;

alter table public.asset_classes
  add constraint asset_classes_workspace_code_key
  unique (workspace_id, code);

create index asset_classes_workspace_allocation_idx
  on public.asset_classes (
    workspace_id,
    include_in_allocation_chart,
    is_active,
    sort_order
  );

create index asset_classes_workspace_xirr_idx
  on public.asset_classes (
    workspace_id,
    include_in_xirr,
    is_active
  );

commit;