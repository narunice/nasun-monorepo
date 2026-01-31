/**
 * Type Definitions for Check Registration Status Lambda
 *
 * @author Claude Code
 * @date 2025-11-02
 */

/**
 * NFT 화이트리스트 정보
 */
export interface NftWhitelist {
  walletAddress: string; // Ethereum 지갑 주소 (소문자, PK)
  xUserId: string; // X User ID
  xUsername: string; // X Username
  verifiedAt: string; // ISO 8601 timestamp
  engagementScore: number; // 참여도 점수
  allowlistBatchId?: string; // Allowlist Batch ID ("1", "2", "3", ...)
  status?: 'ACTIVE' | 'WITHDRAWN'; // Soft delete: WITHDRAWN = withdrawn
  withdrawnAt?: string; // ISO 8601 timestamp (withdrawal time)
}

/**
 * 등록 상태 조회 응답
 */
export interface CheckStatusResponse {
  success: boolean;
  registered: boolean; // true: 등록됨, false: 미등록
  data: NftWhitelist | null; // 등록 정보 (미등록 시 null)
}

/**
 * Lambda 환경 변수
 */
export interface CheckStatusEnv {
  WHITELIST_TABLE_NAME: string; // NftWhitelist 테이블 이름
  AWS_REGION: string; // AWS Region
}

/**
 * 에러 코드
 */
export enum ErrorCode {
  INVALID_WALLET_ADDRESS = 'INVALID_WALLET_ADDRESS',
  DYNAMODB_ERROR = 'DYNAMODB_ERROR',
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
}

/**
 * NFT Event 에러
 */
export class NftEventError extends Error {
  constructor(
    message: string,
    public code: ErrorCode,
    public statusCode: number
  ) {
    super(message);
    this.name = 'NftEventError';
  }
}
