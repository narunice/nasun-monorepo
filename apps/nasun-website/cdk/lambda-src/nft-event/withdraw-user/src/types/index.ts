/**
 * Withdraw User Types
 *
 * @description
 * NFT Event Withdraw Lambda 타입 정의
 *
 * @author Claude Code
 * @date 2025-11-01
 */

/**
 * Withdraw 요청
 */
export interface WithdrawUserRequest {
  walletAddress: string;   // 지갑 주소 (0x...)
  walletProof: string;     // HMAC-SHA256 proof from MetaMask verify
  proofIssuedAt: string;   // ISO 8601 timestamp when proof was issued
}

/**
 * Withdraw 응답
 */
export interface WithdrawUserResponse {
  success: boolean;
  message: string;
}

/**
 * NFT Whitelist 엔티티
 */
export interface NftWhitelist {
  walletAddress: string;     // PK (소문자)
  xUserId: string;           // GSI: xUserId-index
  xUsername: string;
  verifiedAt: string;        // ISO 8601
  engagementScore: number;
  status: 'ACTIVE' | 'WITHDRAWN';
}

/**
 * 환경 변수
 */
export interface NftEventEnv {
  WHITELIST_TABLE_NAME: string;
  AWS_REGION?: string;
}

/**
 * 커스텀 에러 코드
 */
export enum ErrorCode {
  INVALID_WALLET_ADDRESS = 'INVALID_WALLET_ADDRESS',
  INVALID_SIGNATURE = 'INVALID_SIGNATURE',
  SIGNATURE_EXPIRED = 'SIGNATURE_EXPIRED',
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  ALREADY_WITHDRAWN = 'ALREADY_WITHDRAWN',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

/**
 * 커스텀 에러 클래스
 */
export class NftEventError extends Error {
  constructor(
    message: string,
    public code: ErrorCode,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = 'NftEventError';
  }
}
