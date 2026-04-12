/**
 * Lightweight analytics wrapper for Umami (pado).
 * Mirrors apps/nasun-website/frontend/src/lib/analytics.ts.
 *
 * Only ecosystem-level cross-app events are defined here for now.
 * Add product events incrementally as they are needed.
 */

declare global {
  interface Window {
    umami?: {
      track: (eventName: string, data?: Record<string, string | number | boolean>) => void;
    };
  }
}

export const AnalyticsEvent = {
  CROSS_APP_NAV: "cross_app_nav",
  CROSS_APP_ARRIVAL: "cross_app_arrival",
} as const;

type EventName = (typeof AnalyticsEvent)[keyof typeof AnalyticsEvent];

export type EcosystemApp = "nasun" | "pado";

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

export function withCrossAppParam(url: string, from: EcosystemApp): string {
  try {
    const u = new URL(url, window.location.origin);
    u.searchParams.set("from", from);
    return u.toString();
  } catch {
    return url;
  }
}

export function trackCrossAppNav(
  to: EcosystemApp,
  targetPath: string,
): void {
  trackEvent(AnalyticsEvent.CROSS_APP_NAV, { to, target_path: targetPath });
}
