/**
 * HS256 JWT verifier — agent-runner side
 *
 * Mirrors chat-server's `baram-session.ts#verifyJWT`. Same secret
 * (`BARAM_SESSION_JWT_SECRET`) signs on chat-server and verifies here.
 * Pre-encoded header constant blocks alg confusion at the byte level.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

const JWT_HEADER_B64 = b64urlEncode(
  Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' }), 'utf8'),
);

interface JwtPayload {
  sid: string;
  iat?: number;
  exp: number;
  jti?: string;
}

export type VerifyJwtResult =
  | { ok: true; sid: string; exp: number }
  | { ok: false; reason: 'malformed' | 'bad_header' | 'bad_signature' | 'bad_payload' | 'expired' | 'no_secret' };

function getSecret(): string {
  const raw = process.env.BARAM_SESSION_JWT_SECRET;
  if (!raw || raw.length < 32) return '';
  return raw;
}

function b64urlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

export function verifyJWT(token: string): VerifyJwtResult {
  const secret = getSecret();
  if (!secret) return { ok: false, reason: 'no_secret' };

  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'malformed' };
  const [headerB64, payloadB64, sigB64] = parts;
  if (headerB64 !== JWT_HEADER_B64) return { ok: false, reason: 'bad_header' };

  const signingInput = `${headerB64}.${payloadB64}`;
  const expectedSig = createHmac('sha256', secret).update(signingInput).digest();
  let providedSig: Buffer;
  try {
    providedSig = b64urlDecode(sigB64);
  } catch {
    return { ok: false, reason: 'bad_signature' };
  }
  if (providedSig.length !== expectedSig.length) return { ok: false, reason: 'bad_signature' };
  if (!timingSafeEqual(providedSig, expectedSig)) return { ok: false, reason: 'bad_signature' };

  let payload: JwtPayload;
  try {
    payload = JSON.parse(b64urlDecode(payloadB64).toString('utf8')) as JwtPayload;
  } catch {
    return { ok: false, reason: 'bad_payload' };
  }
  if (typeof payload.sid !== 'string' || typeof payload.exp !== 'number') {
    return { ok: false, reason: 'bad_payload' };
  }
  const nowSec = Math.floor(Date.now() / 1000);
  if (payload.exp <= nowSec) return { ok: false, reason: 'expired' };
  return { ok: true, sid: payload.sid, exp: payload.exp };
}

/**
 * Constant-time HMAC verification for inbound `/wake` requests.
 * `received` is hex-encoded HMAC-SHA256 from `X-HMAC` header; `body` is
 * the exact request body bytes (must be captured pre-parse).
 */
export function verifyHmac(body: Buffer | string, received: string): boolean {
  const secret = process.env.BARAM_CHAT_SERVER_HMAC_SECRET;
  if (!secret || secret.length < 32) return false;
  const bodyBuf = typeof body === 'string' ? Buffer.from(body, 'utf8') : body;
  const expected = createHmac('sha256', secret).update(bodyBuf).digest();
  let provided: Buffer;
  try {
    provided = Buffer.from(received, 'hex');
  } catch {
    return false;
  }
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}
