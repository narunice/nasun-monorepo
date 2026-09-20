import type { VotingPowerData } from "../hooks/useVotingPower";

/**
 * Render voting power without inventing it.
 *
 * A hardcoded fallback here tells people they hold power they may not have:
 * totalVotingPower is a number, so a legitimate 0 and a failed fetch both used
 * to surface as the same made-up figure. Loading, unavailable and zero are
 * three different answers and each is shown as itself.
 *
 * The API body is cast, not validated, so a 200 with the field missing must
 * read as unavailable rather than throw during render.
 */
export function formatVotingPower(
  votingPower: VotingPowerData | null,
  isLoading: boolean
): string {
  if (isLoading) return "...";

  const total = votingPower?.totalVotingPower;
  if (typeof total !== "number" || !Number.isFinite(total)) return "Unavailable";

  return total.toLocaleString("en-US");
}
