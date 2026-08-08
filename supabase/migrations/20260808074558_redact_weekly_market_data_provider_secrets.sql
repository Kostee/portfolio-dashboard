begin;

update public.market_data_sync_items
set
  error_message = case
    when error_message is null then null
    else regexp_replace(
      error_message,
      'API key as [A-Za-z0-9_-]+',
      'API key as [REDACTED]',
      'gi'
    )
  end,
  raw_metadata = case
    when raw_metadata is null then null
    else regexp_replace(
      raw_metadata::text,
      'API key as [A-Za-z0-9_-]+',
      'API key as [REDACTED]',
      'gi'
    )::jsonb
  end
where
  error_message ~* 'API key as [A-Za-z0-9_-]+'
  or raw_metadata::text ~* 'API key as [A-Za-z0-9_-]+';

commit;