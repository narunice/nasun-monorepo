/**
 * Nasun Link URL Encoding
 *
 * Encodes/decodes LinkData as compact ClaimPayload for URL embedding.
 * Uses HMAC-SHA256 with domain-separated key for integrity protection.
 *
 * URL format: https://nasun.io/claim/{base64url(ClaimPayload)}#{secret}
 *
 * Security:
 * - HMAC key is derived via SHA-256("nasun-link-hmac:" + secret),
 *   separated from the PBKDF2 key used for encryptedPayload decryption.
 * - Only supports single-type links (no server-side state needed).
 */

import type { LinkData, SerializableLinkConfig } from './types';
import { generateLinkId } from './crypto';

/** HMAC key derivation prefix (domain separation from PBKDF2) */
const HMAC_DOMAIN_PREFIX = 'nasun-link-hmac:';

/** Truncated HMAC length in bytes (128 bits) */
const HMAC_TRUNCATE_BYTES = 16;

/**
 * Compact claim payload for URL encoding.
 * Short field names minimize URL length.
 */
interface ClaimPayload {
  /** ephemeralAddress */
  e: string;
  /** encryptedPayload */
  p: string;
  /** coinType */
  c: string;
  /** amount (string, base units) */
  a: string;
  /** message (optional) */
  m?: string;
  /** creator address (optional) */
  r?: string;
  /** expiresAt in seconds (optional) */
  x?: number;
  /** HMAC-SHA256 truncated, base64url */
  h: string;
}

// ============================================
// Base64url helpers (no external dependencies)
// ============================================

function toBase64url(data: Uint8Array): string {
  // Avoid spread on large arrays (RangeError for >65k elements)
  let binary = '';
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function stringToBase64url(str: string): string {
  return btoa(
    // Handle Unicode by encoding as UTF-8 first
    encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) =>
      String.fromCharCode(parseInt(p1 as string, 16))
    )
  )
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function base64urlToString(b64: string): string {
  // Restore standard base64
  const base64 = b64.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const decoded = atob(padded);
  // Decode UTF-8
  return decodeURIComponent(
    decoded
      .split('')
      .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
      .join('')
  );
}

/** Convert base64url string to Uint8Array */
export function fromBase64url(b64: string): Uint8Array {
  const base64 = b64.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

// ============================================
// HMAC with domain-separated key
// ============================================

/**
 * Derive HMAC key with domain separation.
 * Uses SHA-256("nasun-link-hmac:" + secret) as the HMAC key,
 * ensuring it is independent from the PBKDF2 key derivation.
 */
async function deriveHmacKey(secret: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();

  // Domain-separated key material
  const keyMaterial = await crypto.subtle.digest(
    'SHA-256',
    encoder.encode(HMAC_DOMAIN_PREFIX + secret)
  );

  return crypto.subtle.importKey(
    'raw',
    keyMaterial,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

/**
 * Compute truncated HMAC-SHA256 over the payload.
 * Returns first 16 bytes as base64url (~22 chars).
 */
async function computeHmac(
  payload: Omit<ClaimPayload, 'h'>,
  secret: string
): Promise<string> {
  const key = await deriveHmacKey(secret);
  const data = new TextEncoder().encode(JSON.stringify(payload));
  const signature = await crypto.subtle.sign('HMAC', key, data);
  const truncated = new Uint8Array(signature).slice(0, HMAC_TRUNCATE_BYTES);
  return toBase64url(truncated);
}

/**
 * Verify HMAC of a decoded ClaimPayload.
 */
async function verifyHmac(
  payload: ClaimPayload,
  secret: string
): Promise<boolean> {
  const { h, ...rest } = payload;
  const expected = await computeHmac(rest, secret);
  // Constant-time comparison (length check + bitwise)
  if (h.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < h.length; i++) {
    diff |= h.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

// ============================================
// Public API
// ============================================

/**
 * Encode LinkData into a compact base64url string for URL embedding.
 *
 * Extracts only the fields needed for claiming, computes an HMAC
 * for integrity protection, and returns a URL-safe encoded string.
 *
 * @param data - LinkData from createLink()
 * @param secret - Secret from URL hash fragment
 * @returns base64url-encoded ClaimPayload string
 */
export async function encodeClaimPayload(
  data: LinkData,
  secret: string
): Promise<string> {
  // Build minimal payload (omit undefined optional fields)
  const payload: Omit<ClaimPayload, 'h'> = {
    e: data.ephemeralAddress,
    p: data.encryptedPayload,
    c: data.config.coinType,
    a: data.config.amount,
  };

  if (data.config.message) {
    (payload as ClaimPayload).m = data.config.message;
  }
  if (data.creator) {
    (payload as ClaimPayload).r = data.creator;
  }
  if (data.config.expiresAt) {
    (payload as ClaimPayload).x = Math.floor(data.config.expiresAt / 1000);
  }

  // Compute HMAC
  const hmac = await computeHmac(payload, secret);
  const fullPayload: ClaimPayload = { ...payload, h: hmac };

  // Encode: JSON -> base64url
  const json = JSON.stringify(fullPayload);
  return stringToBase64url(json);
}

/**
 * Decode a base64url-encoded ClaimPayload and verify its integrity.
 *
 * Returns a synthetic LinkData object suitable for passing to
 * LinkClaimPage and claimLink().
 *
 * @param encoded - base64url string from URL path
 * @param secret - Secret from URL hash fragment
 * @returns Synthetic LinkData object
 * @throws Error if HMAC verification fails or data is malformed
 */
export async function decodeClaimPayload(
  encoded: string,
  secret: string
): Promise<LinkData> {
  // Decode: base64url -> JSON
  let payload: ClaimPayload;
  try {
    const json = base64urlToString(encoded);
    payload = JSON.parse(json) as ClaimPayload;
  } catch {
    throw new Error('Invalid link format');
  }

  // Validate required fields
  if (!payload.e || !payload.p || !payload.c || !payload.a || !payload.h) {
    throw new Error('Invalid link data: missing required fields');
  }

  // Verify HMAC integrity
  const valid = await verifyHmac(payload, secret);
  if (!valid) {
    throw new Error('Link integrity check failed');
  }

  // Reconstruct synthetic LinkData
  const config: SerializableLinkConfig = {
    type: 'single',
    coinType: payload.c,
    amount: payload.a,
    ...(payload.m && { message: payload.m }),
    ...(payload.x && { expiresAt: payload.x * 1000 }),
  };

  return {
    id: generateLinkId(payload.e),
    creator: payload.r ?? '',
    ephemeralAddress: payload.e,
    encryptedPayload: payload.p,
    config,
    status: 'active',
    claimCount: 0,
    createdAt: Date.now(),
  };
}
