/**
 * In-app webview (embedded browser) detection.
 *
 * Google blocks OAuth sign-in inside embedded webviews with a
 * `disallowed_useragent` error as a security policy, so zkLogin (Continue with
 * Google) can never succeed there. We detect these environments to warn the
 * user and steer them toward Passkey or opening the page in the default
 * browser, instead of surfacing an unexplained "Login failed".
 *
 * The heuristic is deliberately conservative: a false positive would wrongly
 * de-emphasize the Google button for a real mobile Chrome/Safari user, so each
 * pattern targets a specific known in-app browser, plus the generic Android
 * System WebView marker.
 */

// Explicit in-app browser user-agent tokens. Each entry documents which app it
// matches. Order does not matter (first match wins).
const IN_APP_WEBVIEW_PATTERNS: ReadonlyArray<RegExp> = [
  /FBAN|FBAV|FB_IAB/i, // Facebook / Messenger in-app browser
  /Instagram/i, // Instagram in-app browser
  /\bLine\//i, // LINE in-app browser (UA token "Line/x.x.x")
  /KAKAOTALK/i, // KakaoTalk in-app browser
  /MicroMessenger/i, // WeChat in-app browser
  /\bTwitter\b/i, // Twitter / X in-app browser
  /\bSnapchat\b/i, // Snapchat in-app browser
  /;\s?wv\b/i, // Android System WebView (Telegram and most Android in-app browsers)
];

/**
 * iOS in-app browsers (WKWebView based, e.g. Telegram on iPhone) expose no
 * dedicated UA token. Real iOS Safari always includes a "Safari/" token, while
 * WKWebView omits it. Alternative iOS browsers (Chrome CriOS, Firefox FxiOS,
 * Edge EdgiOS) and Google's own app (GSA) are excluded outright: they either
 * keep "Safari/" or are Google clients where OAuth works, so we never warn.
 * Standalone home-screen web apps also omit "Safari/", so this is best-effort,
 * not authoritative. Note: modern iPadOS in-app webviews report as "Macintosh"
 * and are not detectable here.
 */
function isIosInAppWebview(ua: string): boolean {
  if (!/iPhone|iPod|iPad/i.test(ua)) return false;
  if (/CriOS|FxiOS|EdgiOS|GSA/i.test(ua)) return false;
  return /AppleWebKit/i.test(ua) && /Mobile\//i.test(ua) && !/Safari\//i.test(ua);
}

/**
 * Returns true when the page is running inside a known in-app browser
 * (embedded webview) where Google OAuth sign-in is blocked.
 *
 * @param userAgent optional override (defaults to navigator.userAgent)
 */
export function isInAppWebview(userAgent?: string): boolean {
  const ua = userAgent ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '');
  if (!ua) return false;
  if (IN_APP_WEBVIEW_PATTERNS.some((re) => re.test(ua))) return true;
  return isIosInAppWebview(ua);
}
