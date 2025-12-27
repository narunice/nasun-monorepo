/**
 * MetaMask Authentication Types
 *
 * MetaMask 지갑 인증 시스템에서 사용되는 TypeScript 타입 정의
 * Challenge-response 인증 플로우를 위한 요청/응답 타입 포함
 */

import { BrowserProvider, Eip1193Provider } from 'ethers';

/**
 * MetaMask Challenge 요청
 * 서버에 nonce 생성을 요청할 때 사용
 */
export interface MetaMaskChallengeRequest {
  walletAddress: string; // 0x로 시작하는 Ethereum 주소 (40자리 hex)
}

/**
 * MetaMask Challenge 응답
 * 서버에서 생성한 nonce와 서명할 메시지를 포함
 */
export interface MetaMaskChallengeResponse {
  nonce: string;          // 64자리 hex 문자열 (32바이트)
  message: string;        // 사용자가 서명할 메시지 전문
}

/**
 * MetaMask Verify 요청
 * 서명된 메시지를 서버에 전송하여 인증을 완료
 */
export interface MetaMaskVerifyRequest {
  walletAddress: string;  // Challenge와 동일한 지갑 주소
  signature: string;      // MetaMask로 서명한 서명값 (0x로 시작하는 hex)
  nonce: string;          // Challenge에서 받은 nonce
}

/**
 * MetaMask Verify 응답
 * 인증 성공 시 AWS Cognito Identity 정보를 반환
 */
export interface MetaMaskVerifyResponse {
  identityId: string;     // Cognito Identity ID (고유 식별자)
  token: string;          // OpenID Connect 토큰
}

/**
 * MetaMask API 에러 응답
 */
export interface MetaMaskErrorResponse {
  message: string;        // 에러 메시지
  code?: string;          // 에러 코드 (선택사항)
}

/**
 * MetaMask 지갑 정보
 */
export interface MetaMaskWalletInfo {
  address: string;        // 지갑 주소 (lowercase)
  chainId: number;        // 네트워크 체인 ID (1: Mainnet, 11155111: Sepolia)
  networkName: string;    // 네트워크 이름
}

/**
 * Window 객체에 추가된 ethereum 프로바이더
 * MetaMask 브라우저 확장이 주입하는 글로벌 객체
 */
declare global {
  interface Window {
    ethereum?: Eip1193Provider & {
      isMetaMask?: boolean;
      request: (args: { method: string; params?: any[] }) => Promise<any>;
      on: (event: string, callback: (...args: any[]) => void) => void;
      removeListener: (event: string, callback: (...args: any[]) => void) => void;
    };
  }
}

/**
 * MetaMask 인증 상태
 */
export enum MetaMaskAuthStatus {
  NOT_CONNECTED = 'NOT_CONNECTED',     // MetaMask 연결 안됨
  CONNECTING = 'CONNECTING',           // 연결 시도 중
  CONNECTED = 'CONNECTED',             // 연결됨 (인증 전)
  AUTHENTICATING = 'AUTHENTICATING',   // 인증 진행 중
  AUTHENTICATED = 'AUTHENTICATED',     // 인증 완료
  ERROR = 'ERROR',                     // 에러 발생
}

/**
 * MetaMask 인증 에러 타입
 */
export enum MetaMaskErrorType {
  NO_METAMASK = 'NO_METAMASK',                 // MetaMask 미설치
  WRONG_NETWORK = 'WRONG_NETWORK',             // 잘못된 네트워크
  USER_REJECTED = 'USER_REJECTED',             // 사용자 거부
  SIGNATURE_FAILED = 'SIGNATURE_FAILED',       // 서명 실패
  VERIFICATION_FAILED = 'VERIFICATION_FAILED', // 검증 실패
  NETWORK_ERROR = 'NETWORK_ERROR',             // 네트워크 에러
  UNKNOWN = 'UNKNOWN',                         // 기타 에러
}

/**
 * MetaMask 인증 컨텍스트 상태
 */
export interface MetaMaskAuthState {
  status: MetaMaskAuthStatus;
  walletInfo: MetaMaskWalletInfo | null;
  identityId: string | null;
  token: string | null;
  error: {
    type: MetaMaskErrorType;
    message: string;
  } | null;
}
