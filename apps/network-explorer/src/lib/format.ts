/**
 * Nasun 브랜딩 관련 포맷 유틸리티
 */

// SUI 타입을 NASUN으로 변환
export function formatCoinType(coinType: string | undefined): string {
  if (!coinType || coinType === '0x2::sui::SUI') {
    return 'NASUN';
  }
  return coinType.replace(/0x2::sui::SUI/g, 'NASUN');
}

// 객체 타입에서 SUI를 NASUN으로 변환
export function formatObjectType(type: string | undefined): string {
  if (!type) return '-';
  return type
    .replace(/0x2::sui::SUI/g, '0x2::nasun::NASUN')
    .replace(/::sui::/g, '::nasun::');
}

// SOE 단위 잔액 포맷 (SOE -> NASUN 변환)
export function formatBalance(balance: string | undefined): string {
  if (!balance) return '0';
  const value = BigInt(balance);
  const nasun = value / BigInt(1_000_000_000);
  const remainder = value % BigInt(1_000_000_000);
  if (remainder === BigInt(0)) {
    return nasun.toLocaleString();
  }
  return `${nasun.toLocaleString()}.${remainder.toString().padStart(9, '0').replace(/0+$/, '')}`;
}

// SOE 단위로 포맷 (가스 등)
export function formatSoe(value: string | number | bigint | undefined): string {
  if (value === undefined || value === null) return '-';
  return `${BigInt(value).toLocaleString()} SOE`;
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
