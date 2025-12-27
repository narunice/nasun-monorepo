/**
 * Battalion NFT API Client
 *
 * @description
 * Wave 1 Battalion NFT Free Mint 이벤트 API 클라이언트
 *
 * @author Claude Code
 * @date 2025-10-25
 */

import {
  VerifyEligibilityRequest,
  VerifyEligibilityResponse,
  RegisterUserRequest,
  RegisterUserResponse,
  WithdrawUserRequest,
  WithdrawUserResponse,
  BattalionNftStatusResponse,
  ApiError,
} from '../types/battalion-nft';
import i18n from '../i18n';

const API_BASE_URL = import.meta.env.VITE_BATTALION_NFT_API || '';

if (!API_BASE_URL) {
  console.warn('[battalionNftApi] VITE_BATTALION_NFT_API is not configured');
}

/**
 * API 에러 처리 헬퍼
 */
async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let errorData: Record<string, unknown>;

    try {
      errorData = await response.json() as Record<string, unknown>;

      // 백엔드의 errorCode를 code로 매핑 (필드명 불일치 해결)
      if (errorData.errorCode && !errorData.code) {
        errorData.code = errorData.errorCode;
      }

      // 백엔드의 message를 error에도 복사 (fallback)
      if (errorData.message && !errorData.error) {
        errorData.error = errorData.message;
      }
    } catch {
      // JSON 파싱 실패 시 기본 에러 생성
      errorData = {
        success: false,
        error: `HTTP ${response.status}`,
        code: 'NETWORK_ERROR',
        message: response.statusText || 'Unknown error occurred',
      };
    }

    throw errorData;
  }

  return response.json();
}

/**
 * 참여 자격 검증 API
 *
 * @param request - 검증 요청 정보
 * @returns 검증 결과
 */
export async function verifyEligibilityApi(
  request: VerifyEligibilityRequest
): Promise<VerifyEligibilityResponse> {
  try {
    console.log('[battalionNftApi] Verifying eligibility:', request);

    // Battalion NFT Access Token 가져오기 (Like 조회용)
    const xAccessToken = localStorage.getItem('battalion_nft_x_access_token');
    console.log('[battalionNftApi] xAccessToken from localStorage:', xAccessToken ? `${xAccessToken.substring(0, 20)}...` : 'null');

    const requestBody = {
      ...request,
      xAccessToken, // User Context OAuth Token 전달
    };
    console.log('[battalionNftApi] Request body (with token):', {
      ...requestBody,
      xAccessToken: xAccessToken ? `${xAccessToken.substring(0, 20)}...` : 'null',
    });

    const response = await fetch(`${API_BASE_URL}/event/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const data = await handleResponse<VerifyEligibilityResponse>(response);

    console.log('[battalionNftApi] Verification result:', data);
    return data;
  } catch (error: unknown) {
    console.error('[battalionNftApi] Verification error:', error);

    if (error && typeof error === 'object' && 'code' in error) {
      // ApiError 형태인 경우 그대로 throw
      throw error;
    }

    // 네트워크 에러 등 기타 에러는 ApiError로 변환
    throw {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      code: 'NETWORK_ERROR',
      message: '네트워크 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
    } as ApiError;
  }
}

/**
 * 화이트리스트 등록 API
 *
 * @param request - 등록 요청 정보
 * @returns 등록 결과
 */
export async function registerUserApi(
  request: RegisterUserRequest
): Promise<RegisterUserResponse> {
  try {
    console.log('[battalionNftApi] Registering user:', request);

    const response = await fetch(`${API_BASE_URL}/event/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    const data = await handleResponse<RegisterUserResponse>(response);

    console.log('[battalionNftApi] Registration result:', data);
    return data;
  } catch (error: unknown) {
    console.error('[battalionNftApi] Registration error:', error);

    if (error && typeof error === 'object' && 'code' in error) {
      throw error;
    }

    throw {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      code: 'NETWORK_ERROR',
      message: '네트워크 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
    } as ApiError;
  }
}

/**
 * Battalion NFT 등록 상태 조회 API
 *
 * @param walletAddress - MetaMask 지갑 주소
 * @returns 등록 상태
 *
 * @description
 * 백엔드 DynamoDB에서 실제 등록 상태를 조회합니다.
 * GET /event/status?walletAddress=0x...
 */
export async function checkBattalionNftStatus(
  walletAddress: string
): Promise<BattalionNftStatusResponse> {
  try {
    console.log('[battalionNftApi] Checking Battalion NFT status:', walletAddress);

    // Normalize wallet address (lowercase)
    const normalizedAddress = walletAddress.toLowerCase();

    // GET /event/status?walletAddress=0x...
    const response = await fetch(
      `${API_BASE_URL}/event/status?walletAddress=${encodeURIComponent(normalizedAddress)}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    const data = await handleResponse<BattalionNftStatusResponse>(response);

    console.log('[battalionNftApi] Status check result:', data);
    return data;
  } catch (error: unknown) {
    console.error('[battalionNftApi] Status check error:', error);

    if (error && typeof error === 'object' && 'code' in error) {
      // ApiError 형태인 경우 그대로 throw
      throw error;
    }

    // 네트워크 에러 등 기타 에러는 ApiError로 변환
    throw {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      code: 'NETWORK_ERROR',
      message: '상태를 확인하는 중 오류가 발생했습니다.',
    } as ApiError;
  }
}

/**
 * 화이트리스트 참여 취소 API
 *
 * @param request - 취소 요청 정보
 * @returns 취소 결과
 */
export async function withdrawUserApi(
  request: WithdrawUserRequest
): Promise<WithdrawUserResponse> {
  try {
    console.log('[battalionNftApi] Withdrawing user:', request.walletAddress);

    const response = await fetch(`${API_BASE_URL}/event/withdraw`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    const data = await handleResponse<WithdrawUserResponse>(response);

    console.log('[battalionNftApi] Withdraw result:', data);
    return data;
  } catch (error: unknown) {
    console.error('[battalionNftApi] Withdraw error:', error);

    if (error && typeof error === 'object' && 'code' in error) {
      throw error;
    }

    throw {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      code: 'NETWORK_ERROR',
      message: '네트워크 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
    } as ApiError;
  }
}

/**
 * 전체 Battalion NFT Withdraw 플로우 실행
 *
 * 1. MetaMask 서명 생성 (호출자가 처리)
 * 2. Withdraw API 호출
 *
 * @param walletAddress - MetaMask 지갑 주소
 * @param signMessageFn - 메시지 서명 함수
 * @returns Withdraw 성공 응답
 */
export async function withdrawBattalionNftWithSignature(
  walletAddress: string,
  signMessageFn: (message: string) => Promise<string>
): Promise<WithdrawUserResponse> {
  console.log('[battalionNftApi] withdrawBattalionNftWithSignature called for wallet:', walletAddress);

  // 타임스탬프 생성
  const timestamp = new Date().toISOString();
  console.log('[battalionNftApi] Timestamp generated:', timestamp);

  // 서명할 메시지 생성 (다국어 지원 + 보안 안내)
  const message = `${i18n.t('common:signatures.withdrawBattalionNft.title')}

${i18n.t('common:signatures.withdrawBattalionNft.securityNotice')}
${i18n.t('common:signatures.withdrawBattalionNft.noTransaction')}
${i18n.t('common:signatures.withdrawBattalionNft.ownershipVerification')}

Timestamp: ${timestamp}`;

  console.log('[battalionNftApi] Message generated, calling signMessageFn...');

  // MetaMask로 메시지 서명
  const signature = await signMessageFn(message);
  console.log('[battalionNftApi] Signature received');

  // Withdraw API 호출
  console.log('[battalionNftApi] Calling withdrawUserApi...');
  const response = await withdrawUserApi({
    walletAddress: walletAddress.toLowerCase(),
    signature,
    message,
    timestamp,
  });
  console.log('[battalionNftApi] Withdraw API response:', response);

  return response;
}

/**
 * API 클라이언트 설정 확인
 *
 * @returns API가 설정되었는지 여부
 */
export function isApiConfigured(): boolean {
  return Boolean(API_BASE_URL);
}

/**
 * API Base URL 가져오기
 */
export function getApiBaseUrl(): string {
  return API_BASE_URL;
}
