// Box filesystem screenshot store -- the S3 presigned POST/GET replacement for the bug-report de-Lambda lift.
//
// The lambda used S3 createPresignedPost (browser uploads directly to S3) + getSignedUrl (admin <img> GETs).
// On box we keep the EXACT browser contract (so the frontend is unchanged) by mimicking S3's presigned POST:
//   - GET /bug-report/upload-url returns { url, fields, key } where `url` is the box screenshot-upload endpoint
//     and `fields` carry the signed token. The frontend appends `fields` + the `file` part to a FormData and
//     POSTs it (byte-identical to the S3 flow); the upload endpoint verifies the HMAC, enforces size +
//     content-type, and writes the file to disk. Returns 204 (S3 presigned POST success parity).
//   - Admin screenshotUrls are HMAC-signed GET URLs (?key&exp&sig) the admin browser loads as <img src> (no
//     Authorization header possible on an <img>, so a signed query param is the presigned-GET equivalent).
//
// Files live at SCREENSHOTS_DIR/bug-screenshots/<identityId>/<uuid>.<ext>. Retention: a daily prune deletes any
// file not referenced by a NON-terminal report once it is older than SCREENSHOT_RETENTION_DAYS (closed-report
// images + orphan uploads). Open-report images are never pruned. Matches "fixed report images can be deleted
// soon"; no durable object store (zero AWS, zero external dependency).

import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
import { mkdir, writeFile, readFile, readdir, stat, unlink } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { SCREENSHOTS } from './config';

export const MAX_SCREENSHOT_SIZE = 5 * 1024 * 1024; // 5MB (parity with the lambda SCREENSHOT_MAX_SIZE)
const UPLOAD_TTL_SEC = 300; // 5 min (parity with createPresignedPost Expires)
const GET_TTL_SEC = 3600; // 1h (parity with getSignedUrl expiresIn)

const CONTENT_TYPE_TO_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};
const EXT_TO_CONTENT_TYPE: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
};
export const ALLOWED_UPLOAD_CONTENT_TYPES = Object.keys(CONTENT_TYPE_TO_EXT);

// Key format the lambda enforced on submit: bug-screenshots/<identityId>/<uuid>.<ext>. identityId is the
// cognito-style "region:uuid" (so ':' is allowed); no '..' / '//' possible (segments exclude '.' and '/').
const KEY_RE = /^bug-screenshots\/[A-Za-z0-9:_-]+\/[A-Za-z0-9-]+\.(png|jpg|webp)$/;

export function isValidKey(key: unknown): key is string {
  return typeof key === 'string' && KEY_RE.test(key) && !key.includes('..') && !key.includes('//');
}

function signingKey(): string | null {
  return SCREENSHOTS.signingKey || null;
}

function hmac(parts: string[]): string {
  const key = signingKey();
  if (!key) throw new Error('screenshot signing key not configured');
  return createHmac('sha256', key).update(parts.join('\n')).digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

function fullPath(key: string): string {
  const full = resolve(join(SCREENSHOTS.dir, key));
  const base = resolve(SCREENSHOTS.dir) + sep;
  if (!full.startsWith(base)) throw new Error('path traversal');
  return full;
}

// ---- upload (presigned POST replacement) ---------------------------------------------------------

export interface PresignedUpload {
  url: string;
  fields: Record<string, string>;
  key: string;
}

// Build the { url, fields, key } the frontend POSTs a FormData against. `fields` carry the signed token so the
// unauthenticated multipart POST is authorized + bound to (key, contentType, exp).
export function buildUpload(identityId: string, contentType: string): PresignedUpload | null {
  const ext = CONTENT_TYPE_TO_EXT[contentType];
  if (!ext) return null;
  if (!signingKey()) return null;
  const key = `bug-screenshots/${identityId}/${randomUUID()}.${ext}`;
  const exp = String(Math.floor(Date.now() / 1000) + UPLOAD_TTL_SEC);
  const sig = hmac(['upload', key, contentType, exp]);
  return {
    url: `${SCREENSHOTS.publicBaseUrl}/bug-report/screenshot-upload`,
    fields: { key, 'Content-Type': contentType, 'x-exp': exp, 'x-sig': sig },
    key,
  };
}

export type UploadVerify =
  | { ok: true; key: string; contentType: string }
  | { ok: false; status: number; error: string };

// Verify a multipart upload form (key/Content-Type/x-exp/x-sig). Constant-time HMAC; rejects expired/forged.
export function verifyUpload(fields: {
  key?: string;
  contentType?: string;
  exp?: string;
  sig?: string;
}): UploadVerify {
  const { key, contentType, exp, sig } = fields;
  if (!key || !contentType || !exp || !sig) return { ok: false, status: 400, error: 'Missing upload fields' };
  if (!isValidKey(key)) return { ok: false, status: 400, error: 'Invalid key' };
  if (!CONTENT_TYPE_TO_EXT[contentType]) return { ok: false, status: 400, error: 'Invalid content type' };
  // The key extension must match the declared content type (a presigned token is bound to one content type).
  if (!key.endsWith(`.${CONTENT_TYPE_TO_EXT[contentType]}`)) return { ok: false, status: 400, error: 'Key/type mismatch' };
  const expNum = Number(exp);
  if (!Number.isFinite(expNum) || expNum * 1000 < Date.now()) return { ok: false, status: 403, error: 'Upload URL expired' };
  if (!signingKey()) return { ok: false, status: 500, error: 'Screenshot upload not configured' };
  if (!safeEqual(sig, hmac(['upload', key, contentType, exp]))) return { ok: false, status: 403, error: 'Invalid signature' };
  return { ok: true, key, contentType };
}

export async function writeScreenshot(key: string, data: Buffer): Promise<void> {
  const full = fullPath(key);
  await mkdir(full.slice(0, full.lastIndexOf(sep)), { recursive: true });
  await writeFile(full, data, { mode: 0o600 });
}

// ---- serve (presigned GET replacement) -----------------------------------------------------------

// Signed GET URL for an admin <img src>. Returns null if signing is unconfigured or the key is malformed.
export function signGetUrl(key: string): string | null {
  if (!signingKey() || !isValidKey(key)) return null;
  const exp = String(Math.floor(Date.now() / 1000) + GET_TTL_SEC);
  const sig = hmac(['get', key, exp]);
  const qs = new URLSearchParams({ key, exp, sig }).toString();
  return `${SCREENSHOTS.publicBaseUrl}/bug-report/screenshot?${qs}`;
}

export type ServeResult =
  | { ok: true; body: Buffer; contentType: string }
  | { ok: false; status: number };

export async function serveScreenshot(query: { key?: string; exp?: string; sig?: string }): Promise<ServeResult> {
  const { key, exp, sig } = query;
  if (!key || !exp || !sig || !isValidKey(key)) return { ok: false, status: 400 };
  const expNum = Number(exp);
  if (!Number.isFinite(expNum) || expNum * 1000 < Date.now()) return { ok: false, status: 403 };
  if (!signingKey() || !safeEqual(sig, hmac(['get', key, exp]))) return { ok: false, status: 403 };
  const ext = key.slice(key.lastIndexOf('.') + 1);
  const contentType = EXT_TO_CONTENT_TYPE[ext];
  if (!contentType) return { ok: false, status: 400 };
  try {
    const body = await readFile(fullPath(key));
    return { ok: true, body, contentType };
  } catch {
    return { ok: false, status: 404 };
  }
}

// ---- prune ----------------------------------------------------------------------------------------

// Delete files NOT referenced by a non-terminal report once they are older than the retention window. Deletes
// closed-report images (no longer "active") + orphan uploads (uploaded, never submitted). Read-only w.r.t. PG
// (the caller supplies the active key set). Returns the count deleted.
export async function pruneScreenshots(activeKeys: Set<string>): Promise<number> {
  const cutoffMs = Date.now() - SCREENSHOTS.retentionDays * 86400000;
  const root = resolve(SCREENSHOTS.dir);
  const baseDir = join(root, 'bug-screenshots');
  let deleted = 0;
  let identityDirs: string[];
  try {
    identityDirs = await readdir(baseDir);
  } catch {
    return 0; // dir not created yet
  }
  for (const idDir of identityDirs) {
    const dirPath = join(baseDir, idDir);
    let files: string[];
    try {
      const s = await stat(dirPath);
      if (!s.isDirectory()) continue;
      files = await readdir(dirPath);
    } catch {
      continue;
    }
    for (const f of files) {
      const key = `bug-screenshots/${idDir}/${f}`;
      if (activeKeys.has(key)) continue;
      const filePath = join(dirPath, f);
      try {
        const s = await stat(filePath);
        if (s.mtimeMs >= cutoffMs) continue;
        await unlink(filePath);
        deleted++;
      } catch {
        /* best-effort */
      }
    }
  }
  return deleted;
}
