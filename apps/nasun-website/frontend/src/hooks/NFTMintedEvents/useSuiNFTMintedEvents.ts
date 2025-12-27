// /hooks/NFTMintedEvents/useSuiNFTMintedEvents.ts

import { useCallback, useEffect, useState } from "react";
import type { SuiClient } from "@mysten/sui/client";
import { NFTMintedEvent, NFTTierDisplayNames } from "../../types/foundersNFTs.d";

export const useSuiNFTMintedEvents = (packageId: string, client: SuiClient, txId?: string) => {
  const [events, setEvents] = useState<NFTMintedEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchEvents = useCallback(async () => {
    if (!txId) {
      setEvents([]);
      return;
    }
    setIsLoading(true);
    setError(null);

    try {
      // queryEvents로 Transaction 단위 이벤트만 가져오기
      const result = await client.queryEvents({
        query: { Transaction: txId },
        order: "ascending",
        limit: 50,
      });

      // NFTMinted 이벤트만 필터링
      const minted = result.data
        .filter((e) => e.type === `${packageId}::founders_nft::NFTMinted`)
        .map((e) => {
          const parsed = e.parsedJson as {
            object_id: string;
            tier: number;
            minter: string;
            count: string;
            payment_amount: string;
            image_url: string;
          };

          return {
            txId: e.id.txDigest,
            objectId: parsed.object_id,
            tier: parsed.tier,
            minter: parsed.minter,
            count: Number(parsed.count),
            paymentAmount: parsed.payment_amount,
            imageUrl: parsed.image_url,
          } as NFTMintedEvent;
        });

      setEvents(minted);
    } catch (err) {
      console.error("useSuiNFTMintedEvents error:", err);
      setError(err as Error);
      setEvents([]);
    } finally {
      setIsLoading(false);
    }
  }, [client, packageId, txId]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const getTierDisplayName = (tier: number): string =>
    NFTTierDisplayNames[`${tier}` as keyof typeof NFTTierDisplayNames] || `${tier}`;

  return { events, isLoading, error, getTierDisplayName, refetch: fetchEvents };
};
