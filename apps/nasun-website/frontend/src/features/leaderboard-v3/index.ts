/**
 * Leaderboard V3 Feature Module
 *
 * Manual curation system for community engagement tracking.
 * Independent from V2 leaderboard system.
 */

export { LeaderboardV3 } from './components/LeaderboardV3';
export { useLeaderboardV3 } from '../admin/hooks/useLeaderboardV3';
export type {
  LeaderboardEntry,
  GetLeaderboardParams,
  GetLeaderboardResponse,
} from '../admin/types/leaderboard-v3';
