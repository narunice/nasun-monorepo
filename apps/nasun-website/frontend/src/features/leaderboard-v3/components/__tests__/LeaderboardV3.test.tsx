import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { LeaderboardV3 } from "../LeaderboardV3";
import { BrowserRouter } from "react-router-dom";

// Mock hooks
vi.mock("../../hooks/useLeaderboardState", () => ({
  useLeaderboardState: () => ({
    seasons: [],
    seasonsLoading: false,
    selectedSeasonId: undefined,
    leaderboardData: null,
    pagination: { totalPages: 1 },
  }),
}));

vi.mock("../../hooks/useStickySidebar", () => ({
  useStickySidebar: () => ({
    rightColumnRef: { current: null },
    feedContainerRef: { current: null },
    rightColumnHeight: 0,
    isFeedOverflowing: false,
  }),
}));

// Mock child components
vi.mock("../sidebar/LeaderboardSidebar", () => ({
  LeaderboardSidebar: () => <div data-testid="sidebar">Sidebar</div>,
}));

vi.mock("../main/LeaderboardMainContent", () => ({
  LeaderboardMainContent: () => <div data-testid="main-content">Main Content</div>,
}));

vi.mock("../SeasonSelector", () => ({
  SeasonSelector: () => <div>Season Selector</div>,
}));

vi.mock("../TopClimbersV3", () => ({
  default: () => <div>Top Climbers</div>,
}));

vi.mock("../sidebar/MyRank", () => ({
  MyRankCardV3: () => <div>My Rank</div>,
}));

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

    expect(screen.getByText("Community Leaderboard")).toBeInTheDocument();
    expect(screen.getByTestId("sidebar")).toBeInTheDocument();
    expect(screen.getByTestId("main-content")).toBeInTheDocument();
  });
});
