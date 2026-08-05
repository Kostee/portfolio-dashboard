begin;

create index if not exists
  portfolio_operations_workspace_chronology_idx
on public.portfolio_operations (
  workspace_id,
  operation_date desc,
  executed_at desc nulls last,
  created_at desc,
  id desc
);

commit;