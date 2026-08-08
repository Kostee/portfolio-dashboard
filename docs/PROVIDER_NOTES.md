# Provider notes

This version intentionally does not use Yahoo Finance automation.

Current mapping:

- GPW -> EODHD, e.g. `XTB.WAR`,
- Xetra -> Alpha Vantage, e.g. `XNAS.DEX`,
- LSE -> Alpha Vantage, e.g. `IWMO.LON`,
- U.S. -> Alpha Vantage, e.g. `NVDA`,
- BTC -> Bitvavo `BTC-EUR`,
- FX -> NBP table A.

The first dry run for 2026-08-08 is also a symbol-validation test. If one of the four European ETF symbols does not resolve, do not guess: leave that proposal failed and adjust only that mapping after verifying the symbol with the provider search endpoint.
