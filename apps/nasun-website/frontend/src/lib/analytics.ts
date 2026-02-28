/**
 * Lightweight analytics wrapper for Umami.
 * Type-safe custom event tracking with no-op fallback
 * when Umami is not loaded (development environment).
 */

declare global {
  interface Window {
    umami?: {
      track: (eventName: string, data?: Record<string, string | number | boolean>) => void;
    };
  }
}

export const AnalyticsEvent = {
  // Auth events
  AUTH_METAMASK_START: "auth_metamask_start",
  AUTH_METAMASK_SUCCESS: "auth_metamask_success",
  AUTH_METAMASK_ERROR: "auth_metamask_error",
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
} as const;

type EventName = (typeof AnalyticsEvent)[keyof typeof AnalyticsEvent];

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
