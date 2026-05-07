# FWD TradeDesk Pro Windows

This folder contains the Windows desktop migration of the Chrome extension.

## Current Status

- Framework: Electron, because Node is available on this machine and Rust/Cargo is not installed yet.
- Renderer: copied from the current Chrome extension UI.
- Desktop background runtime: `src/renderer/desktop-background.html` loads the former Chrome service-worker modules in a separate frame.
- Desktop shim: `src/renderer/desktop-shim.js` replaces Chrome storage, runtime messaging, alarms, notifications, windows, and native messaging.
- Native credential bridge: `src/main/preload.js` and `src/main/main.js` provide encrypted local credential storage and signed private API requests from the Electron main process.
- Installer output: `release/FWD TradeDesk Pro Setup 0.1.0.exe`.
- Security: first launch can create a local app password and optional Microsoft Authenticator-compatible 6-digit login code with QR/manual setup. Private credential and exchange API actions are blocked while the app is logged out. A one-time recovery code supports password reset, and inactivity auto-lock can be set from 1 to 240 minutes.

## Commands

```powershell
npm install
npm start
npm run check
npm run pack
npm run dist
```

## Migration Notes

The migration keeps the existing extension logic but replaces the Chrome runtime boundary:

1. Popup-to-background calls now route through a desktop `BroadcastChannel` bridge.
2. Former service-worker modules run in a hidden same-origin frame to avoid variable collisions with popup scripts.
3. Settings and normal app data use desktop local storage through the Chrome-compatible shim.
4. Trade credentials are stored through Electron `safeStorage` when available and private API requests are signed in the main process.
5. Real-order execution remains behind the existing profile, kill-switch, preview, and guardrail checks.

Tauri can still be considered later after Rust is installed, but Electron is the fastest path for a working Windows build from this current codebase.

## Distribution Notes

The app is buildable and installable, but it is not backed by a paid public code-signing certificate. Windows may still show a trust warning when distributed outside your machine.
