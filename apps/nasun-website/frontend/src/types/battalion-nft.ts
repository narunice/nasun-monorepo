/**
 * Battalion NFT Type Definitions (Frontend)
 *
 * @description
 * Wave 1 Battalion NFT 이벤트 프론트엔드 TypeScript 타입 정의
 *
 * @author Claude Code
 * @date 2025-10-25
 */

// ========== Event Step Types ==========

export type EventStep = 1 | 2 | 3 | 4 | 5 | 6;

export interface EventState {
  currentStep: EventStep;
  xUserId?: string;
  xUsername?: string;
  cognitoIdentityId?: string;
  cognitoToken?: string;
  walletAddress?: string;
  verification?: VerificationResult;
  registered: boolean;
}

// ========== Task Types ==========

export type TaskType = "FOLLOW" | "LIKE" | "RETWEET";

export interface TaskStatus {
  taskType: TaskType;
  completed: boolean;
  message?: string; // 미완료 시 안내 메시지
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
  walletProof: string; // HMAC-SHA256 proof from MetaMask verify
  proofIssuedAt: string; // ISO 8601 timestamp when proof was issued
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
 * POST /event/withdraw - 화이트리스트 참여 취소 요청
 *
 * xUserId 매칭으로 레코드 소유권을 검증합니다 (MetaMask 서명 제거 — 모바일 UX 개선).
 */
export interface WithdrawUserRequest {
  walletAddress: string; // MetaMask 지갑 주소
  xUserId: string; // X(Twitter) User ID — 레코드 소유권 검증용
}

/**
 * POST /event/withdraw - 화이트리스트 참여 취소 응답
 */
export interface WithdrawUserResponse {
  success: boolean;
  message: string; // 성공/에러 메시지
}

/**
 * GET /event/status - Battalion NFT 등록 상태 조회 응답
 */
export interface BattalionNftStatusResponse {
  success: boolean;
  registered: boolean; // 등록 여부
  data: NftWhitelist | null; // 등록된 경우 화이트리스트 정보
  message?: string; // 에러 메시지
}

/**
 * NftWhitelist Table
 */
export interface NftWhitelist {
  walletAddress: string; // 지갑 주소 (소문자 정규화)
  xUserId?: string; // X(Twitter) User ID (omitted from public API response for security)
  xUsername: string; // X(Twitter) Username
  verifiedAt: string; // ISO 8601 타임스탬프
  engagementScore: number; // 초기값: 0
  allowlistBatchId?: string; // Allowlist Batch ID ("1", "2", "3", ...) - 등록 시점의 배치
  merkleProof?: string[]; // 머클 증명 (나중에 추가)
  // status 필드 제거 (Hard Delete 방식으로 변경, 등록/미등록 2-state만 존재)
  // withdrawnAt 필드 제거 (Hard Delete 방식으로 변경)
  mintedAt?: string; // 민팅 완료 시간 (옵션)
  referralCode?: string; // 추천인 코드 (향후 확장)
}

// ========== Verification Result ==========

export interface VerificationResult {
  following: boolean; // 팔로우 여부
  liked: boolean; // 좋아요 여부
  retweeted: boolean; // 리트윗 여부
  allCompleted: boolean; // 모든 작업 완료 여부
  tasks: TaskStatus[];
}

// ========== Error Types ==========

export interface ApiError {
  success: false;
  error: string;
  code: string;
  message: string;
  details?: unknown;
}

export enum ErrorCode {
  // Validation Errors (400)
  INVALID_WALLET_ADDRESS = "INVALID_WALLET_ADDRESS",
  INVALID_X_USER_ID = "INVALID_X_USER_ID",
  INVALID_X_USERNAME = "INVALID_X_USERNAME",
  MISSING_REQUIRED_FIELDS = "MISSING_REQUIRED_FIELDS",
  INVALID_SIGNATURE = "INVALID_SIGNATURE",
  SIGNATURE_EXPIRED = "SIGNATURE_EXPIRED",

  // Business Logic Errors (400, 404, 409)
  ALREADY_REGISTERED = "ALREADY_REGISTERED",
  ALREADY_MINTED = "ALREADY_MINTED",
  USER_NOT_FOUND = "USER_NOT_FOUND",
  NOT_ELIGIBLE = "NOT_ELIGIBLE",
  TASKS_NOT_COMPLETED = "TASKS_NOT_COMPLETED",

  // X API Errors (502, 429)
  X_API_ERROR = "X_API_ERROR",
  X_API_RATE_LIMIT = "X_API_RATE_LIMIT",
  RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED",

  // Database Errors (500)
  DYNAMODB_ERROR = "DYNAMODB_ERROR",

  // Network Errors
  NETWORK_ERROR = "NETWORK_ERROR",
  TIMEOUT_ERROR = "TIMEOUT_ERROR",

  // Unknown Errors (500)
  UNKNOWN_ERROR = "UNKNOWN_ERROR",
  INTERNAL_ERROR = "INTERNAL_ERROR",
}

// ========== Component Props Types ==========

export interface StepperProgressProps {
  currentStep: EventStep;
  steps: string[]; // 각 단계 제목
}

export interface TaskVerificationCardProps {
  xUserId: string;
  xUsername: string;
  walletAddress?: string;
  onVerificationSuccess: (result: VerificationResult) => void;
  onError: (error: ApiError) => void;
}

export interface WalletConnectCardProps {
  onWalletConnected: (address: string) => void;
  onError: (error: Error) => void;
}

export interface RegistrationSuccessCardProps {
  whitelist: NftWhitelist;
  onMintClick: () => void;
}

export interface ErrorDisplayProps {
  error: ApiError | Error;
  onRetry?: () => void;
}

// ========== Zustand Store Types ==========

export interface BattalionNftStore {
  // State
  currentStep: EventStep;
  xUserId?: string;
  xUsername?: string;
  cognitoIdentityId?: string;
  cognitoToken?: string;
  walletAddress?: string;
  walletProof?: string;
  proofIssuedAt?: string;
  verification?: VerificationResult;
  registered: boolean;
  whitelist?: NftWhitelist;

  // Actions
  setStep: (step: EventStep) => void;
  setXAuth: (userId: string, username: string, identityId: string, cognitoToken?: string) => void;
  setVerification: (result: VerificationResult) => void;
  setWalletAddress: (address: string) => void;
  setWalletProof: (proof: string, issuedAt: string) => void;
  setRegistered: (whitelist: NftWhitelist) => void;
  reset: () => void;
}
