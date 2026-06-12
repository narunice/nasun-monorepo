// HTTP helpers: CORS + response writers. Two CORS modes:
//   - publicCors:    ACAO:* for the public /count (parity with C0/C1; fronted by an API GW HTTP_PROXY
//                    that cannot present a bearer; the count is public data).
//   - loginCors:     origin-allowlist + credentials:true (parity with auth-sui/auth-metamask index
//                    getSecurityHeaders) for /compute/auth/* so the browser login fetch is unbroken.

import type { ServerResponse } from 'node:http';
import { ALLOWED_ORIGINS } from './config';

export function publicCors(): Record<string, string> {
  return { 'access-control-allow-origin': '*' };
}

export function loginCors(origin: string | undefined): Record<string, string> {
  const normalized = origin?.replace(/\/$/, '');
  const allowed = normalized && ALLOWED_ORIGINS.includes(normalized) ? normalized : ALLOWED_ORIGINS[0];
  return {
    'access-control-allow-origin': allowed,
    'access-control-allow-headers': 'Content-Type, Authorization',
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-credentials': 'true',
    // Full parity with the auth-sui/auth-metamask lambda getSecurityHeaders (index.ts): keep all four
    // security headers, not just the two CORS-adjacent ones, so the box response is byte-identical.
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'strict-transport-security': 'max-age=31536000; includeSubDomains',
    'referrer-policy': 'strict-origin-when-cross-origin',
  };
}

export function send(
  res: ServerResponse,
  status: number,
  body: unknown,
  cors: Record<string, string>,
): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(payload),
    ...cors,
  });
  res.end(payload);
}

// Typed 4xx abort: handlers throw this for client errors so the server maps status/body instead of
// collapsing into a generic 500 (the C0 server.mjs flagged this exact follow-up for C3+).
export class RouteAbort extends Error {
  constructor(public status: number, public payload: Record<string, unknown>) {
    super(typeof payload.message === 'string' ? payload.message : `HTTP ${status}`);
  }
}
