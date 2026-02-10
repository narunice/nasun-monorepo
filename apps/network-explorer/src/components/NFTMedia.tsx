import { useState, useCallback, useEffect } from 'react';
import { resolveMediaUrl, getMediaType, isIpfsUrl, IPFS_GATEWAY_COUNT } from '../lib/media';

interface NFTMediaProps {
  url: string;
  name?: string;
  className?: string;
}

/**
 * NFT 미디어 렌더링 컴포넌트
 * - 이미지/비디오 자동 감지
 * - IPFS URL 자동 변환 (gateway fallback 지원)
 * - 로드 실패 시 placeholder 표시
 * - lazy loading 지원
 */
export default function NFTMedia({ url, name, className = '' }: NFTMediaProps) {
  const [gatewayIndex, setGatewayIndex] = useState(0);
  const [error, setError] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Reset state when url prop changes (e.g., navigating between NFTs)
  useEffect(() => {
    setGatewayIndex(0);
    setError(false);
    setLoaded(false);
  }, [url]);

  const resolvedUrl = resolveMediaUrl(url, gatewayIndex);
  const mediaType = resolvedUrl ? getMediaType(resolvedUrl) : 'unknown';

  const handleError = useCallback(() => {
    // Try next IPFS gateway before giving up
    if (isIpfsUrl(url) && gatewayIndex + 1 < IPFS_GATEWAY_COUNT) {
      setGatewayIndex((prev) => prev + 1);
      setLoaded(false);
    } else {
      setError(true);
    }
  }, [url, gatewayIndex]);

  if (!resolvedUrl || error) {
    return (
      <div
        className={`flex items-center justify-center bg-muted/30 border border-border rounded-lg min-h-[120px] ${className}`}
      >
        <div className="text-center text-muted-foreground/50 p-4">
          <svg
            className="w-8 h-8 mx-auto mb-2 opacity-50"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          <span className="text-xs">
            {error ? 'Failed to load' : 'No media'}
          </span>
        </div>
      </div>
    );
  }

  if (mediaType === 'video') {
    return (
      <video
        src={resolvedUrl}
        className={`${className} ${!loaded ? 'opacity-0' : 'opacity-100'} transition-opacity duration-300`}
        autoPlay
        loop
        muted
        playsInline
        onLoadedData={() => setLoaded(true)}
        onError={handleError}
      />
    );
  }

  return (
    <img
      src={resolvedUrl}
      alt={name || 'NFT'}
      loading="lazy"
      className={`${className} ${!loaded ? 'opacity-0' : 'opacity-100'} transition-opacity duration-300`}
      onLoad={() => setLoaded(true)}
      onError={handleError}
    />
  );
}
