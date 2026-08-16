# Security

Portfolio Dashboard is designed to store sensitive financial data in the operator's private deployment, not in the source repository.

## Sensitive data

Do not commit:

- portfolio holdings or transaction exports,
- database dumps or backups,
- authentication credentials,
- Supabase admin, service-role or secret keys,
- provider API keys,
- private cron secrets,
- filled-in deployment templates,
- production environment files.

The repository should contain only generic application code, schema migrations, documentation and deliberately public example data.

## Browser credentials

Only browser-safe Supabase credentials may be exposed through variables prefixed with:

```text
NEXT_PUBLIC_
```

Never expose an administrative key through a browser bundle.

Database access must continue to rely on authentication and Row Level Security.

## Edge Function secrets

Provider keys and workflow authentication secrets belong in the Edge Function secret store or another appropriate secrets manager.

Do not hard-code them in:

- TypeScript source,
- SQL migrations,
- cron templates,
- documentation,
- frontend environment variables.

## Reporting a security issue

If you discover a vulnerability that could expose authentication credentials, portfolio data or other private deployment information, avoid publishing the sensitive details in a public issue.

Use a private GitHub security-reporting channel when available, or contact the repository maintainer privately before public disclosure.

Include enough information to reproduce the issue without including real credentials or private financial datasets.

## Scope

This repository provides application code and database logic.

Operators remain responsible for:

- securing their hosting environment,
- controlling access to their Supabase project,
- protecting backups,
- rotating leaked credentials,
- configuring production authentication,
- reviewing enabled market-data providers,
- keeping dependencies and infrastructure patched.
