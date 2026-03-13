import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { UserSearchBoxV3 } from "../UserSearchBoxV3";

// Mock i18n
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        "v3.searchPlaceholder": "Search by username...",
        "v3.search.searching": "Searching...",
        "v3.search.noResults": "No results found",
      };
      return translations[key] || key;
    },
  }),
}));

// Mock search API responses
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
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const mockAccounts = [
  {
    accountId: "acc_1",
    username: "nasun_io",
    originalUsername: "Nasun_IO",
    platform: "twitter" as const,
    displayName: "NASUN Official",
    profileImageUrl: "https://example.com/avatar1.jpg",
    userScore: 1250.5,
    rank: 1,
  },
  {
    accountId: "acc_2",
    username: "nasundev",
    originalUsername: "NasunDev",
    platform: "twitter" as const,
    displayName: "Nasun Developer",
    profileImageUrl: null,
    userScore: 520.3,
    rank: 15,
  },
  {
    accountId: "acc_3",
    username: "nasun_whale",
    originalUsername: "nasun_whale",
    platform: "twitter" as const,
    displayName: undefined,
    profileImageUrl: undefined,
    userScore: 100,
    rank: 250,
  },
];

describe("UserSearchBoxV3", () => {
  let onUserSelect: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    onUserSelect = vi.fn();
    mockSearchAccounts.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function renderSearch(props?: Partial<React.ComponentProps<typeof UserSearchBoxV3>>) {
    const Wrapper = createWrapper();
    return render(
      <Wrapper>
        <UserSearchBoxV3
          seasonId="season_1"
          onUserSelect={onUserSelect}
          {...props}
        />
      </Wrapper>
    );
  }

  // ── Basic Rendering ────────────────────────────────────────

  it("renders search input with placeholder", () => {
    renderSearch();
    expect(screen.getByPlaceholderText("Search by username...")).toBeInTheDocument();
  });

  it("renders with custom placeholder", () => {
    renderSearch({ placeholder: "Find a user..." });
    expect(screen.getByPlaceholderText("Find a user...")).toBeInTheDocument();
  });

  it("does not show dropdown initially", () => {
    renderSearch();
    expect(screen.queryByText("Searching...")).not.toBeInTheDocument();
    expect(screen.queryByText("No results found")).not.toBeInTheDocument();
  });

  // ── Input Behavior ─────────────────────────────────────────

  it("does not trigger search for single character input", async () => {
    mockSearchAccounts.mockResolvedValue({ accounts: [], total: 0 });
    renderSearch();

    const input = screen.getByPlaceholderText("Search by username...");
    fireEvent.change(input, { target: { value: "a" } });

    act(() => vi.advanceTimersByTime(350));

    expect(screen.queryByText("Searching...")).not.toBeInTheDocument();
    expect(mockSearchAccounts).not.toHaveBeenCalled();
  });

  it("triggers search after 2+ characters and debounce delay", async () => {
    mockSearchAccounts.mockResolvedValue({
      accounts: mockAccounts,
      total: 3,
    });
    renderSearch();

    const input = screen.getByPlaceholderText("Search by username...");
    fireEvent.change(input, { target: { value: "na" } });

    // Before debounce
    expect(mockSearchAccounts).not.toHaveBeenCalled();

    // After debounce (300ms)
    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(mockSearchAccounts).toHaveBeenCalledWith({
        query: "na",
        limit: 8,
        seasonId: "season_1",
      });
    });
  });

  it("debounces rapid typing, only searches final value", async () => {
    mockSearchAccounts.mockResolvedValue({ accounts: [], total: 0 });
    renderSearch();

    const input = screen.getByPlaceholderText("Search by username...");

    fireEvent.change(input, { target: { value: "na" } });
    act(() => vi.advanceTimersByTime(100));
    fireEvent.change(input, { target: { value: "nas" } });
    act(() => vi.advanceTimersByTime(100));
    fireEvent.change(input, { target: { value: "nasu" } });
    act(() => vi.advanceTimersByTime(100));
    fireEvent.change(input, { target: { value: "nasun" } });

    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(mockSearchAccounts).toHaveBeenCalledTimes(1);
      expect(mockSearchAccounts).toHaveBeenCalledWith(
        expect.objectContaining({ query: "nasun" })
      );
    });
  });

  // ── Query Normalization (@ prefix, case, whitespace) ──────

  it("strips @ prefix from query before searching", async () => {
    mockSearchAccounts.mockResolvedValue({ accounts: [], total: 0 });
    renderSearch();

    const input = screen.getByPlaceholderText("Search by username...");
    fireEvent.change(input, { target: { value: "@nasun" } });

    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(mockSearchAccounts).toHaveBeenCalledWith(
        expect.objectContaining({ query: "nasun" })
      );
    });
  });

  it("converts query to lowercase before searching", async () => {
    mockSearchAccounts.mockResolvedValue({ accounts: [], total: 0 });
    renderSearch();

    const input = screen.getByPlaceholderText("Search by username...");
    fireEvent.change(input, { target: { value: "NASUN" } });

    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(mockSearchAccounts).toHaveBeenCalledWith(
        expect.objectContaining({ query: "nasun" })
      );
    });
  });

  it("trims whitespace from query before searching", async () => {
    mockSearchAccounts.mockResolvedValue({ accounts: [], total: 0 });
    renderSearch();

    const input = screen.getByPlaceholderText("Search by username...");
    fireEvent.change(input, { target: { value: "  nasun  " } });

    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(mockSearchAccounts).toHaveBeenCalledWith(
        expect.objectContaining({ query: "nasun" })
      );
    });
  });

  it("handles combined normalization: @PREFIX + UPPERCASE + whitespace", async () => {
    mockSearchAccounts.mockResolvedValue({ accounts: [], total: 0 });
    renderSearch();

    const input = screen.getByPlaceholderText("Search by username...");
    fireEvent.change(input, { target: { value: "  @NASUN_IO  " } });

    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(mockSearchAccounts).toHaveBeenCalledWith(
        expect.objectContaining({ query: "nasun_io" })
      );
    });
  });

  // ── Edge Case: @ prefix makes query too short ─────────────

  it("does not search when input is only '@' (normalized to empty)", async () => {
    mockSearchAccounts.mockResolvedValue({ accounts: [], total: 0 });
    renderSearch();

    const input = screen.getByPlaceholderText("Search by username...");
    fireEvent.change(input, { target: { value: "@" } });

    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    expect(mockSearchAccounts).not.toHaveBeenCalled();
  });

  it("does not search when '@a' normalizes to 1 char", async () => {
    mockSearchAccounts.mockResolvedValue({ accounts: [], total: 0 });
    renderSearch();

    const input = screen.getByPlaceholderText("Search by username...");
    fireEvent.change(input, { target: { value: "@a" } });

    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    // "@a" -> "a" (1 char) -> should NOT trigger search
    // BUG: dropdown opens (value.length >= 2) but no search runs
    // (normalizedQuery.length < 2), causing empty loading state
    expect(mockSearchAccounts).not.toHaveBeenCalled();
  });

  // ── Dropdown Display ───────────────────────────────────────

  it("displays search results in dropdown", async () => {
    mockSearchAccounts.mockResolvedValue({
      accounts: mockAccounts,
      total: 3,
    });
    renderSearch();

    const input = screen.getByPlaceholderText("Search by username...");
    fireEvent.change(input, { target: { value: "nasun" } });

    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(screen.getByText("@Nasun_IO")).toBeInTheDocument();
      expect(screen.getByText("@NasunDev")).toBeInTheDocument();
      expect(screen.getByText("@nasun_whale")).toBeInTheDocument();
    });
  });

  it("displays displayName as subtitle when available", async () => {
    mockSearchAccounts.mockResolvedValue({
      accounts: mockAccounts,
      total: 3,
    });
    renderSearch();

    const input = screen.getByPlaceholderText("Search by username...");
    fireEvent.change(input, { target: { value: "nasun" } });

    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(screen.getByText("NASUN Official")).toBeInTheDocument();
      expect(screen.getByText("Nasun Developer")).toBeInTheDocument();
    });
  });

  it("displays rank badge for ranked users", async () => {
    mockSearchAccounts.mockResolvedValue({
      accounts: mockAccounts,
      total: 3,
    });
    renderSearch();

    const input = screen.getByPlaceholderText("Search by username...");
    fireEvent.change(input, { target: { value: "nasun" } });

    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(screen.getByText("#1")).toBeInTheDocument();
      expect(screen.getByText("#15")).toBeInTheDocument();
      expect(screen.getByText("#250")).toBeInTheDocument();
    });
  });

  it("shows 'No results found' for empty search results", async () => {
    mockSearchAccounts.mockResolvedValue({ accounts: [], total: 0 });
    renderSearch();

    const input = screen.getByPlaceholderText("Search by username...");
    fireEvent.change(input, { target: { value: "zzzznonexistent" } });

    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(screen.getByText("No results found")).toBeInTheDocument();
    });
  });

  // ── Selection Behavior ─────────────────────────────────────

  it("calls onUserSelect with username and rank on click", async () => {
    mockSearchAccounts.mockResolvedValue({
      accounts: [mockAccounts[0]],
      total: 1,
    });
    renderSearch();

    const input = screen.getByPlaceholderText("Search by username...");
    fireEvent.change(input, { target: { value: "nasun" } });

    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(screen.getByText("@Nasun_IO")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("@Nasun_IO"));

    expect(onUserSelect).toHaveBeenCalledWith("nasun_io", 1);
  });

  it("selects first result on Enter key", async () => {
    mockSearchAccounts.mockResolvedValue({
      accounts: mockAccounts,
      total: 3,
    });
    renderSearch();

    const input = screen.getByPlaceholderText("Search by username...");
    fireEvent.change(input, { target: { value: "nasun" } });

    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(screen.getByText("@Nasun_IO")).toBeInTheDocument();
    });

    fireEvent.keyDown(input, { key: "Enter" });

    expect(onUserSelect).toHaveBeenCalledWith("nasun_io", 1);
  });

  it("closes dropdown on Escape key", async () => {
    mockSearchAccounts.mockResolvedValue({
      accounts: mockAccounts,
      total: 3,
    });
    renderSearch();

    const input = screen.getByPlaceholderText("Search by username...");
    fireEvent.change(input, { target: { value: "nasun" } });

    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(screen.getByText("@Nasun_IO")).toBeInTheDocument();
    });

    fireEvent.keyDown(input, { key: "Escape" });

    expect(screen.queryByText("@Nasun_IO")).not.toBeInTheDocument();
  });

  it("updates input value to selected username after selection", async () => {
    mockSearchAccounts.mockResolvedValue({
      accounts: [mockAccounts[0]],
      total: 1,
    });
    renderSearch();

    const input = screen.getByPlaceholderText("Search by username...") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "nasun" } });

    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(screen.getByText("@Nasun_IO")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("@Nasun_IO"));

    expect(input.value).toBe("nasun_io");
  });

  // ── Clear Button ───────────────────────────────────────────

  it("shows clear button when input has text", () => {
    renderSearch();
    const input = screen.getByPlaceholderText("Search by username...");

    expect(screen.queryByRole("button")).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: "test" } });

    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThan(0);
  });

  it("clears input and closes dropdown on clear button click", async () => {
    mockSearchAccounts.mockResolvedValue({
      accounts: mockAccounts,
      total: 3,
    });
    renderSearch();

    const input = screen.getByPlaceholderText("Search by username...") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "nasun" } });

    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(screen.getByText("@Nasun_IO")).toBeInTheDocument();
    });

    // Multiple buttons exist (clear + dropdown items), target the X clear button
    const clearButton = screen.getAllByRole("button")[0];
    fireEvent.click(clearButton);

    expect(input.value).toBe("");
    expect(screen.queryByText("@Nasun_IO")).not.toBeInTheDocument();
  });

  // ── Outside Click ──────────────────────────────────────────

  it("closes dropdown when clicking outside", async () => {
    mockSearchAccounts.mockResolvedValue({
      accounts: mockAccounts,
      total: 3,
    });
    renderSearch();

    const input = screen.getByPlaceholderText("Search by username...");
    fireEvent.change(input, { target: { value: "nasun" } });

    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(screen.getByText("@Nasun_IO")).toBeInTheDocument();
    });

    fireEvent.mouseDown(document.body);

    expect(screen.queryByText("@Nasun_IO")).not.toBeInTheDocument();
  });

  // ── Focus Behavior ─────────────────────────────────────────

  it("reopens dropdown on focus when query >= 2 chars", async () => {
    mockSearchAccounts.mockResolvedValue({
      accounts: mockAccounts,
      total: 3,
    });
    renderSearch();

    const input = screen.getByPlaceholderText("Search by username...");
    fireEvent.change(input, { target: { value: "nasun" } });

    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(screen.getByText("@Nasun_IO")).toBeInTheDocument();
    });

    // Close by clicking outside
    fireEvent.mouseDown(document.body);
    expect(screen.queryByText("@Nasun_IO")).not.toBeInTheDocument();

    // Refocus should reopen
    fireEvent.focus(input);

    await waitFor(() => {
      expect(screen.getByText("@Nasun_IO")).toBeInTheDocument();
    });
  });

  // ── Edge Cases: Special Characters ─────────────────────────

  it("handles usernames with underscores", async () => {
    mockSearchAccounts.mockResolvedValue({
      accounts: [mockAccounts[2]],
      total: 1,
    });
    renderSearch();

    const input = screen.getByPlaceholderText("Search by username...");
    fireEvent.change(input, { target: { value: "nasun_w" } });

    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(screen.getByText("@nasun_whale")).toBeInTheDocument();
    });
  });

  it("handles usernames with dots and numbers", async () => {
    const accountWithDots = {
      accountId: "acc_dot",
      username: "user.name123",
      originalUsername: "User.Name123",
      platform: "twitter" as const,
      displayName: "User With Dots",
      rank: 42,
    };
    mockSearchAccounts.mockResolvedValue({
      accounts: [accountWithDots],
      total: 1,
    });
    renderSearch();

    const input = screen.getByPlaceholderText("Search by username...");
    fireEvent.change(input, { target: { value: "user.n" } });

    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(screen.getByText("@User.Name123")).toBeInTheDocument();
    });
  });

  // ── Edge Cases: Whitespace-only Input ──────────────────────

  it("does not search for whitespace-only input", async () => {
    mockSearchAccounts.mockResolvedValue({ accounts: [], total: 0 });
    renderSearch();

    const input = screen.getByPlaceholderText("Search by username...");
    fireEvent.change(input, { target: { value: "   " } });

    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    // "   " trimmed -> "" (0 chars) -> should not trigger search
    expect(mockSearchAccounts).not.toHaveBeenCalled();
  });

  // ── Edge Cases: No Rank Info ───────────────────────────────

  it("calls onUserSelect with undefined rank when account has no rank", async () => {
    const unrankedAccount = {
      accountId: "acc_unranked",
      username: "newuser",
      originalUsername: "NewUser",
      platform: "twitter" as const,
      displayName: "New User",
      rank: undefined,
    };
    mockSearchAccounts.mockResolvedValue({
      accounts: [unrankedAccount],
      total: 1,
    });
    renderSearch();

    const input = screen.getByPlaceholderText("Search by username...");
    fireEvent.change(input, { target: { value: "newuser" } });

    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(screen.getByText("@NewUser")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("@NewUser"));

    expect(onUserSelect).toHaveBeenCalledWith("newuser", undefined);
  });

  // ── Edge Case: API Error ───────────────────────────────────

  it("handles API errors gracefully without crashing", async () => {
    mockSearchAccounts.mockRejectedValue(new Error("Network error"));
    renderSearch();

    const input = screen.getByPlaceholderText("Search by username...");
    fireEvent.change(input, { target: { value: "nasun" } });

    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    // Should not crash
    expect(input).toBeInTheDocument();
  });

  // ── Edge Case: Empty string after clearing ─────────────────

  it("does not search after clearing to empty", async () => {
    mockSearchAccounts.mockResolvedValue({
      accounts: mockAccounts,
      total: 3,
    });
    renderSearch();

    const input = screen.getByPlaceholderText("Search by username...");

    fireEvent.change(input, { target: { value: "nasun" } });
    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    mockSearchAccounts.mockClear();

    fireEvent.change(input, { target: { value: "" } });
    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    expect(mockSearchAccounts).not.toHaveBeenCalled();
  });

  // ── Edge Case: Enter with no results ───────────────────────

  it("does nothing on Enter when there are no results", async () => {
    mockSearchAccounts.mockResolvedValue({ accounts: [], total: 0 });
    renderSearch();

    const input = screen.getByPlaceholderText("Search by username...");
    fireEvent.change(input, { target: { value: "zzzzz" } });

    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(screen.getByText("No results found")).toBeInTheDocument();
    });

    fireEvent.keyDown(input, { key: "Enter" });

    expect(onUserSelect).not.toHaveBeenCalled();
  });

  // ── Edge Case: No profileImageUrl shows default avatar ─────

  it("shows default avatar icon when profileImageUrl is missing", async () => {
    const noAvatarAccount = {
      accountId: "acc_noav",
      username: "noavatar",
      originalUsername: "NoAvatar",
      platform: "twitter" as const,
      displayName: "No Avatar User",
      rank: 99,
    };
    mockSearchAccounts.mockResolvedValue({
      accounts: [noAvatarAccount],
      total: 1,
    });
    renderSearch();

    const input = screen.getByPlaceholderText("Search by username...");
    fireEvent.change(input, { target: { value: "noavatar" } });

    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(screen.getByText("@NoAvatar")).toBeInTheDocument();
    });

    // No <img> for this result
    const imgs = screen.queryAllByRole("img");
    const resultImgs = imgs.filter((img) =>
      img.getAttribute("alt")?.includes("NoAvatar")
    );
    expect(resultImgs).toHaveLength(0);
  });

  // ── Edge Case: Without seasonId ────────────────────────────

  it("searches without seasonId when not provided", async () => {
    mockSearchAccounts.mockResolvedValue({ accounts: [], total: 0 });
    renderSearch({ seasonId: undefined });

    const input = screen.getByPlaceholderText("Search by username...");
    fireEvent.change(input, { target: { value: "test" } });

    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(mockSearchAccounts).toHaveBeenCalledWith({
        query: "test",
        limit: 8,
        seasonId: undefined,
      });
    });
  });

  // ── Edge Case: Dropdown open/close mismatch with normalization ──

  it("opens dropdown for '@ab' but search runs (normalized 'ab' >= 2)", async () => {
    mockSearchAccounts.mockResolvedValue({ accounts: [], total: 0 });
    renderSearch();

    const input = screen.getByPlaceholderText("Search by username...");
    fireEvent.change(input, { target: { value: "@ab" } });

    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    // "@ab" -> "ab" (2 chars) -> search SHOULD run
    await waitFor(() => {
      expect(mockSearchAccounts).toHaveBeenCalledWith(
        expect.objectContaining({ query: "ab" })
      );
    });
  });

  // ── Edge Case: Multiple @ signs ────────────────────────────

  it("only strips leading @ from query", async () => {
    mockSearchAccounts.mockResolvedValue({ accounts: [], total: 0 });
    renderSearch();

    const input = screen.getByPlaceholderText("Search by username...");
    fireEvent.change(input, { target: { value: "@@test" } });

    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    // regex /^@/ only removes first @
    await waitFor(() => {
      expect(mockSearchAccounts).toHaveBeenCalledWith(
        expect.objectContaining({ query: "@test" })
      );
    });
  });
});
