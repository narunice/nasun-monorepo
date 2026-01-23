import { describe, it, expect, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Mock sub-components using absolute paths to avoid path resolution issues
vi.mock("@/features/leaderboard-v3/components/UserSearchBoxV3", () => ({
  UserSearchBoxV3: () => <div>User Search Box</div>,
}));

vi.mock("@/features/leaderboard-v3/components/sidebar/MyRank", () => ({
  MyRankCardV3: () => <div>My Rank Card</div>,
}));

vi.mock("@/features/leaderboard-v3/components/NasunContentFeed", () => ({
  NasunContentFeed: () => <div>Nasun Content Feed</div>,
}));

vi.mock("@/features/leaderboard-v3/hooks/useStickySidebar", () => ({
  useStickySidebar: () => ({
    rightColumnHeight: 500,
    isFeedOverflowing: false,
    feedContainerRef: { current: null },
  }),
}));

import { render, screen } from "@testing-library/react";
import { LeaderboardSidebar } from "../sidebar/LeaderboardSidebar";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

describe("LeaderboardSidebar", () => {
  it("renders all components", () => {
    render(
      <QueryClientProvider client={queryClient}>
        <LeaderboardSidebar seasonId="season1" onUserSelect={() => {}} />
      </QueryClientProvider>
    );

    expect(screen.getByText("User Search Box")).toBeInTheDocument();
    expect(screen.getByText("My Rank Card")).toBeInTheDocument();
    expect(screen.getByText("Nasun Content Feed")).toBeInTheDocument();
  });

  it("does not render MyRankCard when seasonId is missing", () => {
    render(
      <QueryClientProvider client={queryClient}>
        <LeaderboardSidebar seasonId={undefined} onUserSelect={() => {}} />
      </QueryClientProvider>
    );

    expect(screen.queryByText("My Rank Card")).not.toBeInTheDocument();
  });
});