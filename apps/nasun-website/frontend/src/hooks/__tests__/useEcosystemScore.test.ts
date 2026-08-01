// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { createElement } from "react";

const mockGetEcosystemScore = vi.fn();

vi.mock("@/services/ecosystemScoreApi", () => ({
  getEcosystemScore: (...args: unknown[]) => mockGetEcosystemScore(...args),
  syncEcosystemActivations: vi.fn(),
  syncEcosystemTodayActivity: vi.fn(),
  EcosystemScoreError: class EcosystemScoreError extends Error {
    constructor(
      message: string,
      public statusCode?: number,
    ) {
      super(message);
    }
  },
}));

vi.mock("@/features/auth", () => ({
  useAuth: () => ({ user: { identityId: IDENTITY_ID, cognitoToken: "jwt" } }),
}));

vi.mock("@/lib/queryClient", () => ({
  queryClient: new QueryClient(),
}));

import { useEcosystemScore, ecosystemScoreKeys } from "../useEcosystemScore";

const IDENTITY_ID = "ap-northeast-2:00000000-0000-0000-0000-000000000000";

function makeWrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
}

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

describe("useEcosystemScore", () => {
  beforeEach(() => {
    mockGetEcosystemScore.mockReset();
  });

  it("reports isLoading only until the first result arrives", async () => {
    let resolve!: (v: unknown) => void;
    mockGetEcosystemScore.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );

    const { result } = renderHook(() => useEcosystemScore(IDENTITY_ID), {
      wrapper: makeWrapper(makeClient()),
    });

    expect(result.current.isLoading).toBe(true);
    resolve({ allTime: { ecosystemScore: 42 } });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
  });

  /**
   * Regression: `refetchOnMount: "always"` means every observer mount starts a
   * request. If a background request also reported isLoading, a card that
   * swaps its content for a spinner while loading would unmount any child
   * observing this same query -- and remount it on settle, firing another
   * "always" refetch. That loop ran one request per round trip until the
   * server rate-limited it and the spinner never cleared (2026-07-31 incident,
   * TotalPointsCard hiding MultiplierBox). Restored/cached data must stay
   * painted while revalidation runs behind it.
   */
  it("does not report isLoading while revalidating over data already on screen", async () => {
    const client = makeClient();
    client.setQueryData(ecosystemScoreKeys.detail(IDENTITY_ID), {
      allTime: { ecosystemScore: 42 },
    });

    // Never settles: the mount-triggered refetch stays in flight for the
    // whole assertion window.
    mockGetEcosystemScore.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useEcosystemScore(IDENTITY_ID), {
      wrapper: makeWrapper(client),
    });

    await waitFor(() => expect(mockGetEcosystemScore).toHaveBeenCalled());
    expect(result.current.isLoading).toBe(false);
    expect(result.current.score).toEqual({ allTime: { ecosystemScore: 42 } });
  });

  /**
   * The shape that actually broke production, reproduced structurally: a card
   * that swaps its content for a spinner while loading, wrapping a child that
   * observes the same query. Every settled fetch must NOT remount the child,
   * or `refetchOnMount: "always"` fires again and the pair free-runs at one
   * request per round trip.
   */
  it("settles instead of free-running when a loading gate wraps a second observer", async () => {
    mockGetEcosystemScore.mockResolvedValue({ allTime: { ecosystemScore: 42 } });

    function Child() {
      useEcosystemScore(IDENTITY_ID);
      return createElement("span", null, "child");
    }

    function Parent() {
      const { isLoading } = useEcosystemScore(IDENTITY_ID);
      return isLoading
        ? createElement("span", null, "spinner")
        : createElement(Child);
    }

    render(createElement(Parent), { wrapper: makeWrapper(makeClient()) });

    await waitFor(() => expect(mockGetEcosystemScore).toHaveBeenCalled());

    // Let many settle cycles elapse. A free-running pair keeps issuing a fetch
    // per cycle; a settled one stops after the mount-triggered fetches.
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 0));
    }
    const settled = mockGetEcosystemScore.mock.calls.length;

    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 0));
    }
    expect(mockGetEcosystemScore.mock.calls.length).toBe(settled);
    expect(settled).toBeLessThanOrEqual(3);
  });
});
