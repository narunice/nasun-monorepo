/**
 * useHiddenProposals Hook
 *
 * Manages hidden proposals state using DynamoDB via Admin API.
 * Admin can hide/unhide proposals, which affects public page visibility.
 */

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/features/auth/hooks/useAuth";
import {
  getHiddenProposals,
  hideProposal as apiHideProposal,
  unhideProposal as apiUnhideProposal,
} from "../services/adminApi";

interface UseHiddenProposalsReturn {
  hiddenIds: Set<string>;
  isHidden: (id: string) => boolean;
  hide: (id: string) => Promise<void>;
  unhide: (id: string) => Promise<void>;
  toggle: (id: string) => Promise<void>;
  hiddenCount: number;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export const useHiddenProposals = (): UseHiddenProposalsReturn => {
  const { user } = useAuth();
  const identityId = user?.identityId;
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHiddenProposals = useCallback(async () => {
    if (!identityId) {
      setHiddenIds(new Set());
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const ids = await getHiddenProposals(identityId);
      setHiddenIds(new Set(ids));
    } catch (err) {
      console.error("[useHiddenProposals] Failed to fetch:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch hidden proposals");
    } finally {
      setIsLoading(false);
    }
  }, [identityId]);

  useEffect(() => {
    fetchHiddenProposals();
  }, [fetchHiddenProposals]);

  const isHidden = useCallback(
    (id: string) => hiddenIds.has(id),
    [hiddenIds]
  );

  const hide = useCallback(async (id: string) => {
    if (!identityId) {
      throw new Error("Not authenticated");
    }

    try {
      await apiHideProposal(identityId, id);
      setHiddenIds((prev) => new Set([...prev, id]));
    } catch (err) {
      console.error("[useHiddenProposals] Failed to hide:", err);
      throw err;
    }
  }, [identityId]);

  const unhide = useCallback(async (id: string) => {
    if (!identityId) {
      throw new Error("Not authenticated");
    }

    try {
      await apiUnhideProposal(identityId, id);
      setHiddenIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } catch (err) {
      console.error("[useHiddenProposals] Failed to unhide:", err);
      throw err;
    }
  }, [identityId]);

  const toggle = useCallback(async (id: string) => {
    if (hiddenIds.has(id)) {
      await unhide(id);
    } else {
      await hide(id);
    }
  }, [hiddenIds, hide, unhide]);

  return {
    hiddenIds,
    isHidden,
    hide,
    unhide,
    toggle,
    hiddenCount: hiddenIds.size,
    isLoading,
    error,
    refetch: fetchHiddenProposals,
  };
};

export default useHiddenProposals;
