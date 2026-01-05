/**
 * Genesis NFT Whitelist API Client
 *
 * 백엔드 Whitelist API와 통신하는 클라이언트 함수들
 */

import i18n from '../i18n';
import type {
  JoinWhitelistRequest,
  JoinWhitelistResponse,
  WithdrawWhitelistRequest,
  WithdrawWhitelistResponse,
  CheckWhitelistResponse,
  WhitelistErrorResponse,
} from '../types/whitelist';

// 환경변수에서 API URL 가져오기
const JOIN_API_URL = import.meta.env.VITE_JOIN_WHITELIST_API;
const WITHDRAW_API_URL = import.meta.env.VITE_WITHDRAW_WHITELIST_API;
const CHECK_API_URL = import.meta.env.VITE_CHECK_WHITELIST_API;

if (!JOIN_API_URL || !WITHDRAW_API_URL || !CHECK_API_URL) {
  console.error('Whitelist API URLs are not defined in environment variables');
}

/**
 * Whitelist API 에러 클래스
 */
export class WhitelistApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public errorCode?: string,
    public response?: WhitelistErrorResponse
  ) {
    super(message);
    this.name = 'WhitelistApiError';
  }
}

/**
 * Join Whitelist: MetaMask 서명과 함께 whitelist에 등록
 *
 * @param walletAddress - 이더리움 지갑 주소
 * @param signature - MetaMask로 서명한 서명값
 * @param message - 서명한 메시지
 * @param timestamp - 서명 시점의 타임스탬프
 * @returns Join 성공 응답
 * @throws {WhitelistApiError} API 호출 실패 시
 */
export async function joinWhitelist(
  walletAddress: string,
  signature: string,
  message: string,
  timestamp: string
): Promise<JoinWhitelistResponse> {
  const url = JOIN_API_URL;

  const requestBody: JoinWhitelistRequest = {
    walletAddress: walletAddress.toLowerCase(),
    signature,
    message,
    timestamp,
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new WhitelistApiError(
        data.message || 'Failed to join whitelist',
        response.status,
        data.error,
        data
      );
    }

    return data as JoinWhitelistResponse;
  } catch (error) {
    if (error instanceof WhitelistApiError) {
      throw error;
    }

    console.error('Failed to join whitelist:', error);
    throw new WhitelistApiError(
      error instanceof Error ? error.message : 'Network error occurred'
    );
  }
}

/**
 * Withdraw Whitelist: Whitelist 등록 철회
 *
 * @param walletAddress - 이더리움 지갑 주소
 * @param signature - MetaMask로 서명한 서명값
 * @param message - 서명한 메시지
 * @param timestamp - 서명 시점의 타임스탬프
 * @returns Withdraw 성공 응답
 * @throws {WhitelistApiError} API 호출 실패 시
 */
export async function withdrawWhitelist(
  walletAddress: string,
  signature: string,
  message: string,
  timestamp: string
): Promise<WithdrawWhitelistResponse> {
  const url = WITHDRAW_API_URL;

  const requestBody: WithdrawWhitelistRequest = {
    walletAddress: walletAddress.toLowerCase(),
    signature,
    message,
    timestamp,
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new WhitelistApiError(
        data.message || 'Failed to withdraw from whitelist',
        response.status,
        data.error,
        data
      );
    }

    return data as WithdrawWhitelistResponse;
  } catch (error) {
    if (error instanceof WhitelistApiError) {
      throw error;
    }

    console.error('Failed to withdraw from whitelist:', error);
    throw new WhitelistApiError(
      error instanceof Error ? error.message : 'Network error occurred'
    );
  }
}

/**
 * Check Whitelist Status: 특정 지갑 주소의 등록 상태 확인
 *
 * @param walletAddress - 이더리움 지갑 주소
 * @returns 등록 상태 응답
 * @throws {WhitelistApiError} API 호출 실패 시
 */
export async function checkWhitelistStatus(
  walletAddress: string
): Promise<CheckWhitelistResponse> {
  // Query string으로 전달
  const url = `${CHECK_API_URL}?walletAddress=${encodeURIComponent(
    walletAddress.toLowerCase()
  )}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();

    if (!response.ok) {
      throw new WhitelistApiError(
        data.message || 'Failed to check whitelist status',
        response.status,
        data.error,
        data
      );
    }

    return data as CheckWhitelistResponse;
  } catch (error) {
    if (error instanceof WhitelistApiError) {
      throw error;
    }

    console.error('Failed to check whitelist status:', error);
    throw new WhitelistApiError(
      error instanceof Error ? error.message : 'Network error occurred'
    );
  }
}

/**
 * 전체 Whitelist Join 플로우 실행
 *
 * 1. MetaMask 서명 생성 (호출자가 처리)
 * 2. Join API 호출
 *
 * @param walletAddress - 이더리움 지갑 주소
 * @param signMessageFn - 메시지 서명 함수
 * @returns Join 성공 응답
 */
export async function joinWhitelistWithSignature(
  walletAddress: string,
  signMessageFn: (message: string) => Promise<string>
): Promise<JoinWhitelistResponse> {
  // 타임스탬프 생성
  const timestamp = new Date().toISOString();

  // 서명할 메시지 생성 (다국어 지원 + 보안 안내)
  const message = `${i18n.t('common:signatures.joinWhitelist.title')}

${i18n.t('common:signatures.joinWhitelist.securityNotice')}
${i18n.t('common:signatures.joinWhitelist.noTransaction')}
${i18n.t('common:signatures.joinWhitelist.ownershipVerification')}

Timestamp: ${timestamp}`;

  // MetaMask로 메시지 서명
  const signature = await signMessageFn(message);

  // Join API 호출
  const response = await joinWhitelist(walletAddress, signature, message, timestamp);

  return response;
}

/**
 * 전체 Whitelist Withdraw 플로우 실행
 *
 * 1. MetaMask 서명 생성 (호출자가 처리)
 * 2. Withdraw API 호출
 *
 * @param walletAddress - 이더리움 지갑 주소
 * @param signMessageFn - 메시지 서명 함수
 * @returns Withdraw 성공 응답
 */
export async function withdrawWhitelistWithSignature(
  walletAddress: string,
  signMessageFn: (message: string) => Promise<string>
): Promise<WithdrawWhitelistResponse> {
  console.log('[DEBUG] withdrawWhitelistWithSignature called for wallet:', walletAddress);

  // 타임스탬프 생성
  const timestamp = new Date().toISOString();
  console.log('[DEBUG] Timestamp generated:', timestamp);

  // 서명할 메시지 생성 (다국어 지원 + 보안 안내)
  const message = `${i18n.t('common:signatures.withdrawWhitelist.title')}

${i18n.t('common:signatures.withdrawWhitelist.securityNotice')}
${i18n.t('common:signatures.withdrawWhitelist.noTransaction')}
${i18n.t('common:signatures.withdrawWhitelist.ownershipVerification')}

Timestamp: ${timestamp}`;

  console.log('[DEBUG] Message generated, length:', message.length);
  console.log('[DEBUG] FULL MESSAGE:\n---START---\n' + message + '\n---END---');
  console.log('[DEBUG] Calling signMessageFn...');

  // MetaMask로 메시지 서명
  const signature = await signMessageFn(message);
  console.log('[DEBUG] Signature received:', signature.substring(0, 20) + '...');

  // Withdraw API 호출
  console.log('[DEBUG] Calling withdrawWhitelist API...');
  const response = await withdrawWhitelist(walletAddress, signature, message, timestamp);
  console.log('[DEBUG] Withdraw API response:', response);

  return response;
}
