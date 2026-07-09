// Avatar upload -- de-Lambda of the get-user-profile presigned-S3 flow. The box has no AWS credentials,
// so the two-step (presign -> S3 PUT -> PATCH{avatarKey}) is collapsed to a single box-direct multipart
// upload that re-encodes the image and writes it to local disk; the caller still PATCHes the profile with
// the returned key to commit it. nginx serves the files back statically from the same disk path.
//
// Security posture (upload is the highest-risk surface here):
//  - streaming byte cap (busboy fileSize limit) so an oversize body is killed mid-stream, not buffered.
//  - the DECLARED multipart content-type is never trusted: sharp probes the real bytes and rejects any
//    format that is not png/jpeg/webp (a polyglot / mislabeled file fails the probe).
//  - decode -> rotate(bake EXIF orientation) -> resize(cover, fixed square) -> re-encode to webp. The
//    re-encode strips ALL metadata (EXIF/ICC/XMP) and any trailing payload, neutralizing polyglots and
//    stored-XSS-via-SVG (SVG is not an accepted raster format so it never reaches disk).
//  - limitInputPixels caps the decoded pixel count so a tiny highly-compressible file cannot decompress
//    into a memory bomb (the byte cap alone does not bound dimensions).
//  - the storage key is server-authoritative: profile-images/<jwt.identityId>/<server-uuid>.webp. The
//    client never supplies any path component, so there is no path traversal and no cross-identity write.
//  - the file is written to a temp name then atomically renamed, so a half-written file is never served.

import type { IncomingMessage } from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, rename, unlink, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import busboy from 'busboy';
import sharp from 'sharp';
import { RouteAbort } from './http';

export interface AvatarUploadOptions {
  dir: string; // avatars root, e.g. /srv/nasun/avatars (files land under <dir>/profile-images/<id>/...)
  maxBytes: number; // hard cap on the raw upload (parity with the frontend MAX_AVATAR_SIZE_BYTES)
  dim: number; // output square edge in px (cover-fit)
}

// sharp's own format id -> the file extension the avatarKey regex accepts. We always RE-ENCODE to webp,
// but we still gate the INPUT format here so a decodable-but-unwanted type (svg, gif, tiff, ...) is
// rejected before re-encode rather than silently normalized.
const ACCEPTED_INPUT_FORMATS = new Set(['png', 'jpeg', 'webp']);

// Cap decoded pixels: 2 MB webp/png can decode to enormous dimensions (a memory bomb). 25 MP is far above
// any real avatar (a 512^2 target) yet bounds decode cost. sharp throws past this -> 400 below.
const LIMIT_INPUT_PIXELS = 25_000_000;

// Stream-parse exactly one file field with a hard byte cap, returning its raw bytes. Rejects (RouteAbort)
// on: non-multipart body, >1 file, oversize (mid-stream), or no file at all. Non-file fields are drained
// and ignored. Never buffers more than maxBytes.
function readSingleUpload(req: IncomingMessage, maxBytes: number): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    let bb: busboy.Busboy;
    try {
      bb = busboy({
        headers: req.headers,
        limits: { files: 1, fileSize: maxBytes, fields: 4, parts: 6 },
      });
    } catch {
      // busboy throws synchronously when the Content-Type is not multipart/form-data.
      reject(new RouteAbort(400, { message: 'Expected multipart/form-data upload' }));
      return;
    }

    let settled = false;
    let fileSeen = false;
    let tooLarge = false;
    const chunks: Buffer[] = [];

    const fail = (err: RouteAbort) => {
      if (settled) return;
      settled = true;
      req.unpipe(bb);
      reject(err);
    };

    bb.on('file', (_name, stream) => {
      if (fileSeen) {
        stream.resume();
        return;
      }
      fileSeen = true;
      stream.on('data', (d: Buffer) => chunks.push(d));
      stream.on('limit', () => {
        tooLarge = true;
        fail(new RouteAbort(413, { message: 'Image too large' }));
      });
      stream.on('error', () => fail(new RouteAbort(400, { message: 'Malformed upload stream' })));
    });
    bb.on('filesLimit', () => fail(new RouteAbort(400, { message: 'Only one image may be uploaded' })));
    bb.on('error', () => fail(new RouteAbort(400, { message: 'Malformed multipart body' })));
    bb.on('close', () => {
      if (settled || tooLarge) return;
      if (!fileSeen) {
        fail(new RouteAbort(400, { message: 'No image file in upload' }));
        return;
      }
      settled = true;
      resolve(Buffer.concat(chunks));
    });

    req.on('aborted', () => fail(new RouteAbort(400, { message: 'Upload aborted' })));
    req.pipe(bb);
  });
}

// Full upload: parse -> validate real bytes via sharp -> re-encode to webp -> atomic disk write. Returns
// the server-authoritative storage key (profile-images/<identityId>/<uuid>.webp) for the caller to commit
// via PATCH. identityId MUST come from the verified JWT (never from the request body).
export async function handleAvatarUpload(
  req: IncomingMessage,
  identityId: string,
  opts: AvatarUploadOptions,
): Promise<{ key: string }> {
  // Defense-in-depth: identityId is JWT-derived (trusted issuer) but is used as a path segment below.
  // Reject anything that could escape the per-identity dir, without assuming the exact issuer sub format.
  if (identityId.length === 0 || /[/\\\0]/.test(identityId) || identityId.includes('..')) {
    throw new RouteAbort(400, { message: 'Invalid identity' });
  }

  const raw = await readSingleUpload(req, opts.maxBytes);
  if (raw.length === 0) throw new RouteAbort(400, { message: 'Empty image file' });

  // Probe the ACTUAL bytes; a mislabeled content-type cannot pass here. A fresh sharp instance is used for
  // the re-encode below (rather than reusing this one) so the probe and the transform never share pipeline
  // state -- the input is a Buffer, so re-reading it is free.
  let meta;
  try {
    meta = await sharp(raw, { failOn: 'error', limitInputPixels: LIMIT_INPUT_PIXELS }).metadata();
  } catch {
    throw new RouteAbort(400, { message: 'Unreadable or invalid image' });
  }
  if (!meta.format || !ACCEPTED_INPUT_FORMATS.has(meta.format)) {
    throw new RouteAbort(400, { message: 'Only PNG, JPEG, or WebP images are allowed' });
  }

  let encoded: Buffer;
  try {
    encoded = await sharp(raw, { failOn: 'error', limitInputPixels: LIMIT_INPUT_PIXELS })
      .rotate() // bake EXIF orientation BEFORE stripping metadata
      .resize(opts.dim, opts.dim, { fit: 'cover', position: 'centre' })
      .webp({ quality: 82 }) // re-encode: strips EXIF/ICC/XMP + any appended payload
      .toBuffer();
  } catch {
    throw new RouteAbort(400, { message: 'Could not process image' });
  }

  // Server-authoritative key: no client input in any path segment. randomUUID() is a v4 UUID, matching the
  // avatarKey regex the profile PATCH enforces (buildAvatarKeyRegex).
  const key = `profile-images/${identityId}/${randomUUID()}.webp`;
  const destDir = join(opts.dir, 'profile-images', identityId);
  const destPath = join(opts.dir, key);
  const tmpPath = `${destPath}.tmp-${process.pid}-${Date.now()}`;

  await mkdir(destDir, { recursive: true });
  // Force perms explicitly: the unit runs with a hardened UMask (0077) + DynamicUser, so without this the
  // dir would be 0700 -- nginx (a different user) could not traverse it. 0775 gives world r-x (nginx
  // traverses) + group rwx so a later service instance (DynamicUser may get a different uid across
  // restarts, but stays in the shared nasun-avatars group via SupplementaryGroups) can still write into an
  // existing per-identity dir. We deliberately do NOT set setgid here: RestrictSUIDSGID=yes in the unit
  // blocks any chmod that SETS suid/sgid, so a 2775 chmod fails with EPERM and leaves the dir 0700. The dir
  // still ends up group=nasun-avatars because it inherits the group from the setgid parent (avatars/ +
  // profile-images/) at mkdir time; clearing setgid on this leaf dir is harmless (it has no subdirs).
  // chmod is not masked by UMask, so these perms win. Let a real failure surface (500) rather than a silent
  // unreadable dir (404).
  await chmod(destDir, 0o0775);
  try {
    await writeFile(tmpPath, encoded);
    await chmod(tmpPath, 0o644);
    await rename(tmpPath, destPath); // atomic publish; a partial file is never visible to nginx
  } catch (e) {
    await unlink(tmpPath).catch(() => {});
    console.error('[compute] avatar disk write failed:', e instanceof Error ? e.message : e);
    throw new RouteAbort(500, { message: 'Could not store image' });
  }

  return { key };
}
