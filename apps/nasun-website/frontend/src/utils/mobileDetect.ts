/**
 * Mobile browser detection utilities
 *
 * Uses navigator.userAgent to detect actual device platform,
 * not screen width (which can be misleading on desktop).
 */

/** Check if the current browser is on a mobile device (iOS/Android) */
export function isMobileBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}
