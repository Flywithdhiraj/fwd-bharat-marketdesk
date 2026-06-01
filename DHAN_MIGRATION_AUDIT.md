# FWD Bharat MarketDesk - Dhan Migration Audit

The app is now a Dhan-first, read-only NSE/BSE desktop shell. Real order execution is intentionally blocked; manual trade planning and Dhan app/web execution remain the workflow.

## Completed

- Electron shell, preload/native bridge, app lock, backups, debug export, secure secret storage.
- Dhan credential storage in native encrypted secrets.
- Dhan instrument master cache with NSE equity, BSE equity, F&O, indices, and universe filters.
- Dhan REST adapters for LTP, quote, OHLC, option-chain expiries, option chain, and candles.
- Intraday historical chunking for Dhan's 90-day request limit.
- Dhan read-only WebSocket subscription flow and binary packet parser.
- NSE/BSE market-session status and 2026 equity/F&O holiday calendar.
- Manual-only trade planning: chart levels, position/journal workflow, risk math, INR copy, and Dhan manual execution wording.
- Strategy Lab around NSE/BSE scanner rows: Wizard, Stage, Radar, Reversal, Darvas, Pullback.
- Wizard VCP and 52-week high/low context.
- Options Hub conversion to Dhan option-chain analytics.
- Active bundle cleanup for Delta websocket, old options workspace, native straddle, old shared options module, and old candle-history service.
- Smoke tests rewritten around Dhan safety and data behavior.

## Deliberately Blocked

- Dhan order placement, modification, cancellation, DCA, futures auto-trade, short-straddle automation, and any scheduled live-order automation.
- Any UI path that promises live broker execution from this app.

## Residual Technical Debt

- Some compatibility names still contain older words such as `live`, `order`, `USD`, or `funding` inside reused internal helpers/tests. Current smoke tests assert those paths are disabled/manual-only, but a deeper rename-only cleanup can still make the codebase easier to read.
- Fundamentals cannot be completed from Dhan market-data APIs alone; a provider/import source is required.
- Final special-session/Muhurat timings are pending exchange circular timing.

## Done Definition

- `npm run check` must pass.
- Dhan order actions must return disabled/manual-only responses.
- Options Hub must render Dhan option-chain analytics.
- Packaging must point to the Bharat MarketDesk icon.
- Live credential QA should be done separately with the user's DhanHQ token.
