/**
 * Ethereum 서명 검증 유틸리티
 */

import { ethers } from 'ethers';

export function verifyWhitelistSignature(
  walletAddress: string,
  message: string,
  signature: string
): { valid: boolean; error?: string } {
  try {
    // ethers.js로 서명 검증
    const recoveredAddress = ethers.verifyMessage(message, signature);

    // 대소문자 무시하고 비교
    if (recoveredAddress.toLowerCase() !== walletAddress.toLowerCase()) {
      return {
        valid: false,
        error: 'Signature does not match wallet address'
      };
    }

    return { valid: true };
  } catch (error: any) {
    console.error('Signature verification failed:', error);
    return {
      valid: false,
      error: error.message || 'Invalid signature format'
    };
  }
}

/**
 * 지갑 주소 정규화 (소문자 변환)
 */
export function normalizeAddress(address: string): string {
  return address.toLowerCase();
}

/**
 * 서명 메시지 검증 (예상 포맷과 일치하는지 확인)
 * 영어 및 한국어 패턴 모두 허용
 */
export function validateMessageFormat(
  message: string,
  timestamp: string,
  action: 'join' | 'withdraw'
): boolean {
  // 영어 패턴
  const enPatterns = {
    join: `Join Nasun Frontiers Whitelist

⚠️ This signature does NOT transfer any funds
⚠️ This is only to verify you own this wallet

Timestamp: ${timestamp}`,
    withdraw: `Withdraw from Nasun Frontiers Whitelist

⚠️ This signature does NOT transfer any funds
⚠️ This is only to verify you own this wallet

Timestamp: ${timestamp}`
  };

  // 한국어 패턴
  const koPatterns = {
    join: `Nasun 프론티어스 화이트리스트 참여

⚠️ 이 서명으로 자금이 이체되지 않습니다
⚠️ 이 지갑이 본인 소유인지 확인하기 위함입니다

Timestamp: ${timestamp}`,
    withdraw: `Nasun 프론티어스 화이트리스트 철회

⚠️ 이 서명으로 자금이 이체되지 않습니다
⚠️ 이 지갑이 본인 소유인지 확인하기 위함입니다

Timestamp: ${timestamp}`
  };

  // 영어 또는 한국어 패턴 매칭
  return message === enPatterns[action] || message === koPatterns[action];
}
