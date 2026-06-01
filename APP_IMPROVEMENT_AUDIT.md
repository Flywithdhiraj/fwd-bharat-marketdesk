# FWD Bharat MarketDesk - Improvement Audit

## Implemented

- Renamed the product to `FWD Bharat MarketDesk (NSE/BSE)`.
- Added Bharat MarketDesk SVG, PNG, raster notification icons, and Windows `.ico`.
- Updated Electron Builder and after-pack branding to use the new icon.
- Added NSE/BSE theme layers and command-center market modules.
- Added Dhan instrument universes, quote/OHLC batching, candle chunking, read-only WebSocket parser, and API metering.
- Added native NSE/BSE market-session status with 2026 equity/F&O holidays and Muhurat timing placeholder.
- Rebuilt Options Hub around Dhan expiries and option-chain payloads with CE/PE rows, OI, PCR, IV skew, call/put walls, and max pain.
- Added Wizard VCP and 52-week high/low context, plus Strategy Lab safety checks.
- Removed old Delta websocket/options/native-straddle modules from the active bundle.
- Kept Dhan order placement disabled and manual-only.

## Verified

- `npm run check` passes across renderer sync, JS checks, Dhan data, Options Hub, manual safety, benchmark, Strategy Lab, scanners, visual smoke, scan context, and chart drag checks.

## Still External

- Fundamentals need a separate provider/import. Dhan market data does not supply ROCE, ROE, D/E, PE, or EPS growth history.
- Live Dhan REST/WebSocket verification requires valid DhanHQ credentials and market/network availability.
- Muhurat/special-session timings must be updated after the final exchange circular.

## Recommended Next Build Order

1. Add a fundamentals CSV/provider import screen and normalize ROCE, ROE, D/E, PE, EPS growth, sector, and industry.
2. Run live Dhan credential QA during market hours.
3. Package with `npm run pack` and visually smoke the installed build.
