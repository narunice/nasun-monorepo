/**
 * CoinSymbol - CoinMetadata 기반 토큰 심볼 표시 컴포넌트
 */

import { useCoinMetadata, extractCoinType, formatSymbol, extractSymbolFromType } from '../lib/coin-metadata';
import { truncateType } from '../lib/format';

interface CoinSymbolProps {
  /** 전체 타입 문자열 (예: 0x2::coin::Coin<0x...::nusdc::NUSDC>) */
  type: string;
  /** 심볼 옆에 축약된 타입 표시 */
  showFullType?: boolean;
  /** 추가 CSS 클래스 */
  className?: string;
}

export function CoinSymbol({ type, showFullType = false, className = '' }: CoinSymbolProps) {
  const coinType = extractCoinType(type);
  const { data: metadata, isLoading } = useCoinMetadata(coinType);

  // 심볼 결정: metadata에서 가져오거나 타입에서 추출
  const symbol = metadata?.symbol
    ? formatSymbol(metadata.symbol)
    : extractSymbolFromType(coinType || type);

  if (isLoading) {
    return (
      <span className={`inline-flex items-center gap-1 ${className}`}>
        <span className="text-muted-foreground">...</span>
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-1 ${className}`} title={type}>
      <span className="font-semibold text-primary">{symbol}</span>
      {showFullType && coinType && (
        <span className="text-muted-foreground text-xs font-mono">
          ({truncateType(coinType)})
        </span>
      )}
    </span>
  );
}

/**
 * 단순 심볼만 표시 (메타데이터 조회 없이)
 */
interface SimpleCoinSymbolProps {
  type: string;
  className?: string;
}

export function SimpleCoinSymbol({ type, className = '' }: SimpleCoinSymbolProps) {
  const coinType = extractCoinType(type);
  const symbol = extractSymbolFromType(coinType || type);

  // NSN 브랜딩
  const displaySymbol = symbol === 'SUI' ? 'NSN' : symbol;

  return (
    <span className={`font-semibold text-primary ${className}`} title={type}>
      {displaySymbol}
    </span>
  );
}

export default CoinSymbol;
