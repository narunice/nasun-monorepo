/**
 * Media utility functions for NFT display
 * Handles IPFS URL conversion, media type detection, and display prioritization
 */

/**
 * IPFS URL을 HTTP 게이트웨이로 변환
 * @param url - 원본 URL (ipfs://, data:, https:// 등)
 * @returns 변환된 HTTP URL
 */
export function resolveMediaUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;

  // data URL은 그대로 반환
  if (url.startsWith('data:')) return url;

  // IPFS URL 변환
  if (url.startsWith('ipfs://')) {
    const hash = url.replace('ipfs://', '');
    return `https://ipfs.io/ipfs/${hash}`;
  }

  return url;
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
 * @param display - Sui Object Display 데이터
 * @returns 표시할 미디어 URL
 */
export function getDisplayMediaUrl(
  display: Record<string, string | undefined> | null | undefined
): string | undefined {
  if (!display) return undefined;
  return display.animation_url || display.image_url || display.url;
}

/**
 * Display 데이터가 있는 NFT인지 판단
 * image_url 또는 animation_url이 있으면 NFT로 간주
 * @param display - Sui Object Display 데이터
 * @returns NFT 여부
 */
export function isNFTObject(
  display: Record<string, string | undefined> | null | undefined
): boolean {
  if (!display) return false;
  return !!(display.image_url || display.animation_url);
}
