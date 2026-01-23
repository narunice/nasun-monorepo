import { useState, useEffect, useCallback, useRef } from "react";
import { useSeasons, useActiveSeason } from "../hooks/useSeasons";
import { useSeasonLeaderboard } from "../hooks/useSeasonLeaderboard";
import { usePaginationV3 } from "../hooks/usePaginationV3";

const ITEMS_PER_PAGE = 50;

export function useLeaderboardState() {
  const { data: seasons, isLoading: seasonsLoading } = useSeasons();
  const activeSeason = useActiveSeason();

  // Selected season (defaults to active season)
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | undefined>(undefined);

  // Snapshot date for past rankings (optional)
  const [snapshotDate, setSnapshotDate] = useState<string | undefined>(undefined);

  // Page state for query
  const [page, setPage] = useState(1);

  // Fetch leaderboard data
  const {
    data: leaderboardData,
    isLoading: leaderboardLoading,
    error: leaderboardError,
  } = useSeasonLeaderboard({
    seasonId: selectedSeasonId,
    snapshotDate,
    limit: ITEMS_PER_PAGE,
    offset: (page - 1) * ITEMS_PER_PAGE,
  });

  // Pagination hook for UI (uses totalCount from query)
  const pagination = usePaginationV3(leaderboardData?.totalCount ?? 0, ITEMS_PER_PAGE);

  // Highlighted user for search
  const [highlightedUsername, setHighlightedUsername] = useState<string | undefined>(undefined);
  const [pendingScrollUsername, setPendingScrollUsername] = useState<string | undefined>(undefined);
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Handle user search selection
  const handleUserSelect = useCallback(
    (username: string, rank?: number) => {
      // Clear any existing timeout
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
      }

      setHighlightedUsername(username);

      // Calculate target page from rank
      if (rank) {
        const targetPage = Math.ceil(rank / ITEMS_PER_PAGE);
        if (targetPage !== page) {
          // Need to change page first, then scroll after data loads
          setPendingScrollUsername(username);
          setPage(targetPage);
          pagination.handlePageChange(targetPage);
        } else {
          // Same page, scroll immediately
          setTimeout(() => {
            const row = document.querySelector(`[data-username="${username}"]`);
            if (row) {
              row.scrollIntoView({ behavior: "smooth", block: "center" });
            }
          }, 100);
        }
      } else {
        // No rank info, try to scroll on current page
        setTimeout(() => {
          const row = document.querySelector(`[data-username="${username}"]`);
          if (row) {
            row.scrollIntoView({ behavior: "smooth", block: "center" });
          }
        }, 100);
      }

      // Auto-clear highlight after 6 seconds
      highlightTimeoutRef.current = setTimeout(() => {
        setHighlightedUsername(undefined);
      }, 6000);
    },
    [page, pagination],
  );

  // Scroll to user after page change completes
  useEffect(() => {
    if (pendingScrollUsername && !leaderboardLoading) {
      // Data loaded, now scroll to the user
      setTimeout(() => {
        const row = document.querySelector(`[data-username="${pendingScrollUsername}"]`);
        if (row) {
          row.scrollIntoView({ behavior: "smooth", block: "center" });
        }
        setPendingScrollUsername(undefined);
      }, 100);
    }
  }, [pendingScrollUsername, leaderboardLoading]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
      }
    };
  }, []);

  // Set default season when data loads
  useEffect(() => {
    if (activeSeason && !selectedSeasonId) {
      setSelectedSeasonId(activeSeason.seasonId);
    }
  }, [activeSeason, selectedSeasonId]);

  // Handle page change - update local page state
  const handlePageChange = useCallback(
    (newPage: number) => {
      if (newPage < 1 || newPage > pagination.totalPages || newPage === page) {
        return;
      }
      setPage(newPage);
      pagination.handlePageInputChange(newPage.toString());
    },
    [page, pagination],
  );

  // Reset page when season or snapshot changes
  useEffect(() => {
    setPage(1);
    pagination.resetToFirstPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSeasonId, snapshotDate]);

  // Get selected season info
  const selectedSeason = seasons?.find((s) => s.seasonId === selectedSeasonId);
  const isSeasonEnded = selectedSeason?.status === "ended" || selectedSeason?.status === "archived";

  // Handle season change
  const handleSeasonChange = (seasonId: string) => {
    setSelectedSeasonId(seasonId);
    setSnapshotDate(undefined); // Reset snapshot date when changing seasons
  };

  return {
    seasons,
    seasonsLoading,
    activeSeason,
    selectedSeasonId,
    selectedSeason,
    isSeasonEnded,
    snapshotDate,
    setSnapshotDate,
    handleSeasonChange,
    leaderboardData,
    leaderboardLoading,
    leaderboardError,
    page,
    pagination,
    handlePageChange,
    highlightedUsername,
    handleUserSelect,
  };
}
