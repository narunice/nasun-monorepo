/**
 * Pado Wallet 타입 정의
 */

// 지갑 상태
export type WalletStatus = 'disconnected' | 'locked' | 'unlocked';

// 암호화된 키 저장소
export interface EncryptedKeystore {
  // 암호화된 개인키 (base64)
  encryptedPrivateKey: string;
  // AES-GCM IV (base64)
  iv: string;
  // PBKDF2 salt (base64)
  salt: string;
  // 공개 주소
  address: string;
  // 생성 시간
  createdAt: number;
}

// 지갑 계정
export interface WalletAccount {
  address: string;
  publicKey: string;
}

// 지갑 컨텍스트 상태
export interface WalletState {
  status: WalletStatus;
  account: WalletAccount | null;
  isLoading: boolean;
  error: string | null;
}

// 지갑 컨텍스트 액션
export interface WalletActions {
  // 새 지갑 생성 (기존 랜덤 방식)
  createWallet: (password: string) => Promise<string>;
  // 새 지갑 생성 (니모닉 백업 포함)
  createWalletWithBackup: (password: string) => Promise<{ address: string; mnemonic: string }>;
  // 기존 지갑 잠금 해제
  unlockWallet: (password: string) => Promise<void>;
  // 지갑 잠금
  lockWallet: () => void;
  // 지갑 삭제
  deleteWallet: () => void;
  // 니모닉으로 복구
  importWallet: (mnemonic: string, password: string) => Promise<string>;
  // 니모닉으로 복구 (새 명시적 메서드)
  importFromMnemonic: (mnemonic: string, password: string) => Promise<string>;
  // 개인키로 복구
  importFromPrivateKey: (privateKey: string, password: string) => Promise<string>;
  // 개인키 내보내기 (비밀번호 확인 필요)
  exportPrivateKey: (password: string) => Promise<string>;
  // 에러 초기화
  clearError: () => void;
}

// 지갑 컨텍스트 전체
export interface WalletContextType extends WalletState, WalletActions {}

// 트랜잭션 요청
export interface TransactionRequest {
  to: string;
  amount: string; // NASUN 단위
}

// 트랜잭션 결과
export interface TransactionResult {
  digest: string;
  status: 'success' | 'failure';
  gasUsed?: string;
  error?: string;
}

// Faucet 응답
export interface FaucetResponse {
  transferredGasObjects: Array<{
    id: string;
    amount: number;
  }>;
  error?: string;
}

// 잔액 정보
export interface BalanceInfo {
  totalBalance: string; // SOE 단위 (최소 단위)
  formattedBalance: string; // NASUN 단위 (표시용)
  coinCount: number;
}
