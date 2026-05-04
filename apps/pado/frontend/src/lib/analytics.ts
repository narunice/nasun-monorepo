/**
 * Lightweight analytics wrapper for Umami (pado).
 * Mirrors apps/nasun-website/frontend/src/lib/analytics.ts.
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
  CROSS_APP_NAV: "cross_app_nav",
  CROSS_APP_ARRIVAL: "cross_app_arrival",
  PREDICTION_FORM_MODE_INITIAL: "prediction_form_mode_initial",
  PREDICTION_FORM_MODE_TOGGLED: "prediction_form_mode_toggled",
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

/**
 * Per-session flag: only fire the virtual pageview once per session so a
 * user who clicks an outbound link multiple times does not inflate pado
 * pageview counts.
 */
const VIRTUAL_PV_SESSION_KEY = "nasun_cross_app_pv_fired";

/**
 * Fire a cross-app navigation event AND a session-scoped virtual pageview
 * so this session no longer counts as a bounce in Umami.
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
