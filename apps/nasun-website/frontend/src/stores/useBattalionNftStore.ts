/**
 * Battalion NFT Store (Zustand)
 *
 * @description
 * Battalion NFT 진행 상태를 관리하는 Zustand Store
 * LocalStorage와 동기화하여 브라우저 새로고침 후에도 상태 복원
 *
 * @author Claude Code
 * @date 2025-10-25
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  EventStep,
  VerificationResult,
  NftWhitelist,
  BattalionNftStore,
} from '../types/battalion-nft';

const STORAGE_KEY = 'battalion-nft-state';

/**
 * Battalion NFT 상태 관리 Store
 *
 * @features
 * - LocalStorage 영속화: 새로고침 후에도 상태 유지
 * - currentStep 추적: 사용자가 어느 단계에 있는지 추적
 * - X Auth 정보 저장: userId, username
 * - 검증 결과 저장: 태스크 완료 여부
 * - 지갑 주소 저장: MetaMask 연결 정보
 * - 등록 정보 저장: 화이트리스트 등록 결과
 *
 * @example
 * const { currentStep, setStep, setXAuth } = useBattalionNftStore();
 *
 * // Step 이동
 * setStep(2);
 *
 * // X Auth 정보 저장
 * setXAuth('123456789', 'username');
 *
 * // 상태 초기화
 * reset();
 */
export const useBattalionNftStore = create<BattalionNftStore>()(
  persist(
    (set) => ({
      // ========== State ==========
      currentStep: 1,
      xUserId: undefined,
      xUsername: undefined,
      cognitoIdentityId: undefined,
      walletAddress: undefined,
      verification: undefined,
      registered: false,
      whitelist: undefined,

      // ========== Actions ==========

      /**
       * Step 설정
       */
      setStep: (step: EventStep) => {
        console.log(`[useBattalionNftStore] Setting step: ${step}`);
        set({ currentStep: step });
      },

      /**
       * X Auth 정보 설정 (Step 2 완료 → Step 3으로 이동)
       */
      setXAuth: (userId: string, username: string, identityId: string) => {
        console.log(`[useBattalionNftStore] Setting X Auth: ${username} (${userId}), identityId: ${identityId}`);
        set({
          xUserId: userId,
          xUsername: username,
          cognitoIdentityId: identityId,
          currentStep: 3, // X Auth 완료 시 Step 3 (Task Verification)로 이동
        });
      },

      /**
       * 검증 결과 설정 (Step 3 완료 → Step 4로 이동)
       */
      setVerification: (result: VerificationResult) => {
        console.log('[useBattalionNftStore] Setting verification result:', result);
        set({
          verification: result,
          currentStep: result.allCompleted ? 4 : 3, // 모든 태스크 완료 시 Step 4 (Wallet Connect)로 이동
        });
      },

      /**
       * 지갑 주소 설정 (Step 4 완료 → Step 5로 이동)
       */
      setWalletAddress: (address: string) => {
        console.log(`[useBattalionNftStore] Setting wallet address: ${address}`);

        // ✅ 방어적 체크: 빈 문자열이나 undefined는 거부
        if (!address || address.trim() === '') {
          console.error('[useBattalionNftStore] Invalid wallet address - ignoring');
          return;
        }

        set({
          walletAddress: address,
          currentStep: 5, // 지갑 연결 성공 시 Step 5 (Register)로 이동
        });
      },

      /**
       * 등록 완료 설정 (Step 5 완료 → Step 6 Complete로 이동)
       */
      setRegistered: (whitelist: NftWhitelist) => {
        console.log('[useBattalionNftStore] Setting registered:', whitelist);
        set({
          registered: true,
          whitelist,
          currentStep: 6, // 등록 완료 시 Step 6 (Complete)로 이동
        });
      },

      /**
       * 상태 초기화
       */
      reset: () => {
        console.log('[useBattalionNftStore] Resetting state');
        set({
          currentStep: 1,
          xUserId: undefined,
          xUsername: undefined,
          cognitoIdentityId: undefined,
          walletAddress: undefined,
          verification: undefined,
          registered: false,
          whitelist: undefined,
        });
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        // LocalStorage에 저장할 필드만 선택
        currentStep: state.currentStep,
        xUserId: state.xUserId,
        xUsername: state.xUsername,
        cognitoIdentityId: state.cognitoIdentityId,
        walletAddress: state.walletAddress,
        verification: state.verification,
        registered: state.registered,
        whitelist: state.whitelist,
      }),
    }
  )
);
