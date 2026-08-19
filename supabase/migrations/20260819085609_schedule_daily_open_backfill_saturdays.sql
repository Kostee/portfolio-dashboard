do $$
declare
  schedule_row record;
  job_exists boolean;
  scheduled_job_id bigint;
begin
  if to_regclass('cron.job') is null then
    raise notice
      'pg_cron is not enabled; skipping Saturday daily-open backfill schedules.';
    return;
  end if;

  for schedule_row in
    select *
    from (
      values
        (
          'daily-open-backfill-europe-sat-1005-utc',
          '5 10 * * 6',
          'select public.invoke_daily_market_open_sync(''europe'');'
        ),
        (
          'daily-open-backfill-europe-sat-1105-utc',
          '5 11 * * 6',
          'select public.invoke_daily_market_open_sync(''europe'');'
        ),
        (
          'daily-open-backfill-us-sat-1420-utc',
          '20 14 * * 6',
          'select public.invoke_daily_market_open_sync(''us'');'
        ),
        (
          'daily-open-backfill-us-sat-1520-utc',
          '20 15 * * 6',
          'select public.invoke_daily_market_open_sync(''us'');'
        )
    ) as schedules(
      jobname,
      schedule_expression,
      command_text
    )
  loop
    execute
      'select exists (
         select 1
         from cron.job
         where jobname = $1
       )'
      into job_exists
      using schedule_row.jobname;

    if not job_exists then
      execute
        'select cron.schedule($1, $2, $3)'
        into scheduled_job_id
        using
          schedule_row.jobname,
          schedule_row.schedule_expression,
          schedule_row.command_text;
    end if;
  end loop;
end
$$;
