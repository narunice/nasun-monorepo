import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { LeaderboardSidebar } from "../sidebar/LeaderboardSidebar";

vi.mock("../../UserSearchBoxV3", () => ({
  UserSearchBoxV3: () => <div>User Search Box</div>,
}));

vi.mock("../sidebar/MyRank", () => ({
  MyRankCardV3: () => <div>My Rank Card</div>,
}));

vi.mock("../../NasunContentFeed", () => ({
  NasunContentFeed: () => <div>Nasun Content Feed</div>,
}));

vi.mock("../../../hooks/useStickySidebar", () => ({
  useStickySidebar: () => ({
    rightColumnHeight: 500,
    isFeedOverflowing: false,
    feedContainerRef: { current: null },
  }),
}));

describe("LeaderboardSidebar", () => {
  it("renders all components", () => {
    render(<LeaderboardSidebar seasonId="season1" onUserSelect={() => {}} />);

    expect(screen.getByText("User Search Box")).toBeInTheDocument();
    expect(screen.getByText("My Rank Card")).toBeInTheDocument();
    expect(screen.getByText("Nasun Content Feed")).toBeInTheDocument();
  });

  it("does not render MyRankCard when seasonId is missing", () => {
    render(<LeaderboardSidebar seasonId={undefined} onUserSelect={() => {}} />);

    expect(screen.queryByText("My Rank Card")).not.toBeInTheDocument();
  });
});
