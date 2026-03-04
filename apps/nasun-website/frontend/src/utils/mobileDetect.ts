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

/** Check if the current browser is on an Android device (Chrome, Edge, Samsung Browser, etc.) */
export function isAndroidBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android/i.test(navigator.userAgent);
}

/** Check if running inside MetaMask's in-app dApp browser (injected provider) */
export function isMetaMaskInAppBrowser(): boolean {
  if (typeof window === "undefined") return false;
  return (
    Boolean((window as { ethereum?: unknown }).ethereum) &&
    /MetaMask/i.test(navigator.userAgent)
  );
}

/** Check if running in genuine Safari on iOS (not Chrome/Edge/Firefox wrapper) */
export function isIOSSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  // CriOS=Chrome, FxiOS=Firefox, EdgiOS=Edge, OPiOS=Opera
  const isRealSafari = /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua);
  return isIOS && isRealSafari;
}
