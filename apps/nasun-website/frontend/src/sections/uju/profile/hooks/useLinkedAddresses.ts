import { useCallback, useState } from "react";
import { toast } from "react-toastify";
import { useQueryClient } from "@tanstack/react-query";
import type { EcosystemProfile } from "@nasun/profile-core";
import { useUserStore } from "@/store/userStore";
import { useMyProfile } from "@/features/profile/useMyProfile";
import {
  linkPasteAddress,
  UserProfileApiError,
  type LinkPasteChain,
} from "@/services/userProfileApi";

/**
 * Hook for managing paste-based external chain wallet addresses
 * (SUI / Solana / Ethereum). These are display-only links — no on-chain
 * actions originate from uju on these networks.
 *
 * Cross-account collisions return HTTP 409 from the PATCH handler; the
 * catch branch surfaces the server's `ADDRESS_ALREADY_LINKED` message.
 */
export function useLinkedAddresses() {
  const user = useUserStore((s) => s.user);
  const { data: profile } = useMyProfile();
  const queryClient = useQueryClient();
  const [pendingChain, setPendingChain] = useState<LinkPasteChain | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sui = profile?.linkedSuiAddress ?? null;
  const solana = profile?.linkedSolanaAddress ?? null;
  const ethereum = profile?.linkedEthereumAddress ?? null;

  const link = useCallback(
    async (chain: LinkPasteChain, address: string): Promise<boolean> => {
      const token = user?.cognitoToken;
      const identityId = user?.identityId;
      if (!token || !identityId) {
        setError("Sign in first.");
        return false;
      }
      setError(null);
      setPendingChain(chain);
      try {
        const updated = await linkPasteAddress(token, chain, address);
        // Update the cached profile so subscribers re-render immediately.
        queryClient.setQueryData(
          ["ecosystem", "profile", "me", identityId],
          updated as EcosystemProfile,
        );
        // Backend now rejects collisions with 409 ADDRESS_ALREADY_LINKED, so
        // a successful response is unambiguously a fresh link. The legacy
        // `displaced` flag is no longer set; the catch branch surfaces the
        // 409 message instead.
        toast.success("Address linked.");
        return true;
      } catch (e) {
        const msg = e instanceof UserProfileApiError
          ? e.message
          : "Failed to link address.";
        setError(msg);
        toast.error(msg);
        return false;
      } finally {
        setPendingChain(null);
      }
    },
    [user?.cognitoToken, user?.identityId, queryClient],
  );

  const unlink = useCallback(
    async (chain: LinkPasteChain): Promise<boolean> => {
      const token = user?.cognitoToken;
      const identityId = user?.identityId;
      if (!token || !identityId) return false;
      setPendingChain(chain);
      try {
        const updated = await linkPasteAddress(token, chain, null);
        queryClient.setQueryData(
          ["ecosystem", "profile", "me", identityId],
          updated as EcosystemProfile,
        );
        toast.success("Address removed.");
        return true;
      } catch (e) {
        const msg = e instanceof UserProfileApiError
          ? e.message
          : "Failed to remove address.";
        toast.error(msg);
        return false;
      } finally {
        setPendingChain(null);
      }
    },
    [user?.cognitoToken, user?.identityId, queryClient],
  );

  return {
    addresses: { sui, solana, ethereum },
    link,
    unlink,
    pendingChain,
    error,
    isAuthenticated: !!user?.cognitoToken && !!user?.identityId,
  };
}
