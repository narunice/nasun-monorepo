/**
 * useCrossAppArrival Hook
 *
 * Detects ?from=nasun (or ?from=pado) on first load, fires a
 * `cross_app_arrival` Umami event, then strips the param from the URL.
 *
 * Umami loads with `defer`, so `window.umami` may be undefined when this
 * hook runs. We poll for it briefly so arrival events are not silently
 * dropped (the main source of "nav > arrival" gap).
 *
 * Mount once at the app root.
 */

import { useEffect } from "react";
import { AnalyticsEvent, type EcosystemApp } from "../lib/analytics";

const VALID_SOURCES: ReadonlySet<EcosystemApp> = new Set(["nasun", "pado"]);
const POLL_INTERVAL_MS = 100;
const MAX_WAIT_MS = 5000;

function fireWhenReady(
  eventName: string,
  data: Record<string, string | number | boolean>,
): void {
  const deadline = Date.now() + MAX_WAIT_MS;
  const tryFire = () => {
    if (window.umami?.track) {
      try {
        window.umami.track(eventName, data);
      } catch {
        // analytics must never break the app
      }
      return;
    }
    if (Date.now() >= deadline) return;
    setTimeout(tryFire, POLL_INTERVAL_MS);
  };
  tryFire();
}

export function useCrossAppArrival(): void {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const from = params.get("from");
    if (!from || !VALID_SOURCES.has(from as EcosystemApp)) return;

    const landingPath = window.location.pathname;
    params.delete("from");
    const newUrl =
      landingPath +
      (params.toString() ? `?${params.toString()}` : "") +
      window.location.hash;
    window.history.replaceState({}, "", newUrl);

    fireWhenReady(AnalyticsEvent.CROSS_APP_ARRIVAL, {
      from,
      landing_path: landingPath,
    });
  }, []);
}
