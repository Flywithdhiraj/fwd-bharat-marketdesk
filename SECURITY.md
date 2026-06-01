# Security Policy

FWD Bharat MarketDesk is designed as a read-only market-data and manual trade-planning desktop app.

## Supported scope

- Dhan order placement, modification, cancellation, DCA, and automated live trading are intentionally blocked.
- Dhan credentials are stored locally through Electron safe storage when available.
- Users should never commit DhanHQ tokens, broker credentials, app recovery codes, or exported local app data.

## Reporting issues

Please open a GitHub issue for security hardening suggestions that do not expose secrets. If a report includes private credentials, account details, or exploitable private information, contact the maintainer privately first instead of posting it publicly.
