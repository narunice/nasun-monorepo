import { useQuery } from "@tanstack/react-query";
import type { UjuFeedResponse } from "./types";

const FEED_API_URL = import.meta.env.VITE_PADO_NEWS_API_URL as string | undefined;

async function fetchUjuFeed(limit: number): Promise<UjuFeedResponse> {
  if (!FEED_API_URL) throw new Error("VITE_PADO_NEWS_API_URL is not configured");
  const url = `${FEED_API_URL}?audience=uju&limit=${limit}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Uju feed error: ${res.status}`);
  return res.json();
}

export function useUjuFeed(limit = 20) {
  return useQuery({
    queryKey: ["ujuFeed", limit],
    queryFn: () => fetchUjuFeed(limit),
    enabled: !!FEED_API_URL,
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
    retry: 1,
  });
}
