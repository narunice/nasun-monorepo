import {
  LeaderboardConfigResponse,
  LeaderboardErrorResponse,
} from '../types/leaderboard';

const LEADERBOARD_API_BASE_URL = import.meta.env.VITE_API_ENDPOINT;

if (!LEADERBOARD_API_BASE_URL) {
  console.error('VITE_API_ENDPOINT is not defined in environment variables');
}

export class LeaderboardApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public response?: LeaderboardErrorResponse
  ) {
    super(message);
    this.name = 'LeaderboardApiError';
  }
}

export async function fetchLeaderboardConfig(): Promise<LeaderboardConfigResponse> {
  const url = `${LEADERBOARD_API_BASE_URL}/api/leaderboard/config`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();

    if (!response.ok) {
      throw new LeaderboardApiError(
        data.message || 'Failed to fetch leaderboard config',
        response.status,
        data
      );
    }

    return data as LeaderboardConfigResponse;
  } catch (error) {
    if (error instanceof LeaderboardApiError) {
      throw error;
    }

    console.error('Failed to fetch leaderboard config:', error);
    throw new LeaderboardApiError(
      error instanceof Error ? error.message : 'Network error occurred'
    );
  }
}
