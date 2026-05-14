export function calculateEffectiveScore(stakeAmount: number, reputation: number): number {
  return Math.sqrt(stakeAmount / 1e9) * (reputation / 1000);
}

export function isValidEndpointUrl(url: string, isDev: boolean = false): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'http:' && isDev) return true;
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}
