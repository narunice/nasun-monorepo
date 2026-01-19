import { SuiClient } from '@mysten/sui/client';

const RPC_URL = "https://rpc.devnet.nasun.io";

export const suiClient = new SuiClient({ url: RPC_URL });

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
