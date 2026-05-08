/**
 * Referral eligibility gate — pure logic.
 *
 * Decides whether a caller qualifies for a referral code based on raw signals
 * fetched from the Explorer API and social-account fields read from
 * UserProfiles. Network IO lives in index.ts; this file is unit-testable.
 */

export interface EligibilitySignals {
  hasGovernanceVote: boolean;
  hasGenesisPass: boolean;
  adminCuratedBonusTotal: number;
  activationsCacheReady: boolean;
}

export type GatePath =
  | "p1-governance"
  | "p2-genesis-pass"
  | "p3-admin-bonus"
  | "p4-triple-social";

export interface GateDecision {
  eligible: boolean;
  passedPath?: GatePath;
  closestPath?: GatePath | "p3-admin-bonus";
  hint?: string;
}

export const ADMIN_BONUS_THRESHOLD_SOLO = 40;
export const ADMIN_BONUS_THRESHOLD_TRIPLE_SOCIAL = 25;

export function hasX(profile: Record<string, any> | undefined): boolean {
  return !!profile?.twitterHandle;
}

export function hasGoogle(profile: Record<string, any> | undefined): boolean {
  if (!profile) return false;
  if (profile.provider === "google") return true;
  const linked = profile.linkedAccounts;
  if (linked && typeof linked === "object" && linked.google?.identityId) return true;
  return false;
}

export function hasTelegram(profile: Record<string, any> | undefined): boolean {
  return profile?.isTelegramMember === true;
}

export function evaluateGate(
  profile: Record<string, any> | undefined,
  signals: EligibilitySignals,
): GateDecision {
  if (signals.hasGovernanceVote) {
    return { eligible: true, passedPath: "p1-governance" };
  }
  if (signals.hasGenesisPass) {
    return { eligible: true, passedPath: "p2-genesis-pass" };
  }
  if (signals.adminCuratedBonusTotal >= ADMIN_BONUS_THRESHOLD_SOLO) {
    return { eligible: true, passedPath: "p3-admin-bonus" };
  }
  const triple = hasX(profile) && hasGoogle(profile) && hasTelegram(profile);
  if (triple && signals.adminCuratedBonusTotal >= ADMIN_BONUS_THRESHOLD_TRIPLE_SOCIAL) {
    return { eligible: true, passedPath: "p4-triple-social" };
  }

  // Hint: closest unmet path.
  // - Triple-social user needing only a few bonus pts → P4 hint (smallest gap).
  // - Otherwise, P3 (40-pt admin bonus) is the most actionable single-signal path.
  // - We do not hint governance/GP because those depend on external events the
  //   user cannot trigger on demand.
  const bonus = signals.adminCuratedBonusTotal;
  const missingForP3 = ADMIN_BONUS_THRESHOLD_SOLO - bonus;
  const missingForP4 = ADMIN_BONUS_THRESHOLD_TRIPLE_SOCIAL - bonus;
  let closestPath: GatePath;
  let hint: string;
  if (triple && missingForP4 > 0) {
    closestPath = "p4-triple-social";
    hint = `You have ${bonus} admin-curated bonus points. Need ${missingForP4} more to qualify via the triple-social path.`;
  } else {
    closestPath = "p3-admin-bonus";
    hint =
      missingForP3 > 0
        ? `You have ${bonus} admin-curated bonus points. Need ${missingForP3} more (40 total) to qualify.`
        : "Vote on a governance proposal, hold a Genesis Pass, or earn admin-curated bonus points.";
  }
  return { eligible: false, closestPath, hint };
}
