export type LeaderboardPeriodId = 'CUMULATIVE' | 'EVENT1' | 'EVENT2' | 'EVENT3';

export interface LeaderboardConfigItem {
  id: LeaderboardPeriodId;
  name: string;
  startDate?: string; // YYYY-MM-DD format
  endDate?: string;   // YYYY-MM-DD format
  active: boolean;    // Whether this leaderboard is currently active/relevant (e.g. event ongoing)
  visible: boolean;   // Whether this leaderboard should be displayed in the UI
}

export interface LeaderboardConfigResponse {
  success: boolean;
  data: {
    availableLeaderboards: LeaderboardConfigItem[];
  };
}

export interface LeaderboardErrorResponse {
  success: false;
  message: string;
  error?: string;
}
