const X_HANDLE_RE = /^[A-Za-z0-9_]{1,50}$/;

export function isValidXHandle(handle: string | null | undefined): handle is string {
  return typeof handle === 'string' && X_HANDLE_RE.test(handle);
}

export function xProfileUrl(handle: string): string {
  return `https://x.com/${handle}`;
}
