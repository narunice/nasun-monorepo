/**
 * MetaMask Authentication API Client
 *
 * 백엔드 MetaMask 인증 API와 통신하는 클라이언트 함수들
 */

import type {
  MetaMaskChallengeRequest,
  MetaMaskChallengeResponse,
  MetaMaskVerifyRequest,
  MetaMaskVerifyResponse,
  MetaMaskErrorResponse,
} from '../types/metamask';
import i18n from '../i18n';

// 환경변수에서 API URL 가져오기
const METAMASK_API_BASE_URL = import.meta.env.VITE_METAMASK_AUTH_API;

if (!METAMASK_API_BASE_URL) {
  console.error('VITE_METAMASK_AUTH_API is not defined in environment variables');
}

/**
 * API 에러 클래스
 */
export class MetaMaskApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public response?: MetaMaskErrorResponse
  ) {
    super(message);
    this.name = 'MetaMaskApiError';
  }
}

/**
 * Challenge 요청: 서버에서 nonce 생성
 *
 * @param walletAddress - 이더리움 지갑 주소
 * @returns Challenge 응답 (nonce와 서명할 메시지)
 * @throws {MetaMaskApiError} API 호출 실패 시
 */
export async function requestChallenge(
  walletAddress: string
): Promise<MetaMaskChallengeResponse> {
  const url = `${METAMASK_API_BASE_URL}/challenge`;

  const requestBody: MetaMaskChallengeRequest & { lang: string } = {
    walletAddress: walletAddress.toLowerCase(),
    lang: i18n.language,
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
      throw new MetaMaskApiError(
        data.message || 'Failed to request challenge',
        response.status,
        data
      );
    }

    return data as MetaMaskChallengeResponse;
  } catch (error) {
    if (error instanceof MetaMaskApiError) {
      throw error;
    }

    console.error('Failed to request challenge:', error);
    throw new MetaMaskApiError(
      error instanceof Error ? error.message : 'Network error occurred'
    );
  }
}

/**
 * Verify 요청: 서명 검증 및 Cognito Identity 발급
 *
 * @param walletAddress - 이더리움 지갑 주소
 * @param signature - MetaMask로 서명한 서명값
 * @param nonce - Challenge에서 받은 nonce
 * @returns Verify 응답 (Cognito Identity ID와 토큰)
 * @throws {MetaMaskApiError} API 호출 실패 시
 */
export async function verifySignature(
  walletAddress: string,
  signature: string,
  nonce: string
): Promise<MetaMaskVerifyResponse> {
  const url = `${METAMASK_API_BASE_URL}/verify`;

  const requestBody: MetaMaskVerifyRequest = {
    walletAddress: walletAddress.toLowerCase(),
    signature,
    nonce,
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
      throw new MetaMaskApiError(
        data.message || 'Failed to verify signature',
        response.status,
        data
      );
    }

    return data as MetaMaskVerifyResponse;
  } catch (error) {
    if (error instanceof MetaMaskApiError) {
      throw error;
    }

    console.error('Failed to verify signature:', error);
    throw new MetaMaskApiError(
      error instanceof Error ? error.message : 'Network error occurred'
    );
  }
}

/**
 * 전체 MetaMask 인증 플로우 실행 (2-trip: connect → sign)
 *
 * 1. Challenge 요청
 * 2. 메시지 서명 (외부에서 signMessage 호출)
 * 3. Verify 요청
 *
 * 이 함수는 1단계와 3단계만 처리하며, 2단계는 호출자가 처리해야 함
 *
 * @param walletAddress - 이더리움 지갑 주소
 * @param signMessageFn - 메시지 서명 함수
 * @returns Cognito Identity 정보
 */
export async function authenticateWithMetaMask(
  walletAddress: string,
  signMessageFn: (message: string) => Promise<string>
): Promise<MetaMaskVerifyResponse> {
  // Step 1: Challenge 요청
  const challengeResponse = await requestChallenge(walletAddress);

  // Step 2: 메시지 서명
  const signature = await signMessageFn(challengeResponse.message);

  // Step 3: Verify 요청
  const verifyResponse = await verifySignature(
    walletAddress,
    signature,
    challengeResponse.nonce
  );

  return verifyResponse;
}

// ============================================================
// 1-trip connectAndSign flow (for iOS Safari — single MetaMask trip)
// ============================================================

export interface ConnectVerifyResponse extends MetaMaskVerifyResponse {
  walletAddress: string;
}

/**
 * Prepare: Get nonce + message from server (no wallet address needed).
 * First step of the 1-trip connectAndSign flow.
 */
export async function prepareChallenge(): Promise<MetaMaskChallengeResponse> {
  const url = `${METAMASK_API_BASE_URL}/prepare`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ lang: i18n.language }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new MetaMaskApiError(
        data.message || 'Failed to prepare challenge',
        response.status,
        data
      );
    }

    return data as MetaMaskChallengeResponse;
  } catch (error) {
    if (error instanceof MetaMaskApiError) {
      throw error;
    }

    console.error('Failed to prepare challenge:', error);
    throw new MetaMaskApiError(
      error instanceof Error ? error.message : 'Network error occurred'
    );
  }
}

/**
 * Connect-verify: Send signature + nonce to server.
 * Server recovers wallet address from signature and issues Cognito identity.
 * Final step of the 1-trip connectAndSign flow.
 */
export async function connectVerify(
  signature: string,
  nonce: string,
): Promise<ConnectVerifyResponse> {
  const url = `${METAMASK_API_BASE_URL}/connect-verify`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ signature, nonce }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new MetaMaskApiError(
        data.message || 'Failed to verify connect signature',
        response.status,
        data
      );
    }

    return data as ConnectVerifyResponse;
  } catch (error) {
    if (error instanceof MetaMaskApiError) {
      throw error;
    }

    console.error('Failed to connect-verify:', error);
    throw new MetaMaskApiError(
      error instanceof Error ? error.message : 'Network error occurred'
    );
  }
}
