begin;

grant execute
on function
  private.calculate_cumulative_contributions_as_of(
    uuid,
    date
  )
to authenticated;

comment on function
  private.calculate_cumulative_contributions_as_of(
    uuid,
    date
  )
is
  'Calculates cumulative external contributions as of a date. Kept in the private schema; authenticated execution is required by authorized public reporting workflows.';

commit;