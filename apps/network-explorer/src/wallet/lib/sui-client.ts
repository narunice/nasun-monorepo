/**
 * Nasun Wallet SUI 클라이언트
 * 기존 sui-client를 활용하고 지갑 관련 기능 추가
 */

import { suiClient } from '../../lib/sui-client';
import type { BalanceInfo } from '../types/wallet';

// NASUN 토큰 데시멀 (SUI와 동일: 9)
const NASUN_DECIMALS = 9;

/**
 * 주소의 NASUN 잔액 조회
 */
export async function getBalance(address: string): Promise<BalanceInfo> {
  try {
    const balance = await suiClient.getBalance({ owner: address });

    const totalBalance = balance.totalBalance;
    const formattedBalance = formatBalance(totalBalance);

    return {
      totalBalance,
      formattedBalance,
      coinCount: balance.coinObjectCount,
    };
  } catch (error) {
    console.error('Failed to get balance:', error);
    return {
      totalBalance: '0',
      formattedBalance: '0',
      coinCount: 0,
    };
  }
}

/**
 * SOE (최소 단위)를 NASUN으로 변환
 */
export function formatBalance(soe: string | bigint): string {
  const value = BigInt(soe);
  const divisor = BigInt(10 ** NASUN_DECIMALS);

  const integerPart = value / divisor;
  const fractionalPart = value % divisor;

  if (fractionalPart === BigInt(0)) {
    return integerPart.toString();
  }

  // 소수점 이하 유효 숫자만 표시 (최대 4자리)
  const fractionalStr = fractionalPart.toString().padStart(NASUN_DECIMALS, '0');
  const trimmed = fractionalStr.slice(0, 4).replace(/0+$/, '');

  if (trimmed === '') {
    return integerPart.toString();
  }

  return `${integerPart}.${trimmed}`;
}

/**
 * NASUN을 SOE (최소 단위)로 변환
 */
export function parseAmount(nasun: string): bigint {
  const parts = nasun.split('.');
  const integerPart = parts[0] || '0';
  let fractionalPart = parts[1] || '';

  // 소수점 이하를 9자리로 패딩
  fractionalPart = fractionalPart.padEnd(NASUN_DECIMALS, '0').slice(0, NASUN_DECIMALS);

  return BigInt(integerPart + fractionalPart);
}

/**
 * 주소 유효성 검사
 */
export function isValidAddress(address: string): boolean {
  // SUI 주소는 0x로 시작하는 64자 hex 문자열
  return /^0x[a-fA-F0-9]{64}$/.test(address);
}

/**
 * 주소 축약 표시
 */
export function shortenAddress(address: string, chars = 6): string {
  if (!address) return '';
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

// 기존 클라이언트 re-export
export { suiClient };
