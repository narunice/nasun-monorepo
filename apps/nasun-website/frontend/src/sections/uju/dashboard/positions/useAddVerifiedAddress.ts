// useAddVerifiedAddress
//
// Wallet-add helper that drives the challenge → personal_sign → verify
// round-trip. Returns a single `add(appId?)` function plus phase + error
// state for UI. Used by `AdditionalWalletsCard` (no appId) and by the
// my-account "Additional Wallets" section (without appId).
//
// The signing wallet does NOT have to match the user's currently
// connected primary metamask. We force-prompt `eth_requestAccounts` so
// the user can pick a different account in the MetaMask popup before
// signing.

import { useCallback, useRef, useState } from "react";
import {
  AdditionalEvmApiError,
  requestAdditionalChallenge,
  verifyAdditionalChallenge,
  type VerifyResponse,
} from "@/services/additionalEvmApi";
import { refreshAndSaveUserProfile } from "@/features/auth/services/userProfileService";
import { useUserStore } from "../../../../store/userStore";

export type AddPhase = "idle" | "connecting" | "signing" | "verifying" | "done" | "error";

interface EthereumProvider {
  request<T = unknown>(args: { method: string; params?: unknown[] }): Promise<T>;
}

function getEthereum(): EthereumProvider | null {
  const w = window as unknown as { ethereum?: EthereumProvider };
  return w.ethereum ?? null;
}

export interface UseAddVerifiedAddressApi {
  phase: AddPhase;
  errorMessage: string | null;
  reset: () => void;
  add: (appId?: string) => Promise<VerifyResponse | null>;
}

export function useAddVerifiedAddress(): UseAddVerifiedAddressApi {
  const [phase, setPhase] = useState<AddPhase>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const inFlight = useRef(false);

  const reset = useCallback(() => {
    setPhase("idle");
    setErrorMessage(null);
  }, []);

  const add = useCallback(async (appId?: string): Promise<VerifyResponse | null> => {
    if (inFlight.current) return null;
    inFlight.current = true;

    const cognitoToken = useUserStore.getState().user?.cognitoToken;
    const identityId = useUserStore.getState().user?.identityId;
    if (!cognitoToken || !identityId) {
      setPhase("error");
      setErrorMessage("Please sign in again before adding a wallet.");
      inFlight.current = false;
      return null;
    }

    const ethereum = getEthereum();
    if (!ethereum) {
      setPhase("error");
      setErrorMessage("MetaMask (or compatible EVM wallet) is not detected.");
      inFlight.current = false;
      return null;
    }

    try {
      setPhase("connecting");
      setErrorMessage(null);

      const accounts = await ethereum.request<string[]>({ method: "eth_requestAccounts" });
      const selected = accounts?.[0];
      if (!selected) {
        throw new AdditionalEvmApiError("No wallet account selected.");
      }

      // 1) Ask the server for a nonce keyed to (identityId, address, appId).
      // The server enforces cap + cross-account uniqueness here so we fail
      // fast before the signing prompt.
      const challenge = await requestAdditionalChallenge(selected, cognitoToken, appId);

      // 2) personal_sign(message, address). MetaMask requires the signer
      // address to be the second param. We rely on the recovered address
      // matching server-side (verify endpoint compares to the challenged
      // address — see auth-metamask-additional/handlers/verify.ts).
      setPhase("signing");
      const signature = await ethereum.request<string>({
        method: "personal_sign",
        params: [challenge.message, selected],
      });

      setPhase("verifying");
      const verified = await verifyAdditionalChallenge(signature, challenge.nonce, cognitoToken);

      // 3) Refresh the local profile so userStore mirrors the new
      // additionalAddresses / appBindings state. The card hook reads via
      // useUserStore so this is what makes the new binding visible.
      await refreshAndSaveUserProfile(identityId);

      setPhase("done");
      return verified;
    } catch (err) {
      // MetaMask cancel surfaces as { code: 4001 } — treat as a silent
      // close (return to idle) rather than an error toast.
      const code = (err as { code?: number }).code;
      if (code === 4001) {
        setPhase("idle");
        setErrorMessage(null);
        return null;
      }
      const msg = err instanceof AdditionalEvmApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Failed to add wallet.";
      setPhase("error");
      setErrorMessage(msg);
      return null;
    } finally {
      inFlight.current = false;
    }
  }, []);

  return { phase, errorMessage, reset, add };
}
