/**
 * NFT Event Type Definitions
 *
 * @description
 * Wave 1 Battalion NFT Free Mint 이벤트 관련 TypeScript 타입 정의
 *
 * @author Claude Code
 * @date 2025-10-25
 */

// ========== DynamoDB Table Schemas ==========

/**
 * NftWhitelist Table
 * PK: walletAddress
 */
export interface NftWhitelist {
  walletAddress: string; // PK (소문자 정규화)
  xUserId: string; // X(Twitter) User ID
  xUsername: string; // X(Twitter) Username
  verifiedAt: string; // ISO 8601 타임스탬프
  engagementScore: number; // 초기값: 0
  allowlistBatchId?: string; // Allowlist Batch ID ("1", "2", "3", ...) - 등록 시점의 배치
  merkleProof?: string[]; // 머클 증명 (나중에 추가)
  // status 필드 제거 (Hard Delete 방식으로 변경, 등록/미등록 2-state만 존재)
  mintedAt?: string; // 민팅 완료 시간 (옵션)
  referralCode?: string; // 추천인 코드 (향후 확장)
}

/**
 * EventTasks Table
 * PK: walletAddress, SK: taskType
 */
export interface EventTask {
  walletAddress: string; // PK
  taskType: TaskType; // SK: 'FOLLOW' | 'LIKE' | 'RETWEET'
  completed: boolean; // 완료 여부
  completedAt?: string; // 완료 시간 (ISO 8601)
  xUserId: string; // X User ID
  metadata?: TaskMetadata; // 추가 메타데이터
}

export type TaskType = 'FOLLOW' | 'LIKE' | 'RETWEET';

export interface TaskMetadata {
  tweetId?: string; // 좋아요/리트윗 대상 트윗 ID
  apiCallCount?: number; // API 호출 횟수 (디버깅)
  lastCheckedAt?: string; // 마지막 검증 시간 (Rate Limit 캐싱용)
}

// ========== API Request/Response Types ==========

/**
 * POST /event/verify - 참여 자격 검증 요청
 */
export interface VerifyEligibilityRequest {
  walletAddress: string; // MetaMask 지갑 주소
  xUserId: string; // X User ID
  xUsername: string; // X Username
}

/**
 * POST /event/verify - 참여 자격 검증 응답
 */
export interface VerifyEligibilityResponse {
  success: boolean;
  eligible: boolean; // 참여 자격 여부
  tasks: TaskStatus[]; // 각 작업 완료 상태
  message?: string; // 에러 메시지
  rateLimitInfo?: RateLimitInfo; // Rate Limit 정보
}

export interface TaskStatus {
  taskType: TaskType;
  completed: boolean;
  message?: string; // 미완료 시 안내 메시지
}

export interface RateLimitInfo {
  remaining: number; // 남은 API 호출 횟수
  reset: number; // 리셋 시간 (Unix timestamp)
  limit: number; // 전체 제한 횟수
}

/**
 * POST /event/register - 화이트리스트 등록 요청
 */
export interface RegisterUserRequest {
  walletAddress: string; // MetaMask 지갑 주소
  xUserId: string; // X User ID
  xUsername: string; // X Username
}

/**
 * POST /event/register - 화이트리스트 등록 응답
 */
export interface RegisterUserResponse {
  success: boolean;
  registered: boolean; // 등록 성공 여부
  whitelist?: NftWhitelist; // 등록된 화이트리스트 정보
  message?: string; // 에러 메시지 또는 성공 메시지
}

/**
 * GET /event/merkle/{walletAddress} - 머클 증명 조회
 */
export interface GetMerkleProofResponse {
  success: boolean;
  walletAddress: string;
  merkleProof?: string[]; // 머클 증명 (아직 미구현)
  message?: string;
}

/**
 * GET /admin/export-csv - OpenSea CSV export (관리자 전용)
 */
export interface ExportCsvResponse {
  success: boolean;
  presignedUrl?: string; // S3 Presigned URL
  count?: number; // 화이트리스트 사용자 수
  expiresIn?: number; // URL 만료 시간 (초)
  message?: string;
}

// ========== X API Verification Types ==========

/**
 * X API 검증 서비스 인터페이스
 */
export interface VerificationResult {
  following: boolean; // 팔로우 여부
  liked: boolean; // 좋아요 여부
  retweeted: boolean; // 리트윗 여부
  allCompleted: boolean; // 모든 작업 완료 여부
  tasks: TaskStatus[];
}

/**
 * X API 클라이언트 설정
 */
export interface XApiConfig {
  bearerToken: string; // X API Bearer Token
  targetUsername: string; // 팔로우 대상 계정 (예: "Nasun_io")
  targetTweetId: string; // 좋아요/리트윗 대상 트윗 ID
}

// ========== Rate Limiting Types ==========

/**
 * Rate Limit 관리 상태
 */
export interface RateLimitState {
  remaining: number; // 남은 API 호출 횟수
  reset: number; // 리셋 시간 (Unix timestamp)
  limit: number; // 전체 제한 횟수
}

/**
 * Rate Limit 캐시 엔트리
 */
export interface CachedTaskResult {
  walletAddress: string;
  taskType: TaskType;
  completed: boolean;
  lastCheckedAt: string; // ISO 8601
  expiresAt: string; // ISO 8601 (lastCheckedAt + 15분)
}

// ========== Environment Variables ==========

/**
 * Lambda 환경 변수
 */
export interface NftEventEnv {
  // DynamoDB Table Names
  WHITELIST_TABLE_NAME: string;
  TASKS_TABLE_NAME: string;

  // X API Configuration
  X_API_BEARER_TOKEN: string;
  X_TARGET_USERNAME: string; // 팔로우 대상 (예: "Nasun_io")
  X_TARGET_TWEET_ID: string; // 좋아요/리트윗 대상

  // Feature Flags
  ENABLE_RATE_LIMIT_CACHE: string; // "true" | "false"
  CACHE_TTL_MINUTES: string; // 기본값: "15"

  // S3 Bucket (CSV Export)
  EXPORT_BUCKET_NAME?: string;

  // AWS Region
  AWS_REGION: string;
}

// ========== Error Types ==========

/**
 * NFT Event 에러 타입
 */
export class NftEventError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = 'NftEventError';
  }
}

/**
 * 에러 코드
 */
export enum ErrorCode {
  // Validation Errors (400)
  INVALID_WALLET_ADDRESS = 'INVALID_WALLET_ADDRESS',
  INVALID_X_USER_ID = 'INVALID_X_USER_ID',
  INVALID_X_USERNAME = 'INVALID_X_USERNAME',

  // Business Logic Errors (400)
  ALREADY_REGISTERED = 'ALREADY_REGISTERED',
  NOT_ELIGIBLE = 'NOT_ELIGIBLE',
  TASKS_NOT_COMPLETED = 'TASKS_NOT_COMPLETED',

  // X API Errors (502, 429)
  X_API_ERROR = 'X_API_ERROR',
  X_API_RATE_LIMIT = 'X_API_RATE_LIMIT',

  // Database Errors (500)
  DYNAMODB_ERROR = 'DYNAMODB_ERROR',

  // Unknown Errors (500)
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}
