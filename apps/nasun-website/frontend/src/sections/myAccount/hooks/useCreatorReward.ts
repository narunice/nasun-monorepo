import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getCreatorRewardStatus,
  submitCreatorReward,
  type CreatorRewardStatus,
  type SubmitRewardBody,
} from "@/features/leaderboard-v3/services/creatorRewardApi";

const keys = {
  status: (token: string | undefined) =>
    ["creator-reward", "status", token ?? "anon"] as const,
};

interface UseCreatorRewardResult {
  status: CreatorRewardStatus | undefined;
  isLoading: boolean;
  isError: boolean;
  isSubmitting: boolean;
  submitError: string | null;
  submit: (body: SubmitRewardBody) => Promise<void>;
  refetch: () => Promise<unknown>;
}

export function useCreatorReward(
  cognitoToken: string | undefined,
): UseCreatorRewardResult {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: keys.status(cognitoToken),
    queryFn: () => getCreatorRewardStatus(cognitoToken!),
    enabled: !!cognitoToken,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const mutation = useMutation({
    mutationFn: (body: SubmitRewardBody) => submitCreatorReward(cognitoToken!, body),
    onSuccess: (_data, variables) => {
      queryClient.setQueryData<CreatorRewardStatus>(
        keys.status(cognitoToken),
        (prev) =>
          prev
            ? { ...prev, alreadySubmitted: true, rewardType: variables.rewardType }
            : prev,
      );
    },
  });

  return {
    status: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    isSubmitting: mutation.isPending,
    submitError: mutation.error?.message ?? null,
    submit: mutation.mutateAsync,
    refetch: query.refetch,
  };
}
