/**
 * Media utility functions for NFT display
 * Handles IPFS URL conversion, media type detection, and display prioritization
 */

// Safe data: URI MIME type prefixes (SVG excluded — can contain embedded scripts)
const SAFE_DATA_PREFIXES = [
  'data:image/png',
  'data:image/jpeg',
  'data:image/gif',
  'data:image/webp',
  'data:image/avif',
  'data:video/mp4',
  'data:video/webm',
];

/**
 * IPFS URL을 HTTP 게이트웨이로 변환 + 프로토콜 allowlist 적용
 * @param url - 원본 URL (ipfs://, data:, https:// 등)
 * @returns 변환된 안전한 URL, 또는 undefined (차단된 scheme)
 */
export function resolveMediaUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;

  const lower = url.toLowerCase().trim();

  // data: URL — safe MIME types only (no SVG, no text/html)
  if (lower.startsWith('data:')) {
    if (SAFE_DATA_PREFIXES.some((prefix) => lower.startsWith(prefix))) {
      return url;
    }
    return undefined;
  }

  // IPFS URL 변환 → https
  if (lower.startsWith('ipfs://')) {
    const hash = url.slice(7); // preserve original casing
    return `https://ipfs.io/ipfs/${hash}`;
  }

  // Only allow http(s) schemes
  if (lower.startsWith('https://') || lower.startsWith('http://')) {
    return url;
  }

  // Block everything else (javascript:, vbscript:, blob:, file:, etc.)
  return undefined;
}

/**
 * 외부 링크 URL을 안전한 scheme으로 제한
 * @param url - 외부 URL
 * @returns http(s) URL만 반환, 나머지는 undefined
 */
export function sanitizeHref(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return url;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * URL에서 미디어 타입 감지
 * @param url - 미디어 URL
 * @returns 'image' | 'video' | 'unknown'
 */
export function getMediaType(url: string): 'image' | 'video' | 'unknown' {
  const lower = url.toLowerCase();

  // 비디오 확장자 체크
  if (/\.(mp4|webm|ogg|mov)(\?.*)?$/.test(lower)) return 'video';

  // 이미지 확장자 체크
  if (/\.(jpg|jpeg|png|gif|svg|webp|avif)(\?.*)?$/.test(lower)) return 'image';

  // data URL 타입 체크
  if (lower.startsWith('data:image/')) return 'image';
  if (lower.startsWith('data:video/')) return 'video';

  // 기본값은 이미지로 처리
  return 'image';
}

/**
 * Display 객체에서 표시할 미디어 URL 결정 (우선순위 적용)
 * 우선순위: animation_url → image_url → url
 * Display 표준 미지원 NFT의 경우 content.fields에서 폴백
 * @param display - Sui Object Display 데이터
 * @param content - Object content (content.fields 폴백용)
 * @returns 표시할 미디어 URL
 */
export function getDisplayMediaUrl(
  display: Record<string, string | undefined> | null | undefined,
  content?: { fields?: Record<string, unknown> } | null
): string | undefined {
  // 1. Display 표준 우선
  if (display) {
    const url = display.animation_url || display.image_url || display.url;
    if (url) return url;
  }

  // 2. content.fields 폴백 (Display<T> 미등록 NFT 지원)
  if (content?.fields) {
    const fields = content.fields;
    return (
      (fields.image_url as string) ||
      (fields.url as string) ||
      (fields.image as string) ||
      (fields.animation_url as string)
    );
  }

  return undefined;
}

/**
 * NFT 이름 추출 (Display 또는 content.fields)
 * @param display - Sui Object Display 데이터
 * @param content - Object content (폴백용)
 * @returns NFT 이름
 */
export function getNFTName(
  display: Record<string, string | undefined> | null | undefined,
  content?: { fields?: Record<string, unknown> } | null
): string | undefined {
  return display?.name || (content?.fields?.name as string);
}

/**
 * NFT 설명 추출 (Display 또는 content.fields)
 * @param display - Sui Object Display 데이터
 * @param content - Object content (폴백용)
 * @returns NFT 설명
 */
export function getNFTDescription(
  display: Record<string, string | undefined> | null | undefined,
  content?: { fields?: Record<string, unknown> } | null
): string | undefined {
  return display?.description || (content?.fields?.description as string);
}

/**
 * Display 데이터가 있는 NFT인지 판단
 * image_url 또는 animation_url이 있으면 NFT로 간주
 * Display 표준 미지원 NFT의 경우 content.fields에서 폴백
 * @param display - Sui Object Display 데이터
 * @param content - Object content (폴백용)
 * @returns NFT 여부
 */
export function isNFTObject(
  display: Record<string, string | undefined> | null | undefined,
  content?: { fields?: Record<string, unknown> } | null
): boolean {
  // Display 표준 체크
  if (display?.image_url || display?.animation_url) {
    return true;
  }

  // content.fields 폴백 체크
  if (content?.fields) {
    const fields = content.fields;
    return !!(fields.image_url || fields.url || fields.image || fields.animation_url);
  }

  return false;
}
