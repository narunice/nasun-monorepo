// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { createElement } from "react";

const mockUseEcosystemScore = vi.fn();
vi.mock("../useEcosystemScore", () => ({
  useEcosystemScore: (...args: unknown[]) => mockUseEcosystemScore(...args),
  ecosystemScoreKeys: {
    detail: (id: string | undefined) => ["ecosystem", "score", id] as const,
  },
}));

import { useDailyMissions } from "../useDailyMissions";

function makeWrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
}

describe("useDailyMissions (backend-driven)", () => {
  beforeEach(() => {
    mockUseEcosystemScore.mockReset();
  });

  it("returns empty set when score has no todayCategories", () => {
    mockUseEcosystemScore.mockReturnValue({ score: null, isLoading: false });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useDailyMissions("id-1"), {
      wrapper: makeWrapper(client),
    });
    expect(result.current.completedMissions.size).toBe(0);
    expect(result.current.isLoading).toBe(false);
  });

  it("maps known todayCategories to completed missions", () => {
    mockUseEcosystemScore.mockReturnValue({
      score: {
        todayCategories: [
          "gostop-lottery",
          "pado-dex",
          "wallet-transfer",
          "ecosystem-bonus-creator-posts",
          "staking-daily",
        ],
      },
      isLoading: false,
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useDailyMissions("id-1"), {
      wrapper: makeWrapper(client),
    });
    const missions = result.current.completedMissions;
    expect(missions.has("gostop-lottery")).toBe(true);
    expect(missions.has("pado-dex")).toBe(true);
    expect(missions.has("wallet-transfer")).toBe(true);
    expect(missions.has("ecosystem-bonus-creator-posts")).toBe(false);
    expect(missions.has("staking-daily")).toBe(false);
    expect(missions.size).toBe(3);
  });

  it("propagates loading state from useEcosystemScore", () => {
    mockUseEcosystemScore.mockReturnValue({ score: null, isLoading: true });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useDailyMissions("id-1"), {
      wrapper: makeWrapper(client),
    });
    expect(result.current.isLoading).toBe(true);
  });

  it("refetch invalidates the shared ecosystem score query", async () => {
    mockUseEcosystemScore.mockReturnValue({ score: null, isLoading: false });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useDailyMissions("id-1"), {
      wrapper: makeWrapper(client),
    });
    await result.current.refetch();
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["ecosystem", "score", "id-1"],
    });
  });
});
