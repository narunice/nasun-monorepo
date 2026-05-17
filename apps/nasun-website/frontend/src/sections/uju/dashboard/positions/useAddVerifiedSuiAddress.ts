// useAddVerifiedSuiAddress
//
// Sui counterpart to `useAddVerifiedSolanaAddress`. Drives the
// challenge -> signPersonalMessage -> verify round-trip through
// @mysten/dapp-kit. The user picks Slush / Suiet / Sui Wallet (or any
// other dapp-kit-detected wallet) before triggering this hook.

import { useCallback, useEffect, useRef, useState } from "react";
import { useSignPersonalMessage } from "@mysten/dapp-kit";
import {
  AdditionalSuiApiError,
  requestAdditionalSuiChallenge,
  verifyAdditionalSuiChallenge,
  type SuiVerifyResponse,
} from "@/services/additionalSuiApi";
import { refreshAndSaveUserProfile } from "@/features/auth/services/userProfileService";
import { useUserStore } from "@/store/userStore";
import { useSuiWalletAdapter } from "../useSuiWalletAdapter";

export type SuiAddPhase =
  | "idle"
  | "connecting"
  | "signing"
  | "verifying"
  | "done"
  | "error";

export interface UseAddVerifiedSuiAddressApi {
  phase: SuiAddPhase;
  errorMessage: string | null;
  installed: string[];
  reset: () => void;
  /**
   * Run the full add flow against the picked wallet. `appId` is optional;
   * when present, the server-side verify ALSO sets `appBindings[appId]`
   * to the newly verified address atomically.
   */
  add: (walletName: string, appId?: string) => Promise<SuiVerifyResponse | null>;
}

export function useAddVerifiedSuiAddress(): UseAddVerifiedSuiAddressApi {
  const [phase, setPhase] = useState<SuiAddPhase>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const inFlight = useRef(false);

  const { installed, connect, disconnect } = useSuiWalletAdapter();
  const { mutateAsync: signPersonalMessageAsync } = useSignPersonalMessage();

  // Latest signer captured by `add()`; the rest of the flow only references
  // the ref so the message-signing closure doesn't go stale across renders.
  const signerRef = useRef(signPersonalMessageAsync);
  useEffect(() => {
    signerRef.current = signPersonalMessageAsync;
  }, [signPersonalMessageAsync]);

  const reset = useCallback(() => {
    setPhase("idle");
    setErrorMessage(null);
  }, []);

  const add = useCallback(
    async (walletName: string, appId?: string): Promise<SuiVerifyResponse | null> => {
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

        // 0) Force a clean reconnect. dapp-kit caches the most recent
        // connection; without disconnecting first, `connect()` silently
        // returns the previously chosen wallet/account and the user never
        // sees the picker. Mirrors the Solana hook's defense.
        try {
          await disconnect();
        } catch {
          /* ignore -- best effort */
        }

        const address = await connect(walletName);
        if (!address) {
          throw new AdditionalSuiApiError(
            "Wallet connection failed or was cancelled.",
          );
        }
        const canonical = address.toLowerCase();

        // 1) Local pre-check: dapp-kit may auto-resolve with a previously
        // trusted account; if that account is already linked, fail fast
        // with a message that names the offending address so the user can
        // spot it in the extension UI and switch.
        const sui = useUserStore.getState().user?.linkedAccounts?.sui as
          | {
              walletAddress?: string;
              additionalAddresses?: Array<{ walletAddress: string }>;
              manualEntry?: boolean;
            }
          | undefined;
        const linked = new Set<string>();
        if (sui && sui.manualEntry !== true) {
          if (sui.walletAddress) linked.add(sui.walletAddress.toLowerCase());
          for (const e of sui.additionalAddresses ?? []) {
            if (e?.walletAddress) linked.add(e.walletAddress.toLowerCase());
          }
        }
        if (linked.has(canonical)) {
          const short = `${canonical.slice(0, 6)}…${canonical.slice(-4)}`;
          throw new AdditionalSuiApiError(
            `${walletName} returned ${short}, which is already linked. Open the extension, switch to a different account, then click Add again.`,
          );
        }

        // 2) Server issues nonce + message bound to (identityId, address, appId).
        const challenge = await requestAdditionalSuiChallenge(
          canonical,
          cognitoToken,
          appId,
        );

        // 3) signPersonalMessage on the UTF-8 bytes of `challenge.message`.
        // The Sui personal-message intent prefix is added by the wallet.
        setPhase("signing");
        const messageBytes = new TextEncoder().encode(challenge.message);
        const signed = await signerRef.current({ message: messageBytes });

        // 4) Verify. The server recovers the signer address from the
        // signature bytes and asserts equality with `canonical`.
        setPhase("verifying");
        const verified = await verifyAdditionalSuiChallenge(
          {
            signature: signed.signature,
            nonce: challenge.nonce,
          },
          cognitoToken,
        );

        await refreshAndSaveUserProfile(identityId);

        setPhase("done");
        return verified;
      } catch (err) {
        const rawMsg =
          err instanceof AdditionalSuiApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Failed to add Sui wallet.";
        // Treat explicit user cancellation as a silent return.
        if (/reject|denied|cancel|user refused/i.test(rawMsg)) {
          setPhase("idle");
          setErrorMessage(null);
          return null;
        }
        const msg = /already verified|already linked/i.test(rawMsg)
          ? "That account is already linked. Open your wallet extension, switch to a different account, and try again."
          : rawMsg;
        setPhase("error");
        setErrorMessage(msg);
        return null;
      } finally {
        // Leave the wallet disconnected so the next add() reliably
        // re-prompts instead of silently reusing the same account.
        try {
          await disconnect();
        } catch {
          /* ignore */
        }
        inFlight.current = false;
      }
    },
    [connect, disconnect],
  );

  return { phase, errorMessage, installed, reset, add };
}
