do $$
begin
  if not exists (
    select 1
    from cron.job
    where jobname =
      'daily-open-backfill-europe-sat-1005-utc'
  ) then
    perform cron.schedule(
      'daily-open-backfill-europe-sat-1005-utc',
      '5 10 * * 6',
      $job$select public.invoke_daily_market_open_sync('europe');$job$
    );
  end if;

  if not exists (
    select 1
    from cron.job
    where jobname =
      'daily-open-backfill-europe-sat-1105-utc'
  ) then
    perform cron.schedule(
      'daily-open-backfill-europe-sat-1105-utc',
      '5 11 * * 6',
      $job$select public.invoke_daily_market_open_sync('europe');$job$
    );
  end if;

  if not exists (
    select 1
    from cron.job
    where jobname =
      'daily-open-backfill-us-sat-1420-utc'
  ) then
    perform cron.schedule(
      'daily-open-backfill-us-sat-1420-utc',
      '20 14 * * 6',
      $job$select public.invoke_daily_market_open_sync('us');$job$
    );
  end if;

  if not exists (
    select 1
    from cron.job
    where jobname =
      'daily-open-backfill-us-sat-1520-utc'
  ) then
    perform cron.schedule(
      'daily-open-backfill-us-sat-1520-utc',
      '20 15 * * 6',
      $job$select public.invoke_daily_market_open_sync('us');$job$
    );
  end if;
end
$$;
