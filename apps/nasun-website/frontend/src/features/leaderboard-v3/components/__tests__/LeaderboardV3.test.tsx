import { describe, it, expect, vi, beforeEach } from "vitest";
import { BrowserRouter } from "react-router-dom";

// Mock hooks using absolute paths
vi.mock("@/features/leaderboard-v3/hooks/useLeaderboardState", () => ({
  useLeaderboardState: () => ({
    seasons: [],
    seasonsLoading: false,
    selectedSeasonId: undefined,
    leaderboardData: null,
    pagination: { totalPages: 1 },
  }),
}));

vi.mock("@/features/leaderboard-v3/hooks/useStickySidebar", () => ({
  useStickySidebar: () => ({
    rightColumnRef: { current: null },
    feedContainerRef: { current: null },
    rightColumnHeight: 0,
    isFeedOverflowing: false,
  }),
}));

// Mock child components using absolute paths
vi.mock("@/features/leaderboard-v3/components/sidebar/LeaderboardSidebar", () => ({
  LeaderboardSidebar: () => <div data-testid="sidebar">Sidebar</div>,
}));

vi.mock("@/features/leaderboard-v3/components/main/LeaderboardMainContent", () => ({
  LeaderboardMainContent: () => <div data-testid="main-content">Main Content</div>,
}));

vi.mock("@/features/leaderboard-v3/components/SeasonSelector", () => ({
  SeasonSelector: () => <div>Season Selector</div>,
}));

vi.mock("@/features/leaderboard-v3/components/TopClimbersV3", () => ({
  __esModule: true,
  default: () => <div>Top Climbers</div>,
}));

vi.mock("@/features/leaderboard-v3/components/sidebar/MyRank", () => ({
  MyRankCardV3: () => <div>My Rank</div>,
}));

import { render, screen } from "@testing-library/react";
import { LeaderboardV3 } from "../LeaderboardV3";

describe("LeaderboardV3", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders main structure", () => {
    render(
      <BrowserRouter>
        <LeaderboardV3 />
      </BrowserRouter>
    );

    expect(screen.getByText("Nasun Leaderboard")).toBeInTheDocument();
    expect(screen.getByTestId("sidebar")).toBeInTheDocument();
    expect(screen.getByTestId("main-content")).toBeInTheDocument();
  });
});
