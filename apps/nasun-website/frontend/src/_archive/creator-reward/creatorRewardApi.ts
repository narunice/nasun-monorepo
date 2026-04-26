import { fetchWithTimeout } from '@/utils/fetchWithTimeout';

const BASE_URL = import.meta.env.VITE_LEADERBOARD_V3_API_URL;

export type RewardType = 'polygon' | 'bnb' | 'binance' | 'custom';
export type RewardChain = 'polygon' | 'bnb';

export interface CreatorRewardStatus {
  eligible: boolean;
  alreadySubmitted?: boolean;
  rank?: number;
  rewardType?: RewardType;
  evmAddressMasked?: string | null;
  // present when alreadySubmitted=true
  destinationAddressMasked?: string;
  destinationChain?: RewardChain;
  binanceUid?: string;
}

export interface SubmitRewardBody {
  rewardType: RewardType;
  binanceUid?: string;
  destinationAddress?: string;
  destinationChain?: RewardChain;
}

export async function getCreatorRewardStatus(token: string): Promise<CreatorRewardStatus> {
  const res = await fetchWithTimeout(`${BASE_URL}/v3/leaderboard/creator-reward`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<CreatorRewardStatus>;
}

export async function submitCreatorReward(token: string, body: SubmitRewardBody): Promise<void> {
  const res = await fetchWithTimeout(`${BASE_URL}/v3/leaderboard/creator-reward`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw Object.assign(new Error((data as { error?: string }).error || `HTTP ${res.status}`), {
      status: res.status,
    });
  }
}
