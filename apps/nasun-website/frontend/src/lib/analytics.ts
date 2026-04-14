/**
 * Lightweight analytics wrapper for Umami.
 * Type-safe custom event tracking with no-op fallback
 * when Umami is not loaded (development environment).
 */

type UmamiTrack = {
  (eventName: string, data?: Record<string, string | number | boolean>): void;
  (payload: (props: Record<string, unknown>) => Record<string, unknown>): void;
};

declare global {
  interface Window {
    umami?: {
      track: UmamiTrack;
    };
  }
}

export const AnalyticsEvent = {
  // Auth events
  AUTH_WALLET_START: "auth_wallet_start",
  AUTH_WALLET_SUCCESS: "auth_wallet_success",
  AUTH_WALLET_ERROR: "auth_wallet_error",
  AUTH_GOOGLE_START: "auth_google_start",
  AUTH_GOOGLE_SUCCESS: "auth_google_success",
  AUTH_TWITTER_START: "auth_twitter_start",
  AUTH_TWITTER_SUCCESS: "auth_twitter_success",
  AUTH_TELEGRAM_CONNECT: "auth_telegram_connect",

  // Battalion NFT funnel events
  NFT_STEP_START: "nft_step_start",
  NFT_X_AUTH_SUCCESS: "nft_x_auth_success",
  NFT_TASK_VERIFIED: "nft_task_verified",
  NFT_WALLET_CONNECTED: "nft_wallet_connected",
  NFT_REGISTER_START: "nft_register_start",
  NFT_REGISTER_SUCCESS: "nft_register_success",
  NFT_REGISTER_ERROR: "nft_register_error",

  // Engagement events
  GOVERNANCE_VOTE: "governance_vote",
  LEADERBOARD_VIEW: "leaderboard_view",

  // Cross-app navigation (ecosystem traversal: nasun <-> pado)
  CROSS_APP_NAV: "cross_app_nav",
  CROSS_APP_ARRIVAL: "cross_app_arrival",
} as const;

type EventName = (typeof AnalyticsEvent)[keyof typeof AnalyticsEvent];

export type EcosystemApp = "nasun" | "pado";

/**
 * Track a custom event. No-op if Umami is not loaded.
 */
export function trackEvent(
  event: EventName,
  data?: Record<string, string | number | boolean>,
): void {
  try {
    window.umami?.track(event, data);
  } catch {
    // Analytics should never break the app
  }
}

/**
 * Append the cross-app source param so the destination site can record
 * an arrival event and stop counting the visit as cold traffic.
 */
export function withCrossAppParam(url: string, from: EcosystemApp): string {
  try {
    const u = new URL(url, window.location.origin);
    u.searchParams.set("from", from);
    return u.toString();
  } catch {
    return url;
  }
}

/**
 * Per-session flag: only fire the virtual pageview once per session so a
 * user who clicks an outbound link multiple times does not inflate nasun
 * pageview counts.
 */
const VIRTUAL_PV_SESSION_KEY = "nasun_cross_app_pv_fired";

/**
 * Fire a cross-app navigation event AND a session-scoped virtual pageview.
 *
 * The virtual pageview (url=`/_cross-app/{to}`) bumps the session pageview
 * count to 2+, so Umami no longer classifies this session as a bounce.
 * Without it, users who land on one nasun page and jump to pado are still
 * counted as bounced even though they actually engaged with the ecosystem.
 */
export function trackCrossAppNav(
  to: EcosystemApp,
  targetPath: string,
): void {
  trackEvent(AnalyticsEvent.CROSS_APP_NAV, { to, target_path: targetPath });

  try {
    if (sessionStorage.getItem(VIRTUAL_PV_SESSION_KEY)) return;
    sessionStorage.setItem(VIRTUAL_PV_SESSION_KEY, "1");
    window.umami?.track((props) => ({
      ...props,
      url: `/_cross-app/${to}`,
      referrer: window.location.href,
    }));
  } catch {
    // sessionStorage blocked (private mode) or umami not loaded — safe no-op
  }
}
