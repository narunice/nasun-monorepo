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

/**
 * Whether the positions card may be rendered at all.
 *
 * False because DRIFT_DATA_API_URL no longer resolves. The name is still
 * published, but as a CNAME to a CloudFront distribution that has been
 * decommissioned, so the chain dead-ends with no address record. Verified
 * against both Cloudflare and Google resolvers on 2026-10-23 and again on
 * 2026-10-25:
 *
 *   data.api.drift.trade          CNAME d11f8fghvsqvvx.cloudfront.net
 *   d11f8fghvsqvvx.cloudfront.net A     (none; NOERROR with an empty answer)
 *
 * A dangling CNAME fails at DNS, before any request, so there is nothing a
 * retry or a timeout can recover and every render of the card would show a
 * permanent error. Only the balance read is gone: the Apps Directory entry is
 * unaffected because it carries its own `url` in appRegistry (app.drift.trade,
 * a different host that still resolves), so a user can still open Drift.
 * DRIFT_APP_URL below is read only by the card, so it goes out with it.
 *
 * To re-enable: point DRIFT_DATA_API_URL at Drift's current data host,
 * confirm the /authority/{id}/snapshots/overview shape still matches
 * useDriftPositionsSummary, and flip this to true.
 */
export const DRIFT_POSITIONS_AVAILABLE = false;

// Public app URL. Drift's frontend reads the connected wallet itself; an
// explicit ?authority= param is not part of the documented deep link, so
// we just open the dashboard and let the user connect.
export const DRIFT_APP_URL = "https://app.drift.trade";
