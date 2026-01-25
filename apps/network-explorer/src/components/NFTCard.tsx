import { Link } from 'react-router-dom';
import NFTMedia from './NFTMedia';
import { getDisplayMediaUrl, getNFTName } from '../lib/media';
import { formatObjectType } from '../lib/format';

interface NFTCardProps {
  objectId: string;
  type?: string;
  display?: {
    name?: string;
    description?: string;
    image_url?: string;
    animation_url?: string;
    [key: string]: string | undefined;
  } | null;
  /** Object content for fallback (Display<T> 미지원 NFT 지원) */
  content?: { fields?: Record<string, unknown> } | null;
}

/**
 * NFT 카드 컴포넌트
 * - 카드 형태로 NFT 미리보기
 * - 이미지/비디오 렌더링
 * - name 표시
 * - Object 상세 페이지 링크
 * - 호버 효과
 * - Display<T> 미등록 NFT는 content.fields에서 폴백
 */
export default function NFTCard({ objectId, type, display, content }: NFTCardProps) {
  const mediaUrl = getDisplayMediaUrl(display, content);
  const name = getNFTName(display, content) || formatObjectType(type) || 'Unnamed NFT';

  return (
    <Link
      to={`/object/${objectId}`}
      className="group block bg-card border border-border rounded-xl overflow-hidden hover:border-primary/60 hover:bg-muted/50 transition-all duration-200"
    >
      {/* 미디어 영역 */}
      <div className="aspect-square overflow-hidden bg-muted/30">
        {mediaUrl ? (
          <NFTMedia
            url={mediaUrl}
            name={name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground/30">
            <svg
              className="w-12 h-12"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>
        )}
      </div>

      {/* 정보 영역 */}
      <div className="p-3">
        <h3 className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">
          {name}
        </h3>
        <p className="text-xs text-muted-foreground truncate mt-1 font-mono">
          {objectId.slice(0, 8)}...{objectId.slice(-6)}
        </p>
      </div>
    </Link>
  );
}
