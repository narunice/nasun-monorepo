/**
 * NFT Event Type Definitions
 *
 * @description
 * Wave 1 Battalion NFT Free Mint 이벤트 관련 TypeScript 타입 정의
 *
 * @author Claude Code
 * @date 2025-10-25
 */
/**
 * NftWhitelist Table
 * PK: walletAddress
 */
export interface NftWhitelist {
    walletAddress: string;
    xUserId: string;
    xUsername: string;
    verifiedAt: string;
    engagementScore: number;
    merkleProof?: string[];
    status: 'ACTIVE' | 'MINTED';
    mintedAt?: string;
    referralCode?: string;
}
/**
 * EventTasks Table
 * PK: walletAddress, SK: taskType
 */
export interface EventTask {
    walletAddress: string;
    taskType: TaskType;
    completed: boolean;
    completedAt?: string;
    xUserId: string;
    metadata?: TaskMetadata;
}
export type TaskType = 'FOLLOW' | 'LIKE' | 'RETWEET';
export interface TaskMetadata {
    tweetId?: string;
    apiCallCount?: number;
    lastCheckedAt?: string;
}
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
export interface TaskStatus {
    taskType: TaskType;
    completed: boolean;
    message?: string;
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
 * GET /event/merkle/{walletAddress} - 머클 증명 조회
 */
export interface GetMerkleProofResponse {
    success: boolean;
    walletAddress: string;
    merkleProof?: string[];
    message?: string;
}
/**
 * GET /admin/export-csv - OpenSea CSV export (관리자 전용)
 */
export interface ExportCsvResponse {
    success: boolean;
    presignedUrl?: string;
    count?: number;
    expiresIn?: number;
    message?: string;
}
/**
 * X API 검증 서비스 인터페이스
 */
export interface VerificationResult {
    following: boolean;
    liked: boolean;
    retweeted: boolean;
    allCompleted: boolean;
    tasks: TaskStatus[];
}
/**
 * X API 클라이언트 설정
 */
export interface XApiConfig {
    bearerToken: string;
    targetUsername: string;
    targetTweetId: string;
}
/**
 * Rate Limit 관리 상태
 */
export interface RateLimitState {
    remaining: number;
    reset: number;
    limit: number;
}
/**
 * Rate Limit 캐시 엔트리
 */
export interface CachedTaskResult {
    walletAddress: string;
    taskType: TaskType;
    completed: boolean;
    lastCheckedAt: string;
    expiresAt: string;
}
/**
 * Lambda 환경 변수
 */
export interface NftEventEnv {
    WHITELIST_TABLE_NAME: string;
    TASKS_TABLE_NAME: string;
    X_API_BEARER_TOKEN: string;
    X_TARGET_USERNAME: string;
    X_TARGET_TWEET_ID: string;
    ENABLE_RATE_LIMIT_CACHE: string;
    CACHE_TTL_MINUTES: string;
    EXPORT_BUCKET_NAME?: string;
    AWS_REGION: string;
}
/**
 * NFT Event 에러 타입
 */
export declare class NftEventError extends Error {
    code: string;
    statusCode: number;
    constructor(message: string, code: string, statusCode?: number);
}
/**
 * 에러 코드
 */
export declare enum ErrorCode {
    INVALID_WALLET_ADDRESS = "INVALID_WALLET_ADDRESS",
    INVALID_X_USER_ID = "INVALID_X_USER_ID",
    INVALID_X_USERNAME = "INVALID_X_USERNAME",
    ALREADY_REGISTERED = "ALREADY_REGISTERED",
    NOT_ELIGIBLE = "NOT_ELIGIBLE",
    TASKS_NOT_COMPLETED = "TASKS_NOT_COMPLETED",
    X_API_ERROR = "X_API_ERROR",
    X_API_RATE_LIMIT = "X_API_RATE_LIMIT",
    DYNAMODB_ERROR = "DYNAMODB_ERROR",
    UNKNOWN_ERROR = "UNKNOWN_ERROR"
}
//# sourceMappingURL=index.d.ts.map