// src/utils/addressUtils.ts
/**
 * 지갑 주소를 축약형으로 변환 (예: 0x1234...5678)
 * @param address 전체 지갑 주소
 * @param prefixLength 앞부분에 표시할 문자 수 (기본값: 6)
 * @param suffixLength 뒷부분에 표시할 문자 수 (기본값: 4)
 * @returns 축약된 주소 문자열
 */
export function truncateAddress(
  address: string | null | undefined,
  prefixLength: number = 6,
  suffixLength: number = 4
): string {
  if (!address) return "Not Connected";

  // 0x로 시작하는 경우 prefixLength에 2를 더해 0x 포함 길이 조정
  const adjustedPrefixLength = address.startsWith("0x")
    ? Math.max(prefixLength + 2, 2)
    : prefixLength;

  if (address.length <= adjustedPrefixLength + suffixLength) {
    return address; // 주소가 너무 짧으면 전체 반환
  }

  return `${address.slice(0, adjustedPrefixLength)}...${address.slice(-suffixLength)}`;
}
