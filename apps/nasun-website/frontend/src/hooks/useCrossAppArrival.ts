/**
 * useCrossAppArrival Hook
 *
 * Detects ?from=pado on first load, fires a `cross_app_arrival` Umami event,
 * then strips the param from the URL so it does not leak into shares or
 * pollute downstream analytics.
 *
 * Mount once at the app root.
 */

import { useEffect } from "react";
import { trackEvent, AnalyticsEvent, type EcosystemApp } from "@/lib/analytics";

const VALID_SOURCES: ReadonlySet<EcosystemApp> = new Set(["nasun", "pado"]);

export function useCrossAppArrival(): void {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const from = params.get("from");
    if (!from || !VALID_SOURCES.has(from as EcosystemApp)) return;

    trackEvent(AnalyticsEvent.CROSS_APP_ARRIVAL, {
      from,
      landing_path: window.location.pathname,
    });

    params.delete("from");
    const newUrl =
      window.location.pathname +
      (params.toString() ? `?${params.toString()}` : "") +
      window.location.hash;
    window.history.replaceState({}, "", newUrl);
  }, []);
}
