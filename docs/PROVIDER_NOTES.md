# Provider notes

This version intentionally does not use Yahoo Finance automation.

Supported provider roles include:

- GPW market data -> EODHD,
- European and U.S. market data -> Alpha Vantage,
- optional market-data fallbacks -> Twelve Data,
- BTC market data -> Bitvavo,
- FX reference rates -> NBP table A.

Provider symbols are deployment-specific configuration and are not part of
the public portfolio dataset. Verify every instrument mapping against the
provider's symbol-search or reference endpoint before enabling it.

If a provider symbol cannot be resolved, leave that market-data proposal
failed rather than guessing a mapping.
