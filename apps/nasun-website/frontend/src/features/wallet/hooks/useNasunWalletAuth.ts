import { useCallback } from 'react';
import { useWallet, SignerManager, ZkLoginSigner } from '@nasun/wallet';
import { useAuth } from '@/features/auth';
import { suiPrepareChallenge, suiConnectVerify } from '@/services/suiWalletApi';
import type { SignerAdapter } from '@nasun/wallet';

export type NasunWalletStatus = 'disconnected' | 'locked' | 'unlocked';

export interface UseNasunWalletAuthResult {
  status: NasunWalletStatus;
  unlock: (password: string) => Promise<void>;
  signFlow: () => Promise<void>;
}

/**
 * Wait for SignerManager to have a current signer.
 * Resolves immediately if one is already registered, otherwise subscribes
 * to events and resolves when a signer is registered (up to timeoutMs).
 */
function waitForSigner(timeoutMs = 3000): Promise<SignerAdapter | null> {
  const existing = SignerManager.getCurrent();
  if (existing) return Promise.resolve(existing);

  return new Promise((resolve) => {
    const timer = setTimeout(() => { unsubscribe(); resolve(null); }, timeoutMs);
    const unsubscribe = SignerManager.subscribe((event) => {
      if (event.type === 'registered' || event.type === 'switched') {
        clearTimeout(timer);
        unsubscribe();
        resolve(SignerManager.getCurrent());
      }
    });
  });
}

/**
 * Nasun Wallet (Sui Ed25519) authentication hook.
 *
 * Wraps wallet status + signFlow into a single hook consumed by Navbar's WalletConnect.
 * - unlock: wraps unlockWallet (throws on wrong password)
 * - signFlow: prepare → sign → verify → signInWithWallet
 *
 * Compatible with LocalSigner.signPersonal() which internally calls
 * keypair.signPersonalMessage() (Sui BCS intent prefix included).
 */
export function useNasunWalletAuth(): UseNasunWalletAuthResult {
  const { status, unlockWallet } = useWallet();
  const { signInWithWallet } = useAuth();

  const unlock = async (password: string): Promise<void> => {
    await unlockWallet(password);
  };

  // signFlow resolves the signer at call time via SignerManager (not from closure).
  // This avoids the race condition where isZkLoggedIn becomes true but the
  // ZkLoginSigner useEffect hasn't registered the signer yet.
  const signFlow = useCallback(async (): Promise<void> => {
    const activeSigner = SignerManager.getCurrent() ?? await waitForSigner(3000);
    if (!activeSigner) throw new Error('No wallet signer available');

    const { nonce, message } = await suiPrepareChallenge();
    const messageBytes = new TextEncoder().encode(message);

    if (activeSigner instanceof ZkLoginSigner) {
      // zkLogin cannot sign personal messages (requires ZK proof). Instead, sign with the
      // ephemeral Ed25519 key and send the claimed zkLogin address + ephemeral public key
      // so the backend can verify liveness and use the zkLogin address as the identity.
      const { signature } = await activeSigner.signWithEphemeralKey(messageBytes);
      const zkLoginParams = {
        zkAddress: activeSigner.address,
        ephemeralPublicKey: activeSigner.getEphemeralPublicKey(),
      };
      const { identityId, token, walletAddress, walletProof, proofIssuedAt } = await suiConnectVerify(signature, nonce, zkLoginParams);
      await signInWithWallet(identityId, token, walletAddress, 'Nasun Wallet', walletProof, proofIssuedAt);
    } else {
      const { signature } = await activeSigner.signPersonal(messageBytes);
      const { identityId, token, walletAddress, walletProof, proofIssuedAt } = await suiConnectVerify(signature, nonce);
      await signInWithWallet(identityId, token, walletAddress, 'Nasun Wallet', walletProof, proofIssuedAt);
    }
  }, [signInWithWallet]);

  return { status: status as NasunWalletStatus, unlock, signFlow };
}
