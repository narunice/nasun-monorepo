import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useUserSearchV3 } from "../useUserSearchV3";
import React from "react";

// Mock API
const mockSearchAccounts = vi.fn();
vi.mock("../../services/leaderboardV3Api", () => ({
  searchAccounts: (...args: unknown[]) => mockSearchAccounts(...args),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useUserSearchV3", () => {
  beforeEach(() => {
    mockSearchAccounts.mockReset();
  });

  // ── Query Normalization ────────────────────────────────────

  it("normalizes query: trim + strip @ + lowercase", async () => {
    mockSearchAccounts.mockResolvedValue({ accounts: [], total: 0 });

    renderHook(
      () =>
        useUserSearchV3({
          query: "  @NaSuN_IO  ",
          seasonId: "s1",
          limit: 5,
        }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(mockSearchAccounts).toHaveBeenCalledWith({
        query: "nasun_io",
        limit: 5,
        seasonId: "s1",
      });
    });
  });

  // ── Enabled Conditions ─────────────────────────────────────

  it("does not fetch when normalized query < 2 chars", () => {
    mockSearchAccounts.mockResolvedValue({ accounts: [], total: 0 });

    renderHook(
      () => useUserSearchV3({ query: "a", enabled: true }),
      { wrapper: createWrapper() }
    );

    expect(mockSearchAccounts).not.toHaveBeenCalled();
  });

  it("does not fetch when enabled=false", () => {
    mockSearchAccounts.mockResolvedValue({ accounts: [], total: 0 });

    renderHook(
      () => useUserSearchV3({ query: "nasun", enabled: false }),
      { wrapper: createWrapper() }
    );

    expect(mockSearchAccounts).not.toHaveBeenCalled();
  });

  it("does not fetch when '@x' normalizes to 1 char", () => {
    mockSearchAccounts.mockResolvedValue({ accounts: [], total: 0 });

    renderHook(
      () => useUserSearchV3({ query: "@x" }),
      { wrapper: createWrapper() }
    );

    expect(mockSearchAccounts).not.toHaveBeenCalled();
  });

  it("does not fetch for whitespace-only query", () => {
    mockSearchAccounts.mockResolvedValue({ accounts: [], total: 0 });

    renderHook(
      () => useUserSearchV3({ query: "   " }),
      { wrapper: createWrapper() }
    );

    expect(mockSearchAccounts).not.toHaveBeenCalled();
  });

  it("does not fetch for '@ ' (@ + space)", () => {
    mockSearchAccounts.mockResolvedValue({ accounts: [], total: 0 });

    renderHook(
      () => useUserSearchV3({ query: "@ " }),
      { wrapper: createWrapper() }
    );

    // "@ " -> trim -> "@" -> strip @ -> "" -> length 0
    expect(mockSearchAccounts).not.toHaveBeenCalled();
  });

  it("fetches when normalized query is exactly 2 chars", async () => {
    mockSearchAccounts.mockResolvedValue({ accounts: [], total: 0 });

    renderHook(
      () => useUserSearchV3({ query: "ab" }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(mockSearchAccounts).toHaveBeenCalledWith(
        expect.objectContaining({ query: "ab" })
      );
    });
  });

  // ── Default Parameters ─────────────────────────────────────

  it("uses default limit of 10 when not specified", async () => {
    mockSearchAccounts.mockResolvedValue({ accounts: [], total: 0 });

    renderHook(
      () => useUserSearchV3({ query: "nasun" }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(mockSearchAccounts).toHaveBeenCalledWith({
        query: "nasun",
        limit: 10,
        seasonId: undefined,
      });
    });
  });

  // ── Query Key Isolation ────────────────────────────────────

  it("uses different cache keys for different seasonIds", async () => {
    mockSearchAccounts.mockResolvedValue({ accounts: [], total: 0 });

    const { rerender } = renderHook(
      ({ seasonId }) => useUserSearchV3({ query: "nasun", seasonId }),
      {
        wrapper: createWrapper(),
        initialProps: { seasonId: "s1" },
      }
    );

    await waitFor(() => {
      expect(mockSearchAccounts).toHaveBeenCalledWith(
        expect.objectContaining({ seasonId: "s1" })
      );
    });

    mockSearchAccounts.mockClear();

    rerender({ seasonId: "s2" });

    await waitFor(() => {
      expect(mockSearchAccounts).toHaveBeenCalledWith(
        expect.objectContaining({ seasonId: "s2" })
      );
    });
  });

  // ── Return Value ───────────────────────────────────────────

  it("returns search results from API", async () => {
    const mockData = {
      accounts: [
        { accountId: "1", username: "test", platform: "twitter", rank: 5 },
      ],
      total: 1,
    };
    mockSearchAccounts.mockResolvedValue(mockData);

    const { result } = renderHook(
      () => useUserSearchV3({ query: "test" }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.data).toEqual(mockData);
    });
  });

  it("returns error state on API failure", async () => {
    mockSearchAccounts.mockRejectedValue(new Error("Server error"));

    const { result } = renderHook(
      () => useUserSearchV3({ query: "test" }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
      expect(result.current.error).toBeDefined();
    });
  });
});
