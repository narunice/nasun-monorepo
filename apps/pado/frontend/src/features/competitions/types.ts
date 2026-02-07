export type CompetitionStatus = 'upcoming' | 'active' | 'ended';

export interface Competition {
  id: string;
  title: string;
  description: string;
  start_ms: number;
  end_ms: number;
  status: CompetitionStatus;
  prize_description: string;
  min_volume: string;
  created_at: number;
  updated_at: number;
}

export interface CompetitionTrader {
  rank: number;
  address: string;
  nickname: string | null;
  volumeUsd: string;
  tradeCount: number;
}

export interface CompetitionDetail extends Competition {
  topTraders: CompetitionTrader[];
}

export interface CompetitionsListResponse {
  competitions: Competition[];
}

export interface CompetitionResultsResponse {
  competitionId: string;
  traders: CompetitionTrader[];
}

export const STATUS_LABELS: Record<CompetitionStatus, string> = {
  upcoming: 'Upcoming',
  active: 'Live',
  ended: 'Ended',
};

export const STATUS_COLORS: Record<CompetitionStatus, string> = {
  upcoming: 'text-blue-400',
  active: 'text-green-400',
  ended: 'text-theme-text-muted',
};
