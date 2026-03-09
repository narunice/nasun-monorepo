/**
 * Genesis NFT Type Definitions (Frontend)
 *
 * @description
 * Genesis NFT 이벤트 프론트엔드 TypeScript 타입 정의
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

export type TaskType = "FOLLOW" | "LIKE" | "REPOST";

export interface TaskStatus {
  taskType: TaskType;
  completed: boolean;
  message?: string;
}

// ========== API Request/Response Types ==========

/**
 * POST /event/verify - 참여 자격 검증 요청
 */
export interface VerifyEligibilityRequest {
  walletAddress: string;
  xUserId: string;
  xUsername: string;
}

/**
 * POST /event/verify - 참여 자격 검증 응답
 */
export interface VerifyEligibilityResponse {
  success: boolean;
  eligible: boolean;
  tasks: TaskStatus[];
  message?: string;
  rateLimitInfo?: RateLimitInfo;
}

export interface RateLimitInfo {
  remaining: number;
  reset: number;
  limit: number;
}

/**
 * POST /event/register - 화이트리스트 등록 요청
 */
export interface RegisterUserRequest {
  walletAddress: string;
  xUserId: string;
  xUsername: string;
  walletProof: string;
  proofIssuedAt: string;
}

/**
 * POST /event/register - 화이트리스트 등록 응답
 */
export interface RegisterUserResponse {
  success: boolean;
  registered: boolean;
  whitelist?: NftWhitelist;
  message?: string;
}

/**
 * POST /event/withdraw - 화이트리스트 참여 취소 요청
 */
export interface WithdrawUserRequest {
  walletAddress: string;
  xUserId: string;
}

/**
 * POST /event/withdraw - 화이트리스트 참여 취소 응답
 */
export interface WithdrawUserResponse {
  success: boolean;
  message: string;
}

/**
 * GET /event/status - Genesis NFT 등록 상태 조회 응답
 */
export interface GenesisNftStatusResponse {
  success: boolean;
  registered: boolean;
  data: NftWhitelist | null;
  message?: string;
}

/**
 * NftWhitelist Table
 */
export interface NftWhitelist {
  walletAddress: string;
  xUserId?: string;
  xUsername: string;
  verifiedAt: string;
  engagementScore: number;
  allowlistBatchId?: string;
  merkleProof?: string[];
  mintedAt?: string;
  referralCode?: string;
}

// ========== Verification Result ==========

export interface VerificationResult {
  following: boolean;
  liked: boolean;
  reposted: boolean;
  allCompleted: boolean;
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
  INVALID_WALLET_ADDRESS = "INVALID_WALLET_ADDRESS",
  INVALID_X_USER_ID = "INVALID_X_USER_ID",
  INVALID_X_USERNAME = "INVALID_X_USERNAME",
  MISSING_REQUIRED_FIELDS = "MISSING_REQUIRED_FIELDS",
  INVALID_SIGNATURE = "INVALID_SIGNATURE",
  SIGNATURE_EXPIRED = "SIGNATURE_EXPIRED",

  ALREADY_REGISTERED = "ALREADY_REGISTERED",
  ALREADY_MINTED = "ALREADY_MINTED",
  USER_NOT_FOUND = "USER_NOT_FOUND",
  NOT_ELIGIBLE = "NOT_ELIGIBLE",
  TASKS_NOT_COMPLETED = "TASKS_NOT_COMPLETED",

  X_API_ERROR = "X_API_ERROR",
  X_API_RATE_LIMIT = "X_API_RATE_LIMIT",
  RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED",

  DYNAMODB_ERROR = "DYNAMODB_ERROR",

  NETWORK_ERROR = "NETWORK_ERROR",
  TIMEOUT_ERROR = "TIMEOUT_ERROR",

  UNKNOWN_ERROR = "UNKNOWN_ERROR",
  INTERNAL_ERROR = "INTERNAL_ERROR",
}

// ========== Component Props Types ==========

export interface StepperProgressProps {
  currentStep: EventStep;
  steps: string[];
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

export interface GenesisNftStore {
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
  statusVersion: number;

  // Actions
  setStep: (step: EventStep) => void;
  setXAuth: (userId: string, username: string, identityId: string, cognitoToken?: string) => void;
  setVerification: (result: VerificationResult) => void;
  setWalletAddress: (address: string) => void;
  setWalletProof: (proof: string, issuedAt: string) => void;
  setRegistered: (whitelist: NftWhitelist) => void;
  invalidateStatus: () => void;
  reset: () => void;
}
