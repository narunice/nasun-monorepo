/**
 * Gostop API auth orchestrator.
 *
 * Combines the three signer flavors (zkLogin / passkey / local keypair) into
 * a single `walletAddress + signPersonal` surface and exposes:
 *   - `walletAddress`: the address that should attach Bearer to /me/* calls
 *   - `tokenReady`:    true once a non-expired token exists in sessionStorage
 *   - `ensureToken()`: idempotent acquire — runs challenge/verify if missing
 *
 * `ensureToken` is called automatically when a wallet connects and no token
 * exists. A module-level promise prevents two effect runs (StrictMode) or
 * two query hooks from racing the challenge endpoint.
 *
 * Failure mode: if the user rejects the personal-sign prompt, `ensureToken`
 * rejects and surfaces via `error`. UI can re-trigger by calling
 * `ensureToken()` again (e.g. on a "Sign in" button click).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  useWallet,
  useZkLogin,
  usePasskeyStore,
  signPersonalWithZkLogin,
  ZkLoginError,
} from '@nasun/wallet';
import { acquireToken, type SignPersonalFn } from '../lib/api/auth';
import { getToken } from '../lib/api/tokenStore';

interface SignerHandle {
  walletAddress: string;
  signPersonal: SignPersonalFn;
}

// Module-level in-flight map keyed by wallet address. Prevents duplicate
// challenge fires when multiple hooks call ensureToken concurrently or when
// React 18 StrictMode double-invokes effects.
const inFlight = new Map<string, Promise<string>>();

export interface UseGostopAuthResult {
  walletAddress: string | undefined;
  tokenReady: boolean;
  error: Error | null;
  ensureToken: () => Promise<string | null>;
}

export function useGostopAuth(): UseGostopAuthResult {
  const { status, account, getKeypair } = useWallet();
  const { isConnected: isZkLoggedIn, state: zkState } = useZkLogin();
  const passkeyKeypair = usePasskeyStore((s) => s.keypair);
  const passkeyAddress = usePasskeyStore((s) => s.address);
  const isPasskeyUnlocked = usePasskeyStore((s) => s.isUnlocked);

  const isLocalWalletActive = status === 'unlocked' && !!account?.address;

  const signer: SignerHandle | null = useMemo(() => {
    if (isZkLoggedIn && zkState?.address && zkState.proof) {
      // Capture the fields signPersonalWithZkLogin needs. The closure resolves
      // them lazily at sign time so an epoch refresh between connect and sign
      // is still safe.
      const addr = zkState.address;
      return {
        walletAddress: addr,
        signPersonal: async (message) => {
          if (!zkState.proof) throw new ZkLoginError('PROVER_FAILED', 'ZK proof not available');
          return signPersonalWithZkLogin({
            message,
            ephemeralPrivateKey: zkState.ephemeralPrivateKey,
            proof: zkState.proof,
            maxEpoch: zkState.maxEpoch,
            addressSeed: zkState.addressSeed,
          });
        },
      };
    }
    if (isPasskeyUnlocked && passkeyKeypair && passkeyAddress) {
      const addr = passkeyAddress;
      return {
        walletAddress: addr,
        signPersonal: async (message) => {
          const { signature } = await passkeyKeypair.signPersonalMessage(message);
          return signature;
        },
      };
    }
    if (isLocalWalletActive && account?.address) {
      const addr = account.address;
      return {
        walletAddress: addr,
        signPersonal: async (message) => {
          const kp = getKeypair();
          if (!kp) throw new Error('Keypair not available');
          const { signature } = await kp.signPersonalMessage(message);
          return signature;
        },
      };
    }
    return null;
  }, [
    isZkLoggedIn,
    zkState,
    isPasskeyUnlocked,
    passkeyKeypair,
    passkeyAddress,
    isLocalWalletActive,
    account?.address,
    getKeypair,
  ]);

  const [tokenReady, setTokenReady] = useState<boolean>(() =>
    signer ? getToken(signer.walletAddress) !== null : false,
  );
  const [error, setError] = useState<Error | null>(null);

  // Track which wallet we last reflected so a wallet switch immediately
  // re-evaluates the stored token without waiting for a network round-trip.
  const lastWalletRef = useRef<string | null>(null);
  useEffect(() => {
    const addr = signer?.walletAddress ?? null;
    if (addr !== lastWalletRef.current) {
      lastWalletRef.current = addr;
      setTokenReady(addr ? getToken(addr) !== null : false);
      setError(null);
    }
  }, [signer?.walletAddress]);

  const ensureToken = useCallback(async (): Promise<string | null> => {
    if (!signer) return null;
    const { walletAddress, signPersonal } = signer;

    const existing = getToken(walletAddress);
    if (existing) {
      setTokenReady(true);
      return existing.token;
    }

    const cached = inFlight.get(walletAddress);
    if (cached) return cached;

    const pending = (async () => {
      try {
        const token = await acquireToken(walletAddress, signPersonal);
        setTokenReady(true);
        setError(null);
        return token;
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
        throw err;
      } finally {
        inFlight.delete(walletAddress);
      }
    })();

    inFlight.set(walletAddress, pending);
    return pending;
  }, [signer]);

  // Auto-acquire on wallet connect. Skip if a prior attempt errored — user
  // must explicitly retry to avoid an infinite signature-prompt loop when
  // the wallet keeps rejecting.
  useEffect(() => {
    if (!signer || tokenReady || error) return;
    ensureToken().catch(() => {
      // error state already captured inside ensureToken
    });
  }, [signer, tokenReady, error, ensureToken]);

  return {
    walletAddress: signer?.walletAddress,
    tokenReady,
    error,
    ensureToken,
  };
}
