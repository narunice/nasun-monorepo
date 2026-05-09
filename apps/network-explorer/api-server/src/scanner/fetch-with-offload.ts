/**
 * Fetch helper for internal APIs that use S3 offload.
 *
 * When a Lambda response exceeds the 6MB payload limit, it uploads the data
 * to S3 and returns { url: "<presigned-url>" }. This helper transparently
 * follows the redirect: if the response body contains a `url` field, it
 * fetches the actual data from that presigned URL (handling gzip).
 * Otherwise it returns the response body directly (backwards-compatible).
 */

import { gunzipSync } from 'zlib';

interface FetchOptions {
  url: string;
  apiKey?: string;
  timeoutMs?: number;
  label: string;
  /**
   * When true, throw on transient (5xx) errors instead of returning null.
   * Lets callers wrap with withRetry to recover from upstream blips.
   * 4xx responses still return null because they signal a misconfiguration
   * and retrying won't help.
   */
  throwOnTransient?: boolean;
}

class TransientFetchError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = 'TransientFetchError';
  }
}

/**
 * Fetch JSON from an internal API, transparently handling S3 presigned URL offload.
 * Returns the parsed JSON data, or null on error.
 */
export async function fetchWithOffload<T = unknown>(
  opts: FetchOptions,
): Promise<T | null> {
  const { url, apiKey, timeoutMs = 30_000, label, throwOnTransient = false } = opts;

  const headers: Record<string, string> = {};
  if (apiKey) headers['x-api-key'] = apiKey;

  // Step 1: Call the Lambda API
  const res = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    console.error(`[${label}] API fetch failed: ${res.status} ${res.statusText}`);
    if (throwOnTransient && res.status >= 500) {
      throw new TransientFetchError(`${label} API ${res.status}`, res.status);
    }
    return null;
  }

  const body = await res.json();

  // Step 2: If response contains a presigned URL, fetch from S3
  if (body && typeof body === 'object' && 'url' in body && typeof body.url === 'string') {
    const s3Res = await fetch(body.url, {
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!s3Res.ok) {
      console.error(`[${label}] S3 presigned fetch failed: ${s3Res.status}`);
      if (throwOnTransient && s3Res.status >= 500) {
        throw new TransientFetchError(`${label} S3 ${s3Res.status}`, s3Res.status);
      }
      return null;
    }

    // S3 object is stored as gzip (ContentType: application/gzip, no Content-Encoding).
    // Detect gzip by magic bytes (0x1f 0x8b) to handle both compressed and plain responses.
    const buffer = Buffer.from(await s3Res.arrayBuffer());
    const isGzip = buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b;
    const text = isGzip
      ? gunzipSync(buffer).toString('utf-8')
      : buffer.toString('utf-8');

    return JSON.parse(text) as T;
  }

  // Backwards-compatible: direct JSON response (no S3 offload)
  return body as T;
}
