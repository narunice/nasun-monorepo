import { describe, it, expect } from 'vitest';
import { isInAppWebview } from '../core/webview';

// Representative user-agent strings. In-app browsers must be flagged; real
// mobile and desktop browsers must NOT be (a false positive hides the Google
// sign-in button from a legitimate user).
const IN_APP_UAS: Record<string, string> = {
  'Android System WebView (Telegram)':
    'Mozilla/5.0 (Linux; Android 13; SM-S918B; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36',
  Facebook:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/440.0.0.0]',
  Instagram:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 300.0.0.0',
  LINE:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Line/13.0.0',
  KakaoTalk:
    'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/110.0.0.0 Mobile Safari/537.36 KAKAOTALK 10.0.0',
  WeChat:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.0',
  'iOS WKWebView (Telegram, no Safari token)':
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
};

const REAL_BROWSER_UAS: Record<string, string> = {
  'Desktop Chrome':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Desktop Safari':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  'Mobile Safari (iPhone)':
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  'Mobile Chrome (Android)':
    'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  'Chrome on iOS (CriOS)':
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.0.0 Mobile/15E148 Safari/604.1',
  'Firefox on iOS (FxiOS)':
    'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/120.0 Mobile/15E148 Safari/605.1.15',
  'Google app on iOS (GSA, no Safari token)':
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) GSA/279.0.0 Mobile/15E148',
};

describe('isInAppWebview', () => {
  for (const [name, ua] of Object.entries(IN_APP_UAS)) {
    it(`flags in-app browser: ${name}`, () => {
      expect(isInAppWebview(ua)).toBe(true);
    });
  }

  for (const [name, ua] of Object.entries(REAL_BROWSER_UAS)) {
    it(`does not flag real browser: ${name}`, () => {
      expect(isInAppWebview(ua)).toBe(false);
    });
  }

  it('returns false for empty or missing user agent', () => {
    expect(isInAppWebview('')).toBe(false);
    expect(isInAppWebview(undefined)).toBe(false);
  });
});
