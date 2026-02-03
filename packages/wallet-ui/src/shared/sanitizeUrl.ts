/**
 * Sanitize image URL to prevent injection via untrusted metadata.
 * Only allows http(s) and safe data: image MIME types.
 */
export function sanitizeImageUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;

  const lower = url.toLowerCase().trim();

  if (lower.startsWith('https://') || lower.startsWith('http://')) {
    return url;
  }

  // Allow safe data: image types (no SVG — can contain scripts)
  const safeDataPrefixes = [
    'data:image/png',
    'data:image/jpeg',
    'data:image/gif',
    'data:image/webp',
  ];
  if (safeDataPrefixes.some((p) => lower.startsWith(p))) {
    return url;
  }

  return undefined;
}
