// useAddVerifiedAddress
//
// Wallet-add helper that drives the challenge → personal_sign → verify
// round-trip via wagmi + RainbowKit. The previous implementation read
// `window.ethereum` directly, which gets hijacked by whichever EVM
// extension wins the injection race (Rabby commonly overrides MetaMask),
// preventing the user from picking the wallet they actually want. It
// also re-used the currently selected account, which produced
// "address already verified" when that account was already linked.
//
// This version opens the RainbowKit connect modal so the user picks a
// wallet (and account) deliberately, then signs with that connection.

import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount, useSignMessage, useDisconnect } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import {
  AdditionalEvmApiError,
  requestAdditionalChallenge,
  verifyAdditionalChallenge,
  type VerifyResponse,
} from "@/services/additionalEvmApi";
import { refreshAndSaveUserProfile } from "@/features/auth/services/userProfileService";
import { useUserStore } from "../../../../store/userStore";

export type AddPhase = "idle" | "connecting" | "signing" | "verifying" | "done" | "error";

export interface UseAddVerifiedAddressApi {
  phase: AddPhase;
  errorMessage: string | null;
  reset: () => void;
  add: (appId?: string) => Promise<VerifyResponse | null>;
}

export function useAddVerifiedAddress(): UseAddVerifiedAddressApi {
  const [phase, setPhase] = useState<AddPhase>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { disconnectAsync } = useDisconnect();
  const { openConnectModal } = useConnectModal();

  // RainbowKit returns undefined for openConnectModal when already connected;
  // we always want the latest reference after disconnect re-renders.
  const openConnectModalRef = useRef(openConnectModal);
  useEffect(() => {
    openConnectModalRef.current = openConnectModal;
  }, [openConnectModal]);

  // Per-flow state: appId, pending-modal trigger, and the resolver for the
  // promise returned by add().
  const appIdRef = useRef<string | undefined>(undefined);
  const pendingModalRef = useRef(false);
  const inFlightRef = useRef(false);
  const flowStartAddressRef = useRef<string | null>(null);
  const resolverRef = useRef<((v: VerifyResponse | null) => void) | null>(null);

  const resolveAdd = useCallback((v: VerifyResponse | null) => {
    inFlightRef.current = false;
    flowStartAddressRef.current = null;
    const r = resolverRef.current;
    resolverRef.current = null;
    r?.(v);
  }, []);

  const reset = useCallback(() => {
    setPhase("idle");
    setErrorMessage(null);
  }, []);

  const runVerify = useCallback(
    async (selected: string) => {
      const cognitoToken = useUserStore.getState().user?.cognitoToken;
      const identityId = useUserStore.getState().user?.identityId;
      if (!cognitoToken || !identityId) {
        setPhase("error");
        setErrorMessage("Please sign in again before adding a wallet.");
        resolveAdd(null);
        return;
      }

      try {
        const challenge = await requestAdditionalChallenge(
          selected,
          cognitoToken,
          appIdRef.current,
        );

        setPhase("signing");
        const signature = await signMessageAsync({
          message: challenge.message,
        });

        setPhase("verifying");
        const verified = await verifyAdditionalChallenge(
          signature,
          challenge.nonce,
          cognitoToken,
        );

        await refreshAndSaveUserProfile(identityId);
        setPhase("done");
        resolveAdd(verified);
      } catch (err) {
        const code = (err as { code?: number }).code;
        // User canceled the sign request — silent return to idle.
        if (code === 4001) {
          setPhase("idle");
          setErrorMessage(null);
          resolveAdd(null);
        } else {
          const rawMsg =
            err instanceof AdditionalEvmApiError
              ? err.message
              : err instanceof Error
                ? err.message
                : "Failed to add wallet.";
          const msg = /already verified/i.test(rawMsg)
            ? "That account is already linked. Switch to a different account in your wallet extension and try again."
            : rawMsg;
          setPhase("error");
          setErrorMessage(msg);
          resolveAdd(null);
        }
      } finally {
        // Leave the user disconnected so the next add() reliably re-opens
        // the picker rather than silently reusing whatever account was
        // last connected.
        try {
          await disconnectAsync();
        } catch {
          /* ignore */
        }
      }
    },
    [signMessageAsync, disconnectAsync, resolveAdd],
  );

  // Open the modal once disconnect has propagated and openConnectModal
  // becomes available again.
  useEffect(() => {
    if (pendingModalRef.current && !isConnected && openConnectModal) {
      pendingModalRef.current = false;
      openConnectModal();
    }
  }, [isConnected, openConnectModal]);

  // After the user picks a wallet in the RainbowKit modal, wagmi reports
  // isConnected=true with a fresh address. That's our signal to run the
  // challenge/sign/verify flow.
  useEffect(() => {
    if (!inFlightRef.current) return;
    if (!isConnected || !address) return;
    // Ignore the pre-existing connection — we only react once a *new*
    // address materializes after the modal-driven disconnect/reconnect.
    if (flowStartAddressRef.current === address) return;
    flowStartAddressRef.current = address;
    setPhase("connecting");
    void runVerify(address);
  }, [isConnected, address, runVerify]);

  const add = useCallback(
    (appId?: string): Promise<VerifyResponse | null> => {
      if (inFlightRef.current) return Promise.resolve(null);
      inFlightRef.current = true;
      appIdRef.current = appId;
      flowStartAddressRef.current = address ?? null;
      setErrorMessage(null);
      setPhase("connecting");

      return new Promise<VerifyResponse | null>((resolve) => {
        resolverRef.current = resolve;
        if (isConnected) {
          // Tear down the existing connection so the RainbowKit modal is
          // openable (it returns undefined while connected) and so the
          // user gets a fresh wallet/account picker instead of silently
          // reusing the auto-injected one.
          pendingModalRef.current = true;
          disconnectAsync().catch(() => {
            pendingModalRef.current = false;
            const open = openConnectModalRef.current;
            if (open) open();
          });
        } else {
          const open = openConnectModalRef.current;
          if (open) {
            open();
          } else {
            setPhase("error");
            setErrorMessage("Wallet connector is not ready. Please retry.");
            resolveAdd(null);
          }
        }
      });
    },
    [address, isConnected, disconnectAsync, resolveAdd],
  );

  return { phase, errorMessage, reset, add };
}
