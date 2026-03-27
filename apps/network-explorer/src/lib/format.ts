/**
 * Nasun 브랜딩 관련 포맷 유틸리티
 */
import type { SuiTransactionBlockResponse } from '@mysten/sui/client';

export interface TxTypeInfo {
  label: string;
  variant: 'success' | 'info' | 'default';
}

// Determine the primary action type of a PTB for display as a Badge
export function getTxTypeInfo(tx: SuiTransactionBlockResponse): TxTypeInfo {
  const txData = tx.transaction?.data?.transaction;
  if (!txData || txData.kind !== 'ProgrammableTransaction') {
    return { label: txData?.kind ?? 'Unknown', variant: 'default' };
  }
  const txs = txData.transactions;
  if (!txs || txs.length === 0) return { label: 'PTB', variant: 'default' };
  if (txs.some((t) => 'Publish' in t)) return { label: 'Publish', variant: 'success' };
  if (txs.some((t) => 'Upgrade' in t)) return { label: 'Upgrade', variant: 'info' };
  if (txs.some((t) => 'MoveCall' in t)) return { label: 'MoveCall', variant: 'info' };
  if (txs.some((t) => 'TransferObjects' in t)) return { label: 'Transfer', variant: 'default' };
  if (txs.some((t) => 'SplitCoins' in t)) return { label: 'SplitCoins', variant: 'default' };
  if (txs.some((t) => 'MergeCoins' in t)) return { label: 'MergeCoins', variant: 'default' };
  return { label: 'PTB', variant: 'default' };
}

// SUI 타입을 NSN으로 변환
export function formatCoinType(coinType: string | undefined): string {
  if (!coinType || coinType === '0x2::sui::SUI') {
    return 'NSN';
  }
  return coinType.replace(/0x2::sui::SUI/g, 'NSN');
}

// 객체 타입에서 SUI를 NSN으로 변환
export function formatObjectType(type: string | undefined): string {
  if (!type) return '-';
  return type
    .replace(/0x2::sui::SUI/g, '0x2::nasun::NSN')
    .replace(/::sui::/g, '::nasun::')
    .replace(/StakedSui/g, 'StakedNasun')
    .replace(/SuiSystem/g, 'NasunSystem');
}

// Recursively replace all Sui references in a JSON-serializable object for display
export function sanitizeJsonForDisplay(obj: unknown): unknown {
  if (typeof obj === 'string') {
    return obj
      .replace(/0x2::sui::SUI/g, '0x2::nasun::NSN')
      .replace(/::sui::/g, '::nasun::')
      .replace(/StakedSui/g, 'StakedNasun')
      .replace(/SuiSystem/g, 'NasunSystem');
  }
  if (Array.isArray(obj)) {
    return obj.map(sanitizeJsonForDisplay);
  }
  if (typeof obj === 'object' && obj !== null) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = sanitizeJsonForDisplay(value);
    }
    return result;
  }
  return obj;
}

// SOE 단위 잔액 포맷 (SOE -> NSN 변환)
export function formatBalance(balance: string | undefined): string {
  if (!balance) return '0';
  try {
    const value = BigInt(balance);
    const nasun = value / BigInt(1_000_000_000);
    const remainder = value % BigInt(1_000_000_000);
    if (remainder === BigInt(0)) {
      return nasun.toLocaleString('en-US');
    }
    return `${nasun.toLocaleString('en-US')}.${remainder.toString().padStart(9, '0').replace(/0+$/, '')}`;
  } catch {
    return 'N/A';
  }
}

// SOE 단위로 포맷 (가스 등)
export function formatSoe(value: string | number | bigint | undefined): string {
  if (value === undefined || value === null) return '-';
  try {
    return `${BigInt(value).toLocaleString('en-US')} SOE`;
  } catch {
    return `${value} SOE`;
  }
}

// 긴 타입 문자열 축약
// 예: 0xfdd1e75f22a7680ea3b1e29eed397b0fbf06838273aaec77001dcfc101d09976::nusdc::NUSDC
// → 0xfdd1...09976::nusdc::NUSDC
export function truncateType(type: string): string {
  const parts = type.split('::');
  if (parts.length >= 3) {
    const pkg = parts[0];
    const module = parts[1];
    const name = parts[2];
    // 패키지 주소가 충분히 긴 경우 축약
    if (pkg.length > 15) {
      const shortPkg = `${pkg.slice(0, 6)}...${pkg.slice(-5)}`;
      return `${shortPkg}::${module}::${name}`;
    }
    return type;
  }
  // 일반 문자열 축약
  if (type.length > 30) {
    return `${type.slice(0, 12)}...${type.slice(-8)}`;
  }
  return type;
}

// ============================================================
// Time Formatting Utilities
// ============================================================

// Format timestamp (milliseconds) to localized date string
export function formatTimestamp(timestampMs: string | number | null | undefined): string {
  if (!timestampMs) return '-';
  const date = new Date(Number(timestampMs));
  return date.toLocaleString('en-US');
}

// Truncate transaction digest for display
export function truncateDigest(digest: string, length: number = 8): string {
  if (digest.length <= length * 2 + 3) return digest;
  return `${digest.slice(0, length)}...${digest.slice(-6)}`;
}

// Format date to time-only string (for "Last updated" display)
export function formatLastUpdated(date: Date | undefined): string {
  if (!date) return '';
  return date.toLocaleTimeString('en-US', { hour12: true });
}

// Format duration in milliseconds to human-readable string
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

// Truncate generic ID
export function truncateId(id: string, startLen: number = 10, endLen: number = 8): string {
  if (id.length <= startLen + endLen + 3) return id;
  return `${id.slice(0, startLen)}...${id.slice(-endLen)}`;
}

// Truncate address for display (e.g., "0x1234ab...cdef56")
export function truncateAddress(address: string, startLen: number = 8, endLen: number = 6): string {
  if (address.length <= startLen + endLen + 3) return address;
  return `${address.slice(0, startLen)}...${address.slice(-endLen)}`;
}

// Format percentage (e.g., 0.0512 -> "5.12%")
export function formatPercentage(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

// Known token decimals for fallback when CoinMetadata is unavailable
const KNOWN_DECIMALS: Record<string, number> = {
  '::sui::': 9,
  '::nsn::': 9,
  '::nusdc::': 6,
  '::nbtc::': 8,
  '::neth::': 8,
  '::nsol::': 8,
};

function resolveDecimals(coinType: string): number {
  const lower = coinType.toLowerCase();
  for (const [pattern, decimals] of Object.entries(KNOWN_DECIMALS)) {
    if (lower.includes(pattern)) return decimals;
  }
  return 9; // Default to 9 (native token)
}

// Token Balance Format (considering decimals)
// Pass `knownDecimals` from CoinMetadata when available for accuracy
export function formatTokenBalance(balance: string, coinType: string, knownDecimals?: number): string {
  try {
    const value = BigInt(balance);
    const decimals = knownDecimals ?? resolveDecimals(coinType);

    const divisor = BigInt(10 ** decimals);
    const integerPart = value / divisor;
    const remainder = value % divisor;

    if (remainder === BigInt(0)) {
      return integerPart.toLocaleString('en-US');
    }

    // Max 4 fractional digits
    const fractionalStr = remainder.toString().padStart(decimals, '0');
    const trimmed = fractionalStr.slice(0, 4).replace(/0+$/, '');

    if (trimmed === '') {
      return integerPart.toLocaleString('en-US');
    }

    return `${integerPart.toLocaleString('en-US')}.${trimmed}`;
  } catch {
    return 'N/A';
  }
}
