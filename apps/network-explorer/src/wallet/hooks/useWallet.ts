/**
 * Nasun Wallet 상태 관리 훅
 * Zustand 기반 전역 상태 관리
 */

import { create } from 'zustand';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import type { WalletState, WalletActions, WalletAccount } from '../types/wallet';
import {
  hasKeystore,
  createAndSaveWallet,
  createWalletWithMnemonic,
  importWalletFromMnemonic,
  importWalletFromPrivateKey,
  unlockKeystore,
  deleteKeystore,
  getStoredAddress,
} from '../lib/keystore';
import { getPublicKeyFromKeypair, getAddressFromKeypair, getSecretKeyFromKeypair } from '../lib/crypto';

// 내부 상태 (키페어는 store에 저장하지 않음)
let currentKeypair: Ed25519Keypair | null = null;

interface WalletStore extends WalletState, WalletActions {
  // 내부 메서드
  _initialize: () => void;
  // 키페어 접근자 (서명 시 필요)
  getKeypair: () => Ed25519Keypair | null;
}

export const useWallet = create<WalletStore>((set) => ({
  // 초기 상태
  status: 'disconnected',
  account: null,
  isLoading: false,
  error: null,

  // 초기화 (앱 시작 시 호출)
  _initialize: () => {
    if (hasKeystore()) {
      const address = getStoredAddress();
      if (address) {
        set({ status: 'locked', account: null });
      }
    } else {
      set({ status: 'disconnected', account: null });
    }
  },

  // 새 지갑 생성
  createWallet: async (password: string): Promise<string> => {
    set({ isLoading: true, error: null });
    try {
      const address = await createAndSaveWallet(password);

      // 생성 후 자동으로 잠금 해제
      const keypair = await unlockKeystore(password);
      currentKeypair = keypair;

      const account: WalletAccount = {
        address,
        publicKey: getPublicKeyFromKeypair(keypair),
      };

      set({
        status: 'unlocked',
        account,
        isLoading: false,
      });

      return address;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create wallet';
      set({ isLoading: false, error: message });
      throw error;
    }
  },

  // 지갑 잠금 해제
  unlockWallet: async (password: string): Promise<void> => {
    set({ isLoading: true, error: null });
    try {
      const keypair = await unlockKeystore(password);
      currentKeypair = keypair;

      const account: WalletAccount = {
        address: getAddressFromKeypair(keypair),
        publicKey: getPublicKeyFromKeypair(keypair),
      };

      set({
        status: 'unlocked',
        account,
        isLoading: false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to unlock wallet';
      set({ isLoading: false, error: message });
      throw error;
    }
  },

  // 지갑 잠금
  lockWallet: () => {
    currentKeypair = null;
    const address = getStoredAddress();
    set({
      status: address ? 'locked' : 'disconnected',
      account: null,
      error: null,
    });
  },

  // 지갑 삭제
  deleteWallet: () => {
    currentKeypair = null;
    deleteKeystore();
    set({
      status: 'disconnected',
      account: null,
      error: null,
    });
  },

  // 니모닉으로 복구 (레거시 호환)
  importWallet: async (mnemonic: string, password: string): Promise<string> => {
    set({ isLoading: true, error: null });
    try {
      const address = await importWalletFromMnemonic(mnemonic, password);

      const keypair = await unlockKeystore(password);
      currentKeypair = keypair;

      const account: WalletAccount = {
        address,
        publicKey: getPublicKeyFromKeypair(keypair),
      };

      set({ status: 'unlocked', account, isLoading: false });

      return address;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to import wallet';
      set({ isLoading: false, error: message });
      throw error;
    }
  },

  // 니모닉 백업과 함께 새 지갑 생성
  createWalletWithBackup: async (password: string): Promise<{ address: string; mnemonic: string }> => {
    set({ isLoading: true, error: null });
    try {
      const { address, mnemonic } = await createWalletWithMnemonic(password);

      // 자동 잠금 해제
      const keypair = await unlockKeystore(password);
      currentKeypair = keypair;

      const account: WalletAccount = {
        address,
        publicKey: getPublicKeyFromKeypair(keypair),
      };

      set({ status: 'unlocked', account, isLoading: false });

      return { address, mnemonic };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create wallet';
      set({ isLoading: false, error: message });
      throw error;
    }
  },

  // 니모닉으로 복구 (명시적 메서드)
  importFromMnemonic: async (mnemonic: string, password: string): Promise<string> => {
    set({ isLoading: true, error: null });
    try {
      const address = await importWalletFromMnemonic(mnemonic, password);

      const keypair = await unlockKeystore(password);
      currentKeypair = keypair;

      const account: WalletAccount = {
        address,
        publicKey: getPublicKeyFromKeypair(keypair),
      };

      set({ status: 'unlocked', account, isLoading: false });

      return address;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to import wallet';
      set({ isLoading: false, error: message });
      throw error;
    }
  },

  // 개인키로 복구
  importFromPrivateKey: async (privateKey: string, password: string): Promise<string> => {
    set({ isLoading: true, error: null });
    try {
      const address = await importWalletFromPrivateKey(privateKey, password);

      const keypair = await unlockKeystore(password);
      currentKeypair = keypair;

      const account: WalletAccount = {
        address,
        publicKey: getPublicKeyFromKeypair(keypair),
      };

      set({ status: 'unlocked', account, isLoading: false });

      return address;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to import wallet';
      set({ isLoading: false, error: message });
      throw error;
    }
  },

  // 개인키 내보내기 (비밀번호 검증 필요)
  exportPrivateKey: async (password: string): Promise<string> => {
    try {
      // 비밀번호 검증을 위해 복호화 시도
      const keypair = await unlockKeystore(password);
      return getSecretKeyFromKeypair(keypair);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to export private key';
      throw new Error(message);
    }
  },

  // 에러 초기화
  clearError: () => {
    set({ error: null });
  },

  // 키페어 접근자
  getKeypair: () => {
    return currentKeypair;
  },
}));

// 편의 함수: 지갑 상태만 필요할 때
export function useWalletStatus() {
  return useWallet((state) => state.status);
}

// 편의 함수: 계정 정보만 필요할 때
export function useWalletAccount() {
  return useWallet((state) => state.account);
}

// 편의 함수: 로딩/에러 상태만 필요할 때
export function useWalletLoading() {
  return useWallet((state) => ({
    isLoading: state.isLoading,
    error: state.error,
  }));
}
