/**
 * Genesis NFT Store (Zustand)
 *
 * @description
 * Genesis NFT 진행 상태를 관리하는 Zustand Store
 * LocalStorage와 동기화하여 브라우저 새로고침 후에도 상태 복원
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  EventStep,
  VerificationResult,
  NftWhitelist,
  GenesisNftStore,
} from '../types/genesis-nft';

const STORAGE_KEY = 'genesis-nft-state';

export const useGenesisNftStore = create<GenesisNftStore>()(
  persist(
    (set) => ({
      // ========== State ==========
      currentStep: 1,
      xUserId: undefined,
      xUsername: undefined,
      cognitoIdentityId: undefined,
      cognitoToken: undefined,
      walletAddress: undefined,
      walletProof: undefined,
      proofIssuedAt: undefined,
      verification: undefined,
      registered: false,
      whitelist: undefined,
      statusVersion: 0,

      // ========== Actions ==========

      setStep: (step: EventStep) => {
        console.log(`[useGenesisNftStore] Setting step: ${step}`);
        set({ currentStep: step });
      },

      setXAuth: (userId: string, username: string, identityId: string, cognitoToken?: string) => {
        console.log(`[useGenesisNftStore] Setting X Auth: ${username} (${userId}), identityId: ${identityId}`);
        set({
          xUserId: userId,
          xUsername: username,
          cognitoIdentityId: identityId,
          cognitoToken,
          currentStep: 3,
          registered: false,
          whitelist: undefined,
          walletAddress: undefined,
          walletProof: undefined,
          proofIssuedAt: undefined,
        });
      },

      setVerification: (result: VerificationResult) => {
        console.log('[useGenesisNftStore] Setting verification result:', result);
        set({
          verification: result,
          currentStep: result.allCompleted ? 4 : 3,
        });
      },

      setWalletAddress: (address: string) => {
        console.log(`[useGenesisNftStore] Setting wallet address: ${address}`);

        if (!address || address.trim() === '') {
          console.error('[useGenesisNftStore] Invalid wallet address - ignoring');
          return;
        }

        set({
          walletAddress: address,
          currentStep: 5,
        });
      },

      setWalletProof: (proof: string, issuedAt: string) => {
        console.log('[useGenesisNftStore] Setting wallet proof');
        set({ walletProof: proof, proofIssuedAt: issuedAt });
      },

      setRegistered: (whitelist: NftWhitelist) => {
        console.log('[useGenesisNftStore] Setting registered:', whitelist);
        set({
          registered: true,
          whitelist,
          currentStep: 6,
        });
      },

      invalidateStatus: () => set((state) => ({ statusVersion: state.statusVersion + 1 })),

      reset: () => {
        console.log('[useGenesisNftStore] Resetting state');
        set((state) => ({
          currentStep: 1,
          xUserId: undefined,
          xUsername: undefined,
          cognitoIdentityId: undefined,
          cognitoToken: undefined,
          walletAddress: undefined,
          walletProof: undefined,
          proofIssuedAt: undefined,
          verification: undefined,
          registered: false,
          whitelist: undefined,
          statusVersion: state.statusVersion + 1,
        }));
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
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
