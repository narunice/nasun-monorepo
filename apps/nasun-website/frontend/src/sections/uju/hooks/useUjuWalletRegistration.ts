import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/features/auth";
import { useWallet, useZkLogin, useSigner, ZkLoginSigner, NsaSigner } from "@nasun/wallet";
import {
  suiPrepareChallenge,
  suiConnectVerify,
  registerWallet,
  listRegisteredWallets,
  removeRegisteredWallet,
} from "@/services/suiWalletApi";
import type { RegisteredWallet } from "@/services/suiWalletApi";

export interface UseUjuWalletRegistrationResult {
  registeredWallets: RegisteredWallet[];
  isLoading: boolean;
  isRegistering: boolean;
  isRemoving: string | null;
  error: string | null;
  isCurrentWalletRegistered: boolean;
  hasSigner: boolean;
  signerAddress: string | null;
  registerCurrentWallet: () => Promise<void>;
  removeWalletByAddress: (address: string) => Promise<void>;
  refresh: () => Promise<void>;
}

// uju-native copy of useWalletRegistration. Pure logic hook, no UI.
// Owns its own dependency chain so uju does not import from sections/myAccount.
export function useUjuWalletRegistration(): UseUjuWalletRegistrationResult {
  const { user } = useAuth();
  const { status, account } = useWallet();
  const { isConnected: isZkConnected, state: zkState } = useZkLogin();
  const { signer: activeSigner } = useSigner();
  void status; void isZkConnected;

  const [registeredWallets, setRegisteredWallets] = useState<RegisteredWallet[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [isRemoving, setIsRemoving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cognitoToken = user?.cognitoToken;
  const currentWalletAddress = account?.address ?? zkState?.address;

  const isCurrentWalletRegistered =
    !!currentWalletAddress &&
    registeredWallets.some((w) => w.walletAddress === currentWalletAddress.toLowerCase());

  const refresh = useCallback(async () => {
    if (!cognitoToken) return;
    setIsLoading(true);
    setError(null);
    try {
      const wallets = await listRegisteredWallets(cognitoToken);
      setRegisteredWallets(wallets);
    } catch (e: any) {
      console.error("Failed to list wallets:", e);
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  }, [cognitoToken]);

  useEffect(() => {
    if (cognitoToken) refresh();
  }, [cognitoToken, refresh]);

  const registerCurrentWallet = useCallback(async () => {
    if (!cognitoToken) throw new Error("Not authenticated");
    if (!activeSigner) throw new Error("No wallet signer available");
    setIsRegistering(true);
    setError(null);

    try {
      const { nonce, message } = await suiPrepareChallenge();
      const messageBytes = new TextEncoder().encode(message);

      const effectiveSigner =
        activeSigner instanceof NsaSigner ? activeSigner.getUnderlyingSigner() : activeSigner;

      let verifyResult;
      if (effectiveSigner instanceof ZkLoginSigner) {
        const { signature } = await effectiveSigner.signWithEphemeralKey(messageBytes);
        const zkLoginParams = {
          zkAddress: effectiveSigner.address,
          ephemeralPublicKey: effectiveSigner.getEphemeralPublicKey(),
        };
        verifyResult = await suiConnectVerify(signature, nonce, zkLoginParams);
      } else {
        const { signature } = await effectiveSigner.signPersonal(messageBytes);
        verifyResult = await suiConnectVerify(signature, nonce);
      }

      await registerWallet(
        verifyResult.walletAddress,
        verifyResult.walletProof,
        verifyResult.proofIssuedAt,
        cognitoToken,
      );
      await refresh();
    } catch (e: any) {
      console.error("Registration failed:", e);
      setError(e.message);
    } finally {
      setIsRegistering(false);
    }
  }, [cognitoToken, activeSigner, refresh]);

  const removeWalletByAddress = useCallback(
    async (walletAddress: string) => {
      if (!cognitoToken) throw new Error("Not authenticated");
      setIsRemoving(walletAddress);
      setError(null);
      try {
        await removeRegisteredWallet(walletAddress, cognitoToken);
        await refresh();
      } catch (e: any) {
        console.error("Remove failed:", e);
        setError(e.message);
      } finally {
        setIsRemoving(null);
      }
    },
    [cognitoToken, refresh],
  );

  return {
    registeredWallets,
    isLoading,
    isRegistering,
    isRemoving,
    error,
    isCurrentWalletRegistered,
    hasSigner: !!activeSigner,
    signerAddress: activeSigner?.address ?? null,
    registerCurrentWallet,
    removeWalletByAddress,
    refresh,
  };
}
