# FWD Bharat MarketDesk v0.1.0

Initial public open-source checkpoint for the Dhan-first NSE/BSE desktop app.

## Highlights

- Read-only Dhan market-data integration for quotes, OHLC, option-chain analytics, candles, and WebSocket tick parsing.
- Manual-only trading workflow with order placement, modification, cancellation, DCA, and automation paths blocked.
- Strategy labs for Wizard/Minervini, Stage, Radar, Reversal, Darvas, Pullback, F&O carry, commodities, and options review.
- Local security layer with app lock, optional authenticator code, Electron safe storage, and explicit credential boundaries.
- Windows Electron packaging metadata and Bharat MarketDesk branding.

## Verification

The v0.1.0 checkpoint is verified by:

```powershell
npm ci
npm run check
npm audit --omit=dev
```

The check suite covers renderer bundle sync, JavaScript checks, Dhan data behavior, manual-trading safety, scanner derivation, options hub, chart review, visual smoke, and chart drag ordering.

## Known limitations

- Live Dhan REST/WebSocket verification requires valid user credentials and market/network availability.
- Fundamentals such as ROCE, ROE, debt/equity, PE, EPS growth, and sector metadata need a separate provider or import source.
- Windows installer builds are unsigned and may show trust warnings outside the maintainer machine.
