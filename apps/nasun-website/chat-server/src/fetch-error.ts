// Compact diagnostic formatter for fetch() failures.
//
// 2026-05-19 incident: 8h of `[baram-tg] sendMessage failed: fetch failed` in
// prod logs with no underlying cause attached. err.cause was either undefined
// or falsy in every observed case, even though undici normally surfaces a
// SocketError / HeadersTimeoutError there. Surface every other reachable
// signal (name, code, errno, constructor) so the next incident is triagable
// from a single grep.
export function describeFetchError(err: unknown): string {
  if (!(err instanceof Error)) return `non-error thrown: ${String(err)}`;
  const e = err as Error & {
    code?: string;
    errno?: number | string;
    cause?: unknown;
  };
  const parts: string[] = [`name=${e.name}`, `msg=${e.message}`];
  if (e.code) parts.push(`code=${e.code}`);
  if (e.errno != null) parts.push(`errno=${e.errno}`);
  if (e.cause !== undefined && e.cause !== null) {
    if (e.cause instanceof Error) {
      const c = e.cause as Error & { code?: string; errno?: number | string };
      parts.push(`cause=${c.name}:${c.message}`);
      if (c.code) parts.push(`cause_code=${c.code}`);
      if (c.errno != null) parts.push(`cause_errno=${c.errno}`);
    } else {
      parts.push(`cause=${String(e.cause)}`);
    }
  } else {
    parts.push('cause=<absent>');
  }
  return parts.join(' ');
}
