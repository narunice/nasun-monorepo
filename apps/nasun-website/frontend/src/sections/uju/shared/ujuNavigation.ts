import { useEffect } from "react";
import type { SetURLSearchParams } from "react-router-dom";

// Cross-tab navigation with deferred scroll target. Why sessionStorage and
// not URL hash: hash pollutes browser history, double-mount under StrictMode
// can fire scroll twice, and clearing the hash mid-paint is fragile.
const SCROLL_TARGET_KEY = "uju:scrollTarget";

/**
 * Switch to the activity tab and scroll to the Apps Directory section after
 * mount. Helper centralizes the contract used by ActivatedAppsSection and
 * UjuDailyMissionsCard "Manage / Activate apps in Activity tab" buttons.
 */
export function goToActivityDirectory(setSearchParams: SetURLSearchParams) {
  try {
    sessionStorage.setItem(SCROLL_TARGET_KEY, "apps-directory");
  } catch {
    // sessionStorage may be disabled (private mode); fall through — tab
    // switch still works, only scroll-to is lost.
  }
  setSearchParams({ tab: "activity" }, { replace: true });
}

/**
 * Switch to the dashboard tab and scroll to the Activated Apps section.
 * Used by the "Go to Activated Apps →" button at the bottom of the
 * Apps Directory card on the activity tab.
 */
export function goToDashboardActivatedApps(
  setSearchParams: SetURLSearchParams,
) {
  try {
    sessionStorage.setItem(SCROLL_TARGET_KEY, "activated-apps");
  } catch {
    // ignore storage errors
  }
  setSearchParams({ tab: "dashboard" }, { replace: true });
}

/**
 * Read and clear a pending scroll target. Returns null if no target queued.
 * Designed to be called from the ActivityTab mount effect.
 */
export function consumeScrollTarget(): string | null {
  try {
    const target = sessionStorage.getItem(SCROLL_TARGET_KEY);
    if (target) sessionStorage.removeItem(SCROLL_TARGET_KEY);
    return target;
  } catch {
    return null;
  }
}

/**
 * Mount-time effect that scrolls to a `[data-uju-scroll-target="..."]`
 * element when the pending sessionStorage target matches `expected`.
 * Defers two animation frames so cards have painted before scrollIntoView
 * fires. Only consumes the target if it matches — leaves it in place for
 * other tabs to handle.
 */
export function useConsumeScrollTarget(expected: string): void {
  useEffect(() => {
    const target = sessionStorage.getItem(SCROLL_TARGET_KEY);
    if (target !== expected) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = document.querySelector(
          `[data-uju-scroll-target="${target}"]`,
        );
        if (el) {
          consumeScrollTarget();
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
    });
    // expected is constant per call site; no other deps needed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
