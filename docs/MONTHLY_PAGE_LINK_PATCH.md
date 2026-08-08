# Small patch: link the monthly report page to automatic market data

File:

```text
src/app/portfolio/reports/monthly/page.tsx
```

Find this exact block:

```tsx
          <Link
            href="/portfolio/reports/contributions"
            className="mt-5 inline-flex rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
          >
            Manage contribution baseline
          </Link>
```

Replace the whole block with:

```tsx
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href={`/portfolio/reports/monthly/market-data?asOf=${encodeURIComponent(asOfDate)}`}
              className="inline-flex rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
            >
              Review automatic market data
            </Link>

            <Link
              href="/portfolio/reports/contributions"
              className="inline-flex rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            >
              Manage contribution baseline
            </Link>
          </div>
```

Nothing else in this file needs to change for the first version of the automatic quote workflow.
