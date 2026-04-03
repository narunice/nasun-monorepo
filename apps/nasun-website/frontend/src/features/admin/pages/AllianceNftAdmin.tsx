import { useState, useEffect, useCallback } from "react";
import { useSuiClientQuery } from "@mysten/dapp-kit";
import { AdminLayout } from "../components/AdminLayout";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { PageTitle } from "@/components/ui/PageTitle";
import { OuterBox } from "@/components/ui/OuterBox";
import { StatCard } from "../components/StatCard";
import { ALLIANCE_PREVIEW_IMAGES, ALLIANCE_NAMES } from "@/constants/alliance";
import { suiClient } from "@/lib/sui-client";

const ALLIANCE_REGISTRY_ID = "0xed64e2d9661dde6f6f6fb303680c4ab7c95f9070c41e967b746299610ca7b00f";
const ALLIANCE_PACKAGE_ID = "0x2f2f9e1a1683462af44d3da1b5148f8671d446dbb913d5348efaf2f08819ba5b";
const EVENT_TYPE = `${ALLIANCE_PACKAGE_ID}::alliance_nft::AllianceMinted`;

interface RegistryFields {
  total_minted: string;
  max_supply: string;
}

function useAllianceImageCounts() {
  const [counts, setCounts] = useState<number[]>([0, 0, 0, 0]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCounts = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = [0, 0, 0, 0];
      let cursor: { txDigest: string; eventSeq: string } | null | undefined = null;

      while (true) {
        const page = await suiClient.queryEvents({
          query: { MoveEventType: EVENT_TYPE },
          cursor: cursor ?? undefined,
          limit: 50,
          order: "ascending",
        });

        for (const event of page.data) {
          const idx = Number(
            (event.parsedJson as { image_index: string }).image_index,
          );
          if (idx >= 0 && idx <= 3) result[idx]++;
        }

        if (!page.hasNextPage) break;
        cursor = page.nextCursor;
      }

      setCounts(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch events");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCounts();
  }, [fetchCounts]);

  return { counts, isLoading, error, refetch: fetchCounts };
}

export function AllianceNftAdmin() {
  const { data, isPending, error, refetch } = useSuiClientQuery("getObject", {
    id: ALLIANCE_REGISTRY_ID,
    options: { showContent: true },
  }, {
    refetchInterval: 30_000,
  });

  const {
    counts: imageCounts,
    isLoading: isCountsLoading,
    error: countsError,
    refetch: refetchCounts,
  } = useAllianceImageCounts();

  const fields = data?.data?.content?.dataType === "moveObject"
    ? (data.data.content.fields as RegistryFields)
    : null;

  const totalMinted = fields ? Number(fields.total_minted) : 0;
  const maxSupply = fields ? Number(fields.max_supply) : 0;
  const mintProgress = maxSupply > 0 ? (totalMinted / maxSupply) * 100 : 0;
  const remaining = maxSupply - totalMinted;
  const imageTotal = imageCounts.reduce((a, b) => a + b, 0);

  const handleRefreshAll = () => {
    refetch();
    refetchCounts();
  };

  return (
    <AdminLayout>
      <SectionLayout className="!max-w-6xl !pt-0">
        <div className="mb-10">
          <PageTitle as="h3" align="left">
            Alliance NFT
          </PageTitle>
          <p className="text-nasun-white/80 max-w-2xl -mt-6">
            Monitor Alliance NFT minting progress in real-time. Data is fetched directly from the
            on-chain Registry object and refreshes every 30 seconds.
          </p>
        </div>

        {(error || countsError) && (
          <OuterBox color="w5" padding="md" className="w-full mb-6">
            <p className="text-red-400">
              {error ? `Registry error: ${error.message}` : `Event query error: ${countsError}`}
            </p>
          </OuterBox>
        )}

        <div className="flex flex-col gap-8 w-full">
          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Total Minted"
              value={isPending ? "..." : totalMinted.toLocaleString()}
              sub="Alliance NFTs issued"
            />
            <StatCard
              label="Max Supply"
              value={isPending ? "..." : maxSupply.toLocaleString()}
              sub="Hard cap"
            />
            <StatCard
              label="Remaining"
              value={isPending ? "..." : remaining.toLocaleString()}
              sub="Available to mint"
            />
            <StatCard
              label="Progress"
              value={isPending ? "..." : `${mintProgress.toFixed(1)}%`}
              sub={`${totalMinted} / ${maxSupply}`}
            />
          </div>

          {/* Progress Bar */}
          <OuterBox color="w2" padding="md">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-nasun-white font-medium text-lg">Minting Progress</h3>
              <button
                onClick={handleRefreshAll}
                disabled={isPending || isCountsLoading}
                className="text-sm text-nasun-c4 hover:text-nasun-c4/80 transition-colors disabled:opacity-50"
              >
                {isPending || isCountsLoading ? "Loading..." : "Refresh All"}
              </button>
            </div>
            <div className="w-full bg-nasun-dark-700/70 rounded-full h-6 overflow-hidden border border-nasun-dark-500/45">
              <div
                className="h-full bg-gradient-to-r from-nasun-c4 to-nasun-c3 rounded-full transition-all duration-700 ease-out flex items-center justify-end pr-2"
                style={{ width: `${Math.max(mintProgress, 2)}%` }}
              >
                {mintProgress >= 8 && (
                  <span className="text-xs font-medium text-nasun-white">
                    {mintProgress.toFixed(1)}%
                  </span>
                )}
              </div>
            </div>
            <div className="flex justify-between mt-2 text-xs text-nasun-white/60">
              <span>0</span>
              <span>{(maxSupply / 4).toLocaleString()}</span>
              <span>{(maxSupply / 2).toLocaleString()}</span>
              <span>{((maxSupply * 3) / 4).toLocaleString()}</span>
              <span>{maxSupply.toLocaleString()}</span>
            </div>
          </OuterBox>

          {/* Per-Image Breakdown */}
          <OuterBox color="w1" padding="md">
            <h3 className="text-nasun-white font-medium text-lg mb-4">
              Mints by Character
              {isCountsLoading && (
                <span className="text-sm font-normal text-nasun-white/50 ml-2">
                  (scanning events...)
                </span>
              )}
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {ALLIANCE_PREVIEW_IMAGES.map((img, i) => {
                const count = imageCounts[i];
                const pct = imageTotal > 0 ? (count / imageTotal) * 100 : 0;
                return (
                  <div key={i} className="flex flex-col items-center gap-3">
                    <div className="w-full aspect-square rounded-lg overflow-hidden border border-nasun-white/10 relative">
                      <img
                        src={img}
                        alt={ALLIANCE_NAMES[i]}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-2 py-1.5 text-center">
                        <span className="text-nasun-white font-bold text-lg">
                          {isCountsLoading ? "..." : count.toLocaleString()}
                        </span>
                      </div>
                    </div>
                    <div className="text-center w-full">
                      <p className="text-sm text-nasun-white/80 font-medium">{ALLIANCE_NAMES[i]}</p>
                      <p className="text-xs text-nasun-white/50">
                        {isCountsLoading ? "..." : `${pct.toFixed(1)}%`}
                      </p>
                    </div>
                    {/* Mini bar */}
                    <div className="w-full bg-nasun-dark-700/70 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="h-full bg-nasun-c4 rounded-full transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </OuterBox>

          {/* Registry Info */}
          <OuterBox color="w3" padding="md">
            <h3 className="text-nasun-white font-medium text-lg mb-3">On-chain Registry</h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-nasun-white/60 w-24">Object ID:</span>
                <a
                  href={`https://explorer.nasun.io/devnet/object/${ALLIANCE_REGISTRY_ID}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-nasun-c4 hover:underline font-mono text-xs break-all"
                >
                  {ALLIANCE_REGISTRY_ID}
                </a>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-nasun-white/60 w-24">Auto-refresh:</span>
                <span className="text-nasun-white/80">Every 30 seconds (registry)</span>
              </div>
            </div>
          </OuterBox>
        </div>
      </SectionLayout>
    </AdminLayout>
  );
}
