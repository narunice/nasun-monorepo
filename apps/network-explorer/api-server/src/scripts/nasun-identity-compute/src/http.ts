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

// Twitter (X) login CORS: byte-parity with the auth-twitter lambda getSecurityHeaders (login.ts:22-38 +
// callback.ts:17-33) -- origin-allowlist ACAO + credentials:true + the four security headers, headers
// 'Content-Type'. The lambda uses two method sets (login advertises GET, callback POST); the box advertises
// the union 'GET, POST, OPTIONS' (a superset is CORS-safe: the browser checks the requested method is in the
// list). The lambda's login normalizes via extractOrigin (full-URL Referer) while callback strips a trailing
// slash; for a real Origin header (protocol//host, no path) both equal this trailing-slash strip, so the
// CORS ACAO is identical. content-type is set by send() so it is not duplicated here.
export function twitterCors(origin: string | undefined): Record<string, string> {
  const normalized = origin?.replace(/\/$/, '');
  const allowed = normalized && ALLOWED_ORIGINS.includes(normalized) ? normalized : ALLOWED_ORIGINS[0];
  return {
    'access-control-allow-origin': allowed,
    'access-control-allow-headers': 'Content-Type',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-credentials': 'true',
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

// C3b wallet CORS: byte-parity with the wallet-api lambda corsHeaders (index.ts:20-27 + getCorsOrigin):
// origin-allowlist ACAO matched against the RAW Origin (no trailing-slash strip -- getCorsOrigin compares
// the raw header, falling back to ALLOWED_ORIGINS[0]), headers 'Content-Type,Authorization' (no spaces),
// methods 'GET,POST,DELETE,OPTIONS' (no spaces -- the lambda advertises all of its proxy methods), NO
// credentials, NO extra security headers. content-type is set by send() so it is not duplicated here.
export function walletCors(origin: string | undefined): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'access-control-allow-origin': allowed,
    'access-control-allow-headers': 'Content-Type,Authorization',
    'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
  };
}

// #3a deactivate CORS: byte-parity with the deactivate-user-account lambda corsHeader (index.ts:26-30 +
// getCorsOrigin): origin-allowlist ACAO matched against the RAW Origin (no trailing-slash strip -- the lambda
// getCorsOrigin compares the raw header, falling back to ALLOWED_ORIGINS[0]), headers 'Content-Type' (NO
// Authorization -- the route is no-JWT/no-auth), methods 'DELETE, OPTIONS', NO credentials, NO extra security
// headers. content-type is set by send() so it is not duplicated here.
export function deactivateCors(origin: string | undefined): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'access-control-allow-origin': allowed,
    'access-control-allow-headers': 'Content-Type',
    'access-control-allow-methods': 'DELETE, OPTIONS',
  };
}

// #3b link-account CORS: byte-parity with the link-account lambda corsHeaders (index.ts:102-106,135-139 +
// getCorsOrigin): origin-allowlist ACAO matched against the RAW Origin (no trailing-slash strip -- the lambda
// getCorsOrigin compares the raw header, falling back to ALLOWED_ORIGINS[0]), headers 'Content-Type, Authorization',
// methods 'POST, OPTIONS' (the lambda advertises only POST/OPTIONS), NO credentials, NO extra security headers.
// content-type is set by send() so it is not duplicated here.
export function linkCors(origin: string | undefined): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'access-control-allow-origin': allowed,
    'access-control-allow-headers': 'Content-Type, Authorization',
    'access-control-allow-methods': 'POST, OPTIONS',
  };
}

// Ship1 ecosystem activate/deactivate/status CORS: byte-parity with the ecosystem-api lambda jsonResponse
// (index.ts:62-77, ACAO origin-allowlist matched against the RAW Origin) PLUS the API GW
// defaultCorsPreflightOptions the lambda relied on for OPTIONS (Content-Type+Authorization headers, all
// methods). The box serves its own preflight, so the headers/methods are set here. NO credentials, NO extra
// security headers (the lambda set none). Methods GET (status) + POST (activate/deactivate) + OPTIONS.
export function ecosystemCors(origin: string | undefined): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'access-control-allow-origin': allowed,
    'access-control-allow-headers': 'Content-Type, Authorization',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
  };
}

// Ship1 genesis-pass/check CORS: byte-parity with the genesis-pass-check lambda corsHeaders
// (check/src/index.ts:63-70 + getCorsOrigin, ACAO origin-allowlist matched against the RAW Origin):
// headers Content-Type only (the route is public/no-Authorization), methods GET,OPTIONS, NO credentials.
// Cross-origin from pado.finance (the GP-badge hot path) works because pado.finance is in ALLOWED_ORIGINS.
export function genesisPassCheckCors(origin: string | undefined): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'access-control-allow-origin': allowed,
    'access-control-allow-headers': 'Content-Type',
    'access-control-allow-methods': 'GET, OPTIONS',
  };
}

// AdminStack admin-api CORS: byte-parity with the admin-api lambda utils/response.ts corsHeaders
// (ALLOWED_ORIGINS allow-list: echo the request origin when allow-listed, else ALLOWED_ORIGINS[0]),
// headers 'Content-Type, Authorization', methods 'GET, POST, PUT, DELETE, OPTIONS', credentials:true.
// The lambda matches the RAW origin (no trailing-slash strip) -- replicated exactly. Used by every
// /admin/* route (export CSV + JSON + the write delegations).
export function adminCors(origin: string | undefined): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'access-control-allow-origin': allowed,
    'access-control-allow-headers': 'Content-Type, Authorization',
    'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'access-control-allow-credentials': 'true',
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

// Raw-body writer (NOT JSON): the AdminStack CSV export routes return text/csv with a
// Content-Disposition attachment header (the lambda utils/response.ts csvResponse). send() always
// JSON.stringifies + sets application/json, so it cannot emit a CSV blob. contentType carries the full
// header value (e.g. 'text/csv; charset=utf-8'); extraHeaders carries Content-Disposition etc.
export function sendRaw(
  res: ServerResponse,
  status: number,
  body: string,
  contentType: string,
  extraHeaders: Record<string, string> = {},
): void {
  res.writeHead(status, {
    'content-type': contentType,
    'content-length': Buffer.byteLength(body),
    ...extraHeaders,
  });
  res.end(body);
}

// Typed 4xx abort: handlers throw this for client errors so the server maps status/body instead of
// collapsing into a generic 500 (the C0 server.mjs flagged this exact follow-up for C3+).
export class RouteAbort extends Error {
  constructor(public status: number, public payload: Record<string, unknown>) {
    super(typeof payload.message === 'string' ? payload.message : `HTTP ${status}`);
  }
}
