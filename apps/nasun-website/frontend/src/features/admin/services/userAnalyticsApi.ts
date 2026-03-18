import { authHeaders } from '../utils';

const ADMIN_API_URL = import.meta.env.VITE_ADMIN_API_URL;

export interface UserAnalyticsEntry {
  date: string;
  registeredUsers: number;
  leaderboardAccounts: number;
  telegramMembers: number;
  xConnected: number;
}

interface UserAnalyticsResponse {
  metrics: UserAnalyticsEntry[];
}

export async function fetchUserAnalytics(cognitoToken: string): Promise<UserAnalyticsEntry[]> {
  const response = await fetch(`${ADMIN_API_URL}/user-analytics`, {
    method: 'GET',
    headers: authHeaders(cognitoToken),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch user analytics: ${response.status}`);
  }

  const data: UserAnalyticsResponse = await response.json();
  return data.metrics;
}
