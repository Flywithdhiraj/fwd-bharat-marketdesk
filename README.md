# FWD Bharat MarketDesk (NSE/BSE)

Windows Electron desktop app for read-only Dhan market data, NSE/BSE scanning, option-chain analytics, chart review, manual trade planning, and local journals.

## Current Status

- Framework: Electron desktop shell with Chrome-compatible renderer/runtime shims.
- Data source: Dhan Data API through native encrypted credentials.
- Trading mode: manual only. Dhan order placement, modify, cancel, DCA, and auto-trade paths are hard-blocked.
- Market data: Dhan instrument universe cache, LTP/quote/OHLC batching, historical/intraday candles with 90-day chunking, index tape, and read-only WebSocket tick parsing.
- Scanners: Wizard/Minervini, Stage, Radar, Reversal, Darvas, and Pullback labs run from shared NSE/BSE scan context.
- Options Hub: Dhan expiry lookup, CE/PE strike table, OI/PCR, IV skew, call/put walls, max pain, and read-only live-feed status.
- Calendar: native `market_session` action covers regular NSE/BSE timings and 2026 equity/F&O holidays, with Muhurat timing marked pending until exchange circular timing is published.
- Branding: app, raster icons, packaging metadata, and Windows `.ico` use `FWD Bharat MarketDesk`.
- Security: first launch can create a local app password and optional Microsoft Authenticator-compatible 6-digit login code with QR/manual setup. Private credential/data actions are blocked while the app is logged out.

## Commands

```powershell
npm install
npm start
npm run check
npm run pack
npm run dist
```

## Architecture Notes

1. Popup-to-background calls route through a desktop `BroadcastChannel` bridge.
2. Former service-worker modules run in a hidden same-origin frame to avoid variable collisions with popup scripts.
3. Settings and normal app data use desktop local storage through the Chrome-compatible shim.
4. Dhan credentials are stored through Electron `safeStorage` when available.
5. All broker execution remains outside the app; trade tickets and chart levels are planning aids only.

## Remaining External Work

- Save fresh DhanHQ credentials and test live REST/option-chain/WebSocket responses during market hours.
- Add a fundamentals provider/import source for ROCE, ROE, debt/equity, PE, EPS growth, and sector metadata.
- Update Muhurat/special-session timings when NSE/BSE publish the final circular.
- Run `npm run pack`/`npm run dist` after verification when a distributable build is needed.

## Distribution Notes

The app is buildable and installable, but it is not backed by a paid public code-signing certificate. Windows may still show a trust warning when distributed outside your machine.
