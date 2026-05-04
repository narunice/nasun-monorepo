import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/features/auth";
import {
  getBonusFeed,
  type BonusFeedResponse,
} from "@/services/ecosystemScoreApi";
import { MOCK_BONUS_FEED } from "./mockBonusFeed";

const MAX_SLIDES = 4;

// Demo gate: in DEV builds only, the admin account has no real bonus history,
// so we synthesize a celebration feed for screen-recording. Never active in
// production because the import.meta.env.DEV check is statically false there
// and tree-shaken away.
function shouldUseMockFeed(
  email: string | undefined,
  role: string | undefined,
): boolean {
  if (!import.meta.env.DEV) return false;
  return email === "admin@nasun.io" || role === "ADMIN";
}

// Fetches the most recent bonus awards for the celebration carousel.
// `data` is sliced to MAX_SLIDES; cumulativeByCategory is preserved as-is so
// individual slides can render their per-category running totals.
export function useBonusFeed(): {
  isLoading: boolean;
  isError: boolean;
  data: BonusFeedResponse | null;
} {
  const { user } = useAuth();
  const identityId = user?.identityId;
  const cognitoToken = user?.cognitoToken;
  const useMock = shouldUseMockFeed(user?.email, user?.role);

  const query = useQuery({
    queryKey: ["uju", "bonus-feed", identityId],
    queryFn: () => getBonusFeed(identityId!, MAX_SLIDES, cognitoToken),
    enabled: !useMock && !!identityId && !!cognitoToken,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  // useMemo must be called unconditionally (Rules of Hooks). When useMock is
  // true this memo is computed but its result is not used.
  const memoizedData = useMemo(() => {
    if (!query.data) return null;
    return { ...query.data, data: query.data.data.slice(0, MAX_SLIDES) };
  }, [query.data]);

  if (useMock) {
    return {
      isLoading: false,
      isError: false,
      data: {
        ...MOCK_BONUS_FEED,
        data: MOCK_BONUS_FEED.data.slice(0, MAX_SLIDES),
      },
    };
  }

  return {
    isLoading: query.isPending && !!identityId && !!cognitoToken,
    isError: query.isError,
    data: memoizedData,
  };
}
