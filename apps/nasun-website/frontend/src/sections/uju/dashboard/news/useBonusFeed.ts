import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/features/auth";
import {
  getBonusFeed,
  type BonusFeedResponse,
} from "@/services/ecosystemScoreApi";

const MAX_SLIDES = 4;

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

  const query = useQuery({
    queryKey: ["uju", "bonus-feed", identityId],
    queryFn: () => getBonusFeed(identityId!, MAX_SLIDES, cognitoToken),
    enabled: !!identityId && !!cognitoToken,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  return {
    isLoading: query.isPending && !!identityId && !!cognitoToken,
    isError: query.isError,
    data: query.data
      ? { ...query.data, data: query.data.data.slice(0, MAX_SLIDES) }
      : null,
  };
}
