/**
 * useAirdropRegistration Hook
 *
 * Fetches and manages April 16th Airdrop registration status.
 * Uses React Query for data fetching and mutation.
 */

import { useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getAirdropStatus,
  registerForAirdrop,
  type AirdropStatus,
} from "@/services/airdropApi";

const airdropKeys = {
  all: ["airdrop", "status"] as const,
};

interface UseAirdropRegistrationResult {
  status: AirdropStatus;
  isLoading: boolean;
  isRegistering: boolean;
  error: string | null;
  register: () => Promise<void>;
}

export function useAirdropRegistration(
  cognitoToken: string | undefined,
): UseAirdropRegistrationResult {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: airdropKeys.all,
    queryFn: () => getAirdropStatus(cognitoToken!),
    enabled: !!cognitoToken,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const mutation = useMutation({
    mutationFn: () => registerForAirdrop(cognitoToken!),
    onSuccess: (data) => {
      queryClient.setQueryData(airdropKeys.all, data);
    },
  });

  const register = useCallback(async () => {
    if (!cognitoToken) return;
    try {
      await mutation.mutateAsync();
    } catch {
      // Error is accessible via mutation.error
    }
  }, [cognitoToken, mutation.mutateAsync]);

  return {
    status: query.data?.status ?? "not_applied",
    isLoading: query.isLoading || query.isFetching,
    isRegistering: mutation.isPending,
    error: query.error?.message ?? mutation.error?.message ?? null,
    register,
  };
}
