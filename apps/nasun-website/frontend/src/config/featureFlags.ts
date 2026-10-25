export const NASUN_AI_ENABLED = import.meta.env.VITE_NASUN_AI_ENABLED === 'true';

// Dashboard "Ecosystem Positions" cards (Uniswap LP, Hyperliquid, etc.) shown
// above the Overview hero. DashboardTab reads this as the section's only gate.
//
// It was dead for five months: 36d2308a7 commented the import and JSX out on
// 2026-05-20 to isolate a *suspected* reload loop, and the flag was left
// unread. The loop turned out to live in the chunk-retry path and was fixed on
// 2026-05-24 by 2265d91fd (60s window + MAX_SESSION_RELOADS + a
// vite:preloadError listener), so the section was never implicated; nobody
// un-did the isolation. It is now wired to this flag so it can be switched off
// without another commented-out call site.
//
// Whether the section renders is per-environment and lives in the .env files,
// not here. A prod build with the flag off tree-shakes the whole section out,
// so "the code is restored" and "it is visible on nasun.io" are separate
// facts; check the env file for the second one.
export const UJU_ECOSYSTEM_POSITIONS_ENABLED =
  import.meta.env.VITE_UJU_ECOSYSTEM_POSITIONS_ENABLED === 'true';

// External-chain dApps (Uniswap/Aave on Ethereum, Hyperliquid, Drift on Solana)
// in the Activity > Apps Directory. When false they are filtered out of the
// registry entirely rather than shown as "coming-soon". Enabled everywhere
// since 2026-10-11. A pinned entry links out, and now also shows a positions
// card, since EcosystemPositionsSection renders behind the flag above. Drift
// is the one exception: its link works but its card is held back by
// DRIFT_POSITIONS_AVAILABLE, because the data host it read is gone.
export const UJU_EXTERNAL_CHAIN_APPS_ENABLED =
  import.meta.env.VITE_UJU_EXTERNAL_CHAIN_APPS_ENABLED === 'true';

// Ecosystem page path for Nasun AI / Baram.
// /ecosystem/nasun-ai route does not exist; /ecosystem/baram is the canonical slug.
export const ecosystemAiPath = '/ecosystem/baram';
