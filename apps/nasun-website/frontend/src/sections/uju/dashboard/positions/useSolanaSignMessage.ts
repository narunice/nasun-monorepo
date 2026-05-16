// useSolanaSignMessage
//
// Wraps Phantom / Solflare `signMessage(message, "utf8")`. Both wallets
// follow the de-facto Solana Wallet Standard: input is the UTF-8 byte
// array of the challenge string, output is { signature: Uint8Array,
// publicKey }. We bs58-encode the signature so the Lambda can decode it
// with the same library it uses for verification.
//
// The signing wallet does NOT have to be the currently "connected"
// Solana adapter -- we re-connect against the requested wallet right
// before signing so the user can pick a different account in the
// extension popup if they want.

import { useCallback } from "react";
import bs58 from "bs58";
import type { SolWalletName } from "../useSolanaWalletAdapter";

function getAdapter(name: SolWalletName): SolanaWalletAdapter | undefined {
  if (name === "phantom") {
    const adapter = window.phantom?.solana;
    return adapter?.isPhantom ? adapter : undefined;
  }
  const adapter = window.solflare;
  return adapter?.isSolflare ? adapter : undefined;
}

export interface SolanaSignedMessageResult {
  /** base58-encoded 64-byte Ed25519 signature */
  signature: string;
  /** base58 public key returned by the wallet */
  publicKey: string;
}

export class SolanaSignMessageError extends Error {
  constructor(
    message: string,
    public code?: "no-wallet" | "no-pubkey" | "rejected" | "no-sign-method",
  ) {
    super(message);
    this.name = "SolanaSignMessageError";
  }
}

/**
 * Connect (if needed) + signMessage. Throws SolanaSignMessageError on
 * user rejection or unsupported wallet; otherwise returns the encoded
 * signature + publicKey.
 */
export function useSolanaSignMessage() {
  return useCallback(
    async (
      walletName: SolWalletName,
      message: string,
    ): Promise<SolanaSignedMessageResult> => {
      const adapter = getAdapter(walletName);
      if (!adapter) {
        throw new SolanaSignMessageError(
          `${walletName === "phantom" ? "Phantom" : "Solflare"} not installed`,
          "no-wallet",
        );
      }
      if (typeof adapter.signMessage !== "function") {
        throw new SolanaSignMessageError(
          "This wallet version does not support signMessage",
          "no-sign-method",
        );
      }

      // Ensure the wallet is unlocked + has a public key. `connect()` is
      // idempotent -- Phantom returns the already-connected pubkey when the
      // user has previously approved this origin.
      let pubkey = adapter.publicKey?.toString?.();
      if (!pubkey) {
        try {
          const { publicKey } = await adapter.connect();
          pubkey = publicKey?.toString?.();
        } catch (err) {
          throw new SolanaSignMessageError(
            err instanceof Error ? err.message : "Connection rejected",
            "rejected",
          );
        }
      }
      if (!pubkey) {
        throw new SolanaSignMessageError("Wallet did not expose a public key", "no-pubkey");
      }

      const bytes = new TextEncoder().encode(message);
      let result: { signature: Uint8Array; publicKey?: { toString(): string } };
      try {
        // "utf8" hint is ignored by some wallets but required by older
        // Phantom builds; passing it is always safe.
        result = await adapter.signMessage(bytes, "utf8");
      } catch (err) {
        throw new SolanaSignMessageError(
          err instanceof Error ? err.message : "Signature request rejected",
          "rejected",
        );
      }

      if (!result?.signature || !(result.signature instanceof Uint8Array)) {
        throw new SolanaSignMessageError("Wallet did not return a signature");
      }
      // Some Phantom versions return only `signature` -- fall back to the
      // adapter's pubkey. Either way the publicKey we forward must equal
      // the pubkey we asked the user to verify (server enforces this).
      const signerPubkey = result.publicKey?.toString?.() ?? pubkey;

      return {
        signature: bs58.encode(result.signature),
        publicKey: signerPubkey,
      };
    },
    [],
  );
}
