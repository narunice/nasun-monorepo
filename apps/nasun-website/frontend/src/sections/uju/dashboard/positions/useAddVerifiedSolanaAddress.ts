// useAddVerifiedSolanaAddress
//
// Solana counterpart to `useAddVerifiedAddress` (EVM). Drives the
// challenge -> signMessage -> verify round-trip for adding a verified
// Solana address. The signing wallet does NOT have to be the user's
// currently-connected Solana adapter — the user picks Phantom or
// Solflare before triggering this hook.

import { useCallback, useRef, useState } from "react";
import {
  AdditionalSolanaApiError,
  requestAdditionalSolChallenge,
  verifyAdditionalSolChallenge,
  type SolVerifyResponse,
} from "@/services/additionalSolanaApi";
import { refreshAndSaveUserProfile } from "@/features/auth/services/userProfileService";
import { useUserStore } from "@/store/userStore";
import { useSolanaWalletAdapter, type SolWalletName } from "../useSolanaWalletAdapter";
import { useSolanaSignMessage, SolanaSignMessageError } from "./useSolanaSignMessage";

export type SolAddPhase = "idle" | "connecting" | "signing" | "verifying" | "done" | "error";

export interface UseAddVerifiedSolanaAddressApi {
  phase: SolAddPhase;
  errorMessage: string | null;
  installed: SolWalletName[];
  reset: () => void;
  /**
   * Run the full add flow against the picked wallet. `appId` is optional;
   * when present, the server-side verify ALSO sets `appBindings[appId]`
   * to the newly verified address atomically.
   */
  add: (walletName: SolWalletName, appId?: string) => Promise<SolVerifyResponse | null>;
}

export function useAddVerifiedSolanaAddress(): UseAddVerifiedSolanaAddressApi {
  const [phase, setPhase] = useState<SolAddPhase>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const inFlight = useRef(false);

  const { installed, connect } = useSolanaWalletAdapter();
  const signMessage = useSolanaSignMessage();

  const reset = useCallback(() => {
    setPhase("idle");
    setErrorMessage(null);
  }, []);

  const add = useCallback(
    async (walletName: SolWalletName, appId?: string): Promise<SolVerifyResponse | null> => {
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

      try {
        setPhase("connecting");
        setErrorMessage(null);

        // 1) Connect to the picked wallet to learn the public key. We do
        // NOT trust this for ownership proof — the actual proof is the
        // Ed25519 signature verified against the address server-side.
        const pubkey = await connect(walletName);
        if (!pubkey) {
          // useSolanaWalletAdapter sets its own error; surface a generic
          // message since the hook user already saw the picker error.
          throw new AdditionalSolanaApiError("Wallet connection failed.");
        }

        // 2) Server issues nonce + message bound to (identityId, pubkey, appId).
        // Cap + cross-account uniqueness fail fast here before signing prompt.
        const challenge = await requestAdditionalSolChallenge(pubkey, cognitoToken, appId);

        // 3) signMessage on the UTF-8 bytes of `challenge.message`.
        setPhase("signing");
        const signed = await signMessage(walletName, challenge.message);

        // The wallet's publicKey must equal the pubkey the server challenged.
        // The server enforces this too, but failing locally gives a clearer
        // error than a 400 round-trip.
        if (signed.publicKey !== pubkey) {
          throw new AdditionalSolanaApiError(
            "The wallet that signed does not match the wallet that was connected.",
          );
        }

        // 4) Backend Ed25519 verify + persist.
        setPhase("verifying");
        const verified = await verifyAdditionalSolChallenge(
          {
            signature: signed.signature,
            nonce: challenge.nonce,
            publicKey: signed.publicKey,
          },
          cognitoToken,
        );

        // 5) Refresh local profile so userStore reflects the new state.
        await refreshAndSaveUserProfile(identityId);

        setPhase("done");
        return verified;
      } catch (err) {
        if (err instanceof SolanaSignMessageError && err.code === "rejected") {
          // User cancelled — silent return to idle, no toast.
          setPhase("idle");
          setErrorMessage(null);
          return null;
        }
        const msg =
          err instanceof AdditionalSolanaApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Failed to add Solana wallet.";
        setPhase("error");
        setErrorMessage(msg);
        return null;
      } finally {
        inFlight.current = false;
      }
    },
    [connect, signMessage],
  );

  return { phase, errorMessage, installed, reset, add };
}
