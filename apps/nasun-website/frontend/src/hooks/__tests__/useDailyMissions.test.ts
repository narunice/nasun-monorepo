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

  /**
   * The query cache is persisted to localStorage for 24h, so a user returning
   * across a UTC midnight restores a snapshot whose `todayCategories` describe
   * YESTERDAY. Serving those as today's completions ticks the checklist for
   * work not yet done and, because useNotificationDetector absorbs everything
   * complete on its first non-loading pass, permanently suppresses today's
   * "Mission Complete" for exactly those missions.
   */
  it("ignores todayCategories from a snapshot cached on a previous UTC day", () => {
    const yesterday = Date.now() - 24 * 60 * 60 * 1000;
    mockUseEcosystemScore.mockReturnValue({
      score: { todayCategories: ["gostop-lottery", "pado-dex"] },
      isLoading: false,
      dataUpdatedAt: yesterday,
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useDailyMissions("id-1"), {
      wrapper: makeWrapper(client),
    });
    expect(result.current.completedMissions.size).toBe(0);
  });

  it("keeps todayCategories from a snapshot cached on the current UTC day", () => {
    // Pin the clock: seeding dataUpdatedAt from the real one while the hook
    // reads Date.now() again makes this flake for runs that straddle midnight.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-08T12:00:00.000Z"));
    mockUseEcosystemScore.mockReturnValue({
      score: { todayCategories: ["gostop-lottery", "pado-dex"] },
      isLoading: false,
      dataUpdatedAt: Date.parse("2026-08-08T00:30:00.000Z"),
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useDailyMissions("id-1"), {
      wrapper: makeWrapper(client),
    });
    expect(result.current.completedMissions.size).toBe(2);
    vi.useRealTimers();
  });

  // The same UTC-day guard has to hold on the pts-today side, or the checklist
  // withholds while the points card still lists yesterday -- the drift these
  // two exist to prevent.
  it("withholds a stale day across a UTC midnight boundary", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-08T00:05:00.000Z"));
    mockUseEcosystemScore.mockReturnValue({
      score: { todayCategories: ["gostop-lottery"] },
      isLoading: false,
      dataUpdatedAt: Date.parse("2026-08-07T23:55:00.000Z"),
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useDailyMissions("id-1"), {
      wrapper: makeWrapper(client),
    });
    expect(result.current.completedMissions.size).toBe(0);
    vi.useRealTimers();
  });
});
