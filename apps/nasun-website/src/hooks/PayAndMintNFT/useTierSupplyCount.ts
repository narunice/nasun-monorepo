// <MONOREPO>/nasun-website/frontend/src/hooks/PayAndMintNFT/useTierSupplyCount.ts
// useTierSupplyCount.ts
import { useState, useEffect } from "react";

interface SupplyResponse {
  tier: string;
  currentCount: number;
}

export const useTierSupplyCount = (tier: string) => {
  const [currentCount, setCurrentCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchSupply = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const base = import.meta.env.VITE_SUPPLY_COUNT_API_ENDPOINT;
        if (!base) throw new Error("Supply‐count endpoint is not configured");

        const url = `${base}/getSupplyCount/TIER${encodeURIComponent(tier)}`;

        const res = await fetch(url, {
          mode: "cors",
          headers: {
            Accept: "application/json",
          },
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }

        // 강제 문자열 파싱 → JSON
        const text = await res.text();
        const data: SupplyResponse = JSON.parse(text);
        console.log("🎯 API response:", data);
        console.log("🧮 Parsed currentCount:", data.currentCount);

        if (!cancelled) {
          setCurrentCount(data.currentCount ?? 0);
        }
      } catch (e: unknown) {
        console.error("Supply count fetch error:", e);

        if (!cancelled) {
          const message = e instanceof Error ? e.message : "Unknown error occurred";
          setError(message);
          setCurrentCount(0);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    fetchSupply();
    return () => {
      cancelled = true;
    };
  }, [tier]);

  return { currentCount, isLoading, error };
};
