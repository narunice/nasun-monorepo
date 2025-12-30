/**
 * NFT Whitelist Types
 *
 * Founders NFT Whitelist 시스템의 타입 정의
 */

import type { VariantProps } from 'class-variance-authority';
import { buttonVariants } from '../components/ui/button-variants';

// ============================================================================
// API Request/Response Types
// ============================================================================

/**
 * Join Whitelist Request
 * MetaMask 서명과 함께 whitelist에 등록 요청
 */
export interface JoinWhitelistRequest {
  walletAddress: string;
  signature: string;
  message: string;
  timestamp: string;
}

/**
 * Join Whitelist Response (Success)
 */
export interface JoinWhitelistResponse {
  success: true;
  data: {
    walletAddress: string;
    joinedAt: string;
  };
}

/**
 * Withdraw Whitelist Request
 * Whitelist 등록 철회 요청
 */
export interface WithdrawWhitelistRequest {
  walletAddress: string;
  signature: string;
  message: string;
  timestamp: string;
}

/**
 * Withdraw Whitelist Response (Success)
 */
export interface WithdrawWhitelistResponse {
  success: true;
  data: {
    walletAddress: string;
    withdrawnAt: string;
  };
}

/**
 * Check Whitelist Status Request
 * Query string으로 전달: ?walletAddress=0x...
 */
export interface CheckWhitelistRequest {
  walletAddress: string;
}

/**
 * Check Whitelist Status Response (Success)
 */
export interface CheckWhitelistResponse {
  success: true;
  data: {
    registered: boolean;
    walletAddress: string;
    joinedAt?: string;
    status?: 'ACTIVE' | 'WITHDRAWN';
  };
}

/**
 * Admin List Response
 */
export interface AdminListResponse {
  success: true;
  data: {
    items: WhitelistItem[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
    statistics: {
      totalActive: number;
      totalWithdrawn: number;
      totalAll: number;
    };
  };
}

/**
 * Whitelist Item (DynamoDB Record)
 */
export interface WhitelistItem {
  walletAddress: string;
  signature: string;
  message: string;
  timestamp: string;
  joinedAt: string;
  status: 'ACTIVE' | 'WITHDRAWN';
  withdrawnAt?: string;
}

/**
 * API Error Response
 */
export interface WhitelistErrorResponse {
  success: false;
  error: string;
  message: string;
}

// ============================================================================
// UI State Types
// ============================================================================

/**
 * Whitelist Modal State
 */
export type WhitelistModalState =
  | 'idle'
  | 'intro'             // 안내 화면 (MetaMask 연결 전)
  | 'connecting'        // MetaMask 연결 중
  | 'signing'           // 메시지 서명 중
  | 'submitting'        // API 요청 중
  | 'success'           // 성공
  | 'already_joined'    // 이미 등록됨 (409)
  | 'already_withdrawn' // 이미 철회됨
  | 'error';            // 에러 발생

/**
 * Whitelist Modal Data
 */
export interface WhitelistModalData {
  state: WhitelistModalState;
  walletAddress?: string;
  joinedAt?: string;
  withdrawnAt?: string;
  error?: string;
  errorCode?: string;
}

// ============================================================================
// Component Props Types
// ============================================================================

/**
 * JoinWhitelistButton Props
 * buttonVariants의 variant와 size를 그대로 사용
 */
export interface JoinWhitelistButtonProps extends VariantProps<typeof buttonVariants> {
  className?: string;
  /** Callback when whitelist registration succeeds */
  onSuccess?: (walletAddress: string) => void;
  /** Custom button text (default: "Join the Whitelist") */
  children?: React.ReactNode;
}

/**
 * WhitelistModal Props
 */
export interface WhitelistModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  modalData: WhitelistModalData;
  onWithdraw?: () => void;
  onProceed?: () => void;  // intro 화면에서 다음 단계로 진행
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Whitelist Error Type
 */
export type WhitelistErrorType =
  | 'NO_METAMASK'
  | 'USER_REJECTED'
  | 'WRONG_NETWORK'
  | 'NETWORK_ERROR'
  | 'ALREADY_REGISTERED'
  | 'INVALID_SIGNATURE'
  | 'EXPIRED_TIMESTAMP'
  | 'API_ERROR'
  | 'UNKNOWN';
