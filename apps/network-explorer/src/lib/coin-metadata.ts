/**
 * CoinMetadata 캐싱 및 유틸리티
 */

import { useQuery } from '@tanstack/react-query';
import { getCoinMetadata } from './sui-client';

/**
 * 코인 타입 추출 (0x2::coin::Coin<...> → 내부 타입)
 * @example extractCoinType('0x2::coin::Coin<0x2::sui::SUI>') → '0x2::sui::SUI'
 */
export function extractCoinType(type: string): string | null {
  // Coin<T> 형태에서 T 추출
  const match = type.match(/0x2::coin::Coin<(.+)>/);
  if (match) return match[1];

  // 이미 순수 코인 타입인 경우 (0x...::module::Type)
  if (type.match(/^0x[a-fA-F0-9]+::\w+::\w+$/)) {
    return type;
  }

  return null;
}

/**
 * CoinMetadata 조회 훅 (TanStack Query 캐싱)
 */
export function useCoinMetadata(coinType: string | null) {
  return useQuery({
    queryKey: ['coinMetadata', coinType],
    queryFn: () => getCoinMetadata(coinType!),
    enabled: !!coinType,
    staleTime: Infinity, // 메타데이터는 변경되지 않음
    gcTime: 24 * 60 * 60 * 1000, // 24시간 캐시
  });
}

/**
 * Nasun 브랜딩: SUI → NSN
 */
export function formatSymbol(symbol: string | undefined): string {
  if (!symbol) return '?';
  if (symbol === 'SUI') return 'NSN';
  return symbol;
}

/**
 * 타입 문자열에서 심볼 추출 (fallback용)
 * @example extractSymbolFromType('0x...::nusdc::NUSDC') → 'NUSDC'
 */
export function extractSymbolFromType(type: string): string {
  const parts = type.split('::');
  if (parts.length >= 3) {
    return parts[parts.length - 1];
  }
  return type;
}
