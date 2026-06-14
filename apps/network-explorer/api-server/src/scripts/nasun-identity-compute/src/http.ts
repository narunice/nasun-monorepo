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

// C8 salt CORS: origin-allowlist ACAO, NO credentials, NO security headers -- byte-parity with the
// zklogin-salt lambda corsHeaders (zklogin-salt/src/index.ts:35-43). The jwt arrives in the request
// BODY (not a cookie/Authorization), so credentials:true is intentionally absent. Header VALUES match
// the lambda exactly ('Content-Type,Authorization' / 'POST,OPTIONS', no spaces). content-type is set
// by send() so it is not duplicated here.
export function saltCors(origin: string | undefined): Record<string, string> {
  const normalized = origin?.replace(/\/$/, '');
  const allowed = normalized && ALLOWED_ORIGINS.includes(normalized) ? normalized : ALLOWED_ORIGINS[0];
  return {
    'access-control-allow-origin': allowed,
    'access-control-allow-headers': 'Content-Type,Authorization',
    'access-control-allow-methods': 'POST,OPTIONS',
  };
}

// C4-1 additional-wallet CORS: byte-parity with the lambda _shared/additional-link/responses.ts
// corsHeaders -- origin-allowlist ACAO + credentials + 4 security headers, methods POST/PATCH/DELETE/
// OPTIONS (label/app-binding are PATCH, remove is DELETE). Error bodies use {message} (the lambda
// convention), which matches the box RouteAbort payload shape, so no re-keying is needed (unlike C8).
export function additionalCors(origin: string | undefined): Record<string, string> {
  const normalized = origin?.replace(/\/$/, '');
  const allowed = normalized && ALLOWED_ORIGINS.includes(normalized) ? normalized : ALLOWED_ORIGINS[0];
  return {
    'access-control-allow-origin': allowed,
    'access-control-allow-headers': 'Content-Type, Authorization',
    'access-control-allow-methods': 'POST, PATCH, DELETE, OPTIONS',
    'access-control-allow-credentials': 'true',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'strict-transport-security': 'max-age=31536000; includeSubDomains',
    'referrer-policy': 'strict-origin-when-cross-origin',
  };
}

// C6 governance CORS: byte-parity with the governance-api lambda corsHeaders (index.ts:605-611) --
// origin-allowlist ACAO, headers Content-Type+Authorization, methods GET/POST/OPTIONS, NO credentials
// (governance is public: identity arrives in the body/query, never a cookie) and NO extra security
// headers (the lambda sets none). Distinct from additionalCors (which adds credentials + 4 sec headers).
export function governanceCors(origin: string | undefined): Record<string, string> {
  const normalized = origin?.replace(/\/$/, '');
  const allowed = normalized && ALLOWED_ORIGINS.includes(normalized) ? normalized : ALLOWED_ORIGINS[0];
  return {
    'access-control-allow-origin': allowed,
    'access-control-allow-headers': 'Content-Type, Authorization',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
  };
}

// get-user-profile GET-read CORS: byte-parity with the get-user-profile lambda corsHeaders
// (index.ts:398-402 + getCorsOrigin): origin-allowlist ACAO (echo the request origin when allow-listed,
// else ALLOWED_ORIGINS[0]), headers Content-Type+Authorization, methods GET/POST/PATCH/OPTIONS (the lambda
// advertises all of its proxy methods), NO credentials, NO extra security headers. The lambda matches the
// RAW origin (no trailing-slash strip) -- replicated exactly so a (hypothetical) origin with a trailing
// slash falls back identically. ALLOWED_ORIGINS is byte-identical to the lambda env (verified at cutover),
// so cross-app reads (pado/gostop) get the identical ACAO.
export function profileCors(origin: string | undefined): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'access-control-allow-origin': allowed,
    'access-control-allow-headers': 'Content-Type, Authorization',
    'access-control-allow-methods': 'GET, POST, PATCH, OPTIONS',
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
