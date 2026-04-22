import { SuiClient, SuiHTTPTransport } from '@mysten/sui/client';
import { createRetryFetch } from '@nasun/wallet';

// Trusted RPC URL whitelist - only these URLs are allowed
const ALLOWED_RPC_URLS = [
  'https://rpc.devnet.nasun.io',
  'https://rpc.testnet.nasun.io',
  'https://rpc.mainnet.nasun.io',
] as const;

const DEFAULT_RPC_URL = 'https://rpc.devnet.nasun.io';

/**
 * Get validated RPC URL
 * Falls back to default if environment variable is not in whitelist
 */
function getValidatedRpcUrl(): string {
  const envUrl = import.meta.env.VITE_SUI_RPC_URL;

  if (!envUrl) {
    return DEFAULT_RPC_URL;
  }

  // Validate against whitelist
  if (ALLOWED_RPC_URLS.includes(envUrl as typeof ALLOWED_RPC_URLS[number])) {
    return envUrl;
  }

  // URL not in whitelist - log warning and use default
  console.warn(
    `[sui-client] RPC URL "${envUrl}" not in whitelist. Using default: ${DEFAULT_RPC_URL}`
  );
  return DEFAULT_RPC_URL;
}

const RPC_URL = getValidatedRpcUrl();

export const suiClient = new SuiClient({
  transport: new SuiHTTPTransport({
    url: RPC_URL,
    fetch: createRetryFetch(),
  }),
});

export async function getEpochInfo() {
  try {
    const systemState = await suiClient.getLatestSuiSystemState();
    const now = Date.now();
    const epochStart = Number(systemState.epochStartTimestampMs);
    const epochDuration = Number(systemState.epochDurationMs);
    const epochEnd = epochStart + epochDuration;
    const remainingMs = Math.max(0, epochEnd - now);
    const elapsed = now - epochStart;
    const progress = Math.min(100, Math.max(0, (elapsed / epochDuration) * 100));

    return {
      epoch: systemState.epoch,
      epochStartTimestampMs: systemState.epochStartTimestampMs,
      epochDurationMs: systemState.epochDurationMs,
      remainingMs,
      totalStake: systemState.totalStake,
      // New fields for charts
      progress,
      startTimestamp: epochStart,
      endTimestamp: epochEnd,
    };
  } catch (error) {
    console.error('Failed to get epoch info:', error);
    return null;
  }
}

export async function getTPS() {
  try {
    // Estimating TPS from last 5 checkpoints
    const checkpoints = await suiClient.getCheckpoints({
      descendingOrder: true,
      limit: 5,
    });

    if (!checkpoints.data || checkpoints.data.length < 2) return null;

    const latest = checkpoints.data[0];
    const oldest = checkpoints.data[checkpoints.data.length - 1];

    // Transaction count diff between checkpoints
    const txDiff = Number(latest.networkTotalTransactions) - Number(oldest.networkTotalTransactions);
    const timeDiff = (Number(latest.timestampMs) - Number(oldest.timestampMs)) / 1000;

    if (timeDiff <= 0) return null;

    return Math.round((txDiff / timeDiff) * 10) / 10; // 1 decimal place
  } catch (error) {
    console.error('Failed to calculate TPS:', error);
    return null;
  }
}
