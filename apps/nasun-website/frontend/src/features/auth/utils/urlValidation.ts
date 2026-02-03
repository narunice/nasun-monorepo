/**
 * Validates a return URL to prevent open redirect attacks.
 * Only allows relative paths on the same origin.
 */
export function isValidReturnUrl(url: string): boolean {
  // Must start with "/" to be a relative path (blocks "//evil.com", "https://evil.com", "javascript:", etc.)
  if (!url.startsWith("/")) {
    return false;
  }

  try {
    const parsed = new URL(url, window.location.origin);
    return parsed.origin === window.location.origin;
  } catch {
    return false;
  }
}
