/**
 * useNFTGate - Checks if the connected wallet owns a valid BetaAccessNFT.
 *
 * When BARAM_CONFIG.nftGateEnabled is false, always grants access.
 * Uses suiClient.getOwnedObjects with StructType filter to find NFTs,
 * then validates expiry client-side.
 *
 * NOTE: This is a UX/community gate for beta testing, NOT a security boundary.
 * The real access control is the NUSDC escrow payment in baram.move.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { suiClient } from '@/config/client';
import { BARAM_CONFIG } from '@/config/network';

export interface BetaAccessNFT {
  id: string;
  issuedAt: number;
  expiresAt: number;
  remainingUses: number;
  originalUses: number;
}

export interface UseNFTGateReturn {
  hasAccess: boolean;
  nft: BetaAccessNFT | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useNFTGate(walletAddress: string | null): UseNFTGateReturn {
  const [nft, setNft] = useState<BetaAccessNFT | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const nftGateEnabled = BARAM_CONFIG.nftGateEnabled;

  const checkAccess = useCallback(async () => {
    if (!nftGateEnabled || !walletAddress) {
      setNft(null);
      setIsLoading(false);
      return;
    }

    const currentRequestId = ++requestIdRef.current;
    setIsLoading(true);
    setError(null);

    try {
      const nftType = `${BARAM_CONFIG.packageId}::beta_access::BetaAccessNFT`;
      let cursor: string | null | undefined = undefined;
      const now = Date.now();

      // Paginate through all owned objects of this type
      do {
        const result = await suiClient.getOwnedObjects({
          owner: walletAddress,
          filter: { StructType: nftType },
          options: { showContent: true },
          cursor: cursor ?? undefined,
        });

        // Stale request guard
        if (requestIdRef.current !== currentRequestId) return;

        for (const obj of result.data) {
          if (!obj.data?.content || obj.data.content.dataType !== 'moveObject') continue;

          const fields = obj.data.content.fields as Record<string, string>;
          const expiresAt = Number(fields.expires_at || 0);
          const remainingUses = Number(fields.remaining_uses || 0);
          const originalUses = Number(fields.original_uses || 0);

          const notExpired = expiresAt === 0 || now < expiresAt;
          // originalUses === 0 means unlimited; otherwise check remainingUses > 0
          const hasUses = originalUses === 0 || remainingUses > 0;

          if (notExpired && hasUses) {
            setNft({
              id: obj.data.objectId,
              issuedAt: Number(fields.issued_at || 0),
              expiresAt,
              remainingUses,
              originalUses,
            });
            setIsLoading(false);
            return;
          }
        }

        cursor = result.hasNextPage ? result.nextCursor : null;
      } while (cursor);

      // No valid NFT found
      if (requestIdRef.current === currentRequestId) {
        setNft(null);
      }
    } catch (err) {
      if (requestIdRef.current !== currentRequestId) return;
      setError(err instanceof Error ? err.message : 'Failed to check beta access');
    } finally {
      if (requestIdRef.current === currentRequestId) {
        setIsLoading(false);
      }
    }
  }, [walletAddress, nftGateEnabled]);

  useEffect(() => {
    checkAccess();
  }, [checkAccess]);

  return {
    hasAccess: !nftGateEnabled || nft !== null,
    nft,
    isLoading: nftGateEnabled && isLoading,
    error,
    refresh: checkAccess,
  };
}
