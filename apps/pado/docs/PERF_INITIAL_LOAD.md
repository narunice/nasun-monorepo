# Pado Initial Load Freeze — Handoff

> Created: 2026-05-08
> Owner: TBD
> Related bug report: `d26338ce-2d7e-4000-bf0b-971872df3090` ("Pado Finance - at password Window")

## Problem

Users on mid-tier devices report a 5-8 second freeze on cold load of pado.finance. The freeze happens BEFORE the user submits their password — the password input itself is unresponsive on the locked-wallet screen.

Initial assumption was PBKDF2 key derivation blocking the main thread. Investigation ruled this out: PBKDF2 only runs after submit, and 100K iterations finish in well under 1 second even on slow devices.

## Actual Root Cause

The main thread is blocked by JS bundle parse/eval plus eager network fetches that fire from top-level providers before the wallet is unlocked.

Concrete contributors, ranked by impact:

1. **PerpMarketProvider mounted at App root** — fires `usePerpMarkets()` and `useOraclePrice()` on initial render, before unlock. The user does not need perp data on the locked screen.
   - File: [apps/pado/frontend/src/features/trading/context/PerpMarketProvider.tsx](apps/pado/frontend/src/features/trading/context/PerpMarketProvider.tsx) lines ~49-116
   - Mounted in: [apps/pado/frontend/src/main.tsx](apps/pado/frontend/src/main.tsx) (App tree wrapping)

2. **Main bundle ~1.8 MB** — contains HomePage, context providers, MarketProvider, contract registry. Parse cost on mid-tier mobile is multi-second.
   - Vite output sample: `index-BpAE9R_B.js` ≈ 1.8 MB
   - `vendor-sui` ≈ 952 KB (separated, but still parsed at boot since `@nasun/wallet` imports it eagerly)

3. **`@nasun/wallet` and `createContractRegistry()` eager** — pulled by [main.tsx](apps/pado/frontend/src/main.tsx) line 10 and initialized synchronously.
   - `configureWallet()` runs on every session even when only the locked screen is visible.

4. **MarketProvider in main bundle** — App.tsx wraps everything in `MarketProvider` from `features/trading/context`. Home page does not need real-time market state.

What is already correct (do not change):
- Route-level lazy loading via `React.lazy()` + `lazyWithRetry` in [main.tsx](apps/pado/frontend/src/main.tsx) and [AppRoutes.tsx](apps/pado/frontend/src/routes/AppRoutes.tsx) lines 52-64
- Heavy pages (TradePage, PerpTradePage, PredictPage) are split into their own chunks
- Turnstile prewarm in App.tsx lines 23-37 runs in background
- `initZkLogin()` is conditional

## Proposed Fixes (priority order)

### P1 — Move PerpMarketProvider down the tree (highest impact, smallest blast radius)
- Remove `PerpMarketProvider` from the global App wrapper.
- Wrap only the perpetuals route(s) and any component that actually consumes the perp context.
- Verify with grep that no other route consumes `usePerpMarketContext()` or equivalent.
- Expected impact: eliminates the largest initial RPC fetch wave.

### P2 — Defer MarketProvider to trading routes
- Same shape as P1 but for spot trading market context.
- Home page, lottery, prediction etc. do not need market state on mount.

### P3 — Lazy-init `@nasun/wallet` configuration
- `configureWallet()` and `createContractRegistry()` currently run at module load.
- Wrap in a lazy initializer triggered on first wallet interaction (or right before unlock attempt).
- Risk: ensure unlock flow still has wallet config ready when password is submitted.

### P4 — Code-split MarketProvider/contract registry off main chunk
- Manual chunk hint in [vite.config.ts](apps/pado/frontend/vite.config.ts).
- Goal: bring main bundle below ~1 MB so parse cost on mid-tier mobile drops below ~2 s.

## Test Plan

For each P-level fix:
1. Build prod bundle: `pnpm build:pado`. Record main bundle size.
2. Lighthouse mobile (moderate throttling) on landing page in locked state. Record TTI and Total Blocking Time.
3. Manual test: cold load on a real low-end device or Chrome DevTools 4× CPU throttle. Verify password input is interactive within 2 s of first paint.
4. Smoke test: unlock → spot trade → perp trade → prediction. Make sure deferred providers still mount and data still loads.

Acceptance: password input typing is responsive within 2 s of first paint on 4× CPU throttle.

## Out of Scope

- PBKDF2 → Web Worker. PBKDF2 is not the bottleneck. Skip unless a different bug surfaces.
- Reducing PBKDF2 iterations. 100K is already at the low end; reducing weakens brute-force resistance.
- Full bundle audit. Only chase the four contributors above; broader audit is a separate ticket.

## Reference

- Investigation session: 2026-05-08, conversation handoff (Claude Code)
- User report: `0xe6b8...c0a7`, wallet `0xe6b8894bb2c3e49291a5a10abcdd91453c0815c3f771f5bbec56b1189e1ec0a7`, embedded keystore wallet on mobile
