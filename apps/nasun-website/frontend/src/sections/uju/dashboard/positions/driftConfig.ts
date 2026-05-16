// Drift positions configuration.
//
// Reads the user's Drift activity directly from Drift's public Data API
// (no API key, no SDK). The /authority/{authorityId}/snapshots/overview
// endpoint returns the latest per-subaccount snapshot (accountBalance,
// unrealizedPnl, cumulativeRealizedPnl), which is exactly the shape this
// card surfaces.
//
// Why Data API over @drift-labs/sdk:
//   - SDK pulls @solana/web3.js + @coral-xyz/anchor + browserify polyfills.
//     For a single read-only summary card the bundle cost is unjustified.
//   - Drift Program upgrades break borsh decoders; the Data API absorbs
//     that risk on Drift's side.
//   - 100% precision is unnecessary here. The card shows trailing 24h
//     snapshot values, not live mark-to-market.

export const DRIFT_DATA_API_URL = "https://data.api.drift.trade";

// Public app URL. Drift's frontend reads the connected wallet itself; an
// explicit ?authority= param is not part of the documented deep link, so
// we just open the dashboard and let the user connect.
export const DRIFT_APP_URL = "https://app.drift.trade";
