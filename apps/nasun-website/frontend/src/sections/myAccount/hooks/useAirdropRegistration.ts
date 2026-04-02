/**
 * useAirdropRegistration Hook
 *
 * Fetches and manages April 16th Airdrop registration status.
 */

import { useState, useEffect, useCallback } from "react";
import {
  getAirdropStatus,
  registerForAirdrop,
  type AirdropStatus,
} from "@/services/airdropApi";

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
  const [status, setStatus] = useState<AirdropStatus>("not_applied");
  const [isLoading, setIsLoading] = useState(true);
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!cognitoToken) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const res = await getAirdropStatus(cognitoToken);
      setStatus(res.status);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, [cognitoToken]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const register = useCallback(async () => {
    if (!cognitoToken) return;

    try {
      setIsRegistering(true);
      setError(null);
      const res = await registerForAirdrop(cognitoToken);
      setStatus(res.status);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsRegistering(false);
    }
  }, [cognitoToken]);

  return { status, isLoading, isRegistering, error, register };
}
