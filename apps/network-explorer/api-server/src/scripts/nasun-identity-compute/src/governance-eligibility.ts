// Sybil gate for governance certificate issuance -- pure policy, no config and no IO.
//
// Kept out of governance-voting.ts on purpose: that module imports config.ts, which reads systemd-creds
// and exits the process when the PG password is absent, so the decision logic would be untestable there.
// The route passes the flags in; this file decides.
//
// Why there is a gate at all: /certificate is the ONLY producer of the Oracle Ed25519 signature that
// voting_power::mint_certificate verifies on chain (voting_power.move ed25519_verify + assert), so a
// refusal here is a refusal for every vote path, including the sponsored Poll flow, with no Move change.

export type VoteIneligibilityCode = 'NOT_REGISTERED' | 'SOCIAL_VERIFICATION_REQUIRED';

export interface VoteEligibility {
  eligible: boolean;
  code?: VoteIneligibilityCode;
  error?: string;
}

/** The subset of the voting-identity loopback response the gate reads. */
export interface VoterIdentity {
  identityId?: string;
  twitterHandle?: string;
  isTelegramMember?: boolean;
}

export interface VotePolicy {
  requireRegisteredIdentity: boolean;
  requireVerifiedSocialForBinding: boolean;
}

/** Move's proposal type encoding: 0 = Governance (binding), 1 = Poll. */
export const POLL_PROPOSAL_TYPE = 1;

/**
 * A linked X handle or Telegram membership.
 *
 * Google is absent, and that is a known exclusion rather than an oversight. /profile/voting-identity
 * returns exactly { identityId, twitterHandle, isTelegramMember } (read on the box, 2026-10-07), so a
 * Google signal would need a second /profile/by-identity call. That endpoint does emit linkedAccounts but
 * not provider, so the check would rest entirely on linkedAccounts.google being present for an identity
 * whose PRIMARY provider is Google, which could not be confirmed (the DAL credentials are systemd-
 * encrypted). An unverifiable branch in a gate fails silently for exactly the people it is meant to admit,
 * so it is left out.
 *
 * The practical cost is bounded: this signal only decides binding Governance proposals, and linking X or
 * joining Telegram is self-service, which is what the refusal message says.
 */
export function hasVerifiedSocial(profile: VoterIdentity): boolean {
  return !!profile.twitterHandle || profile.isTelegramMember === true;
}

/**
 * Tier 1, every proposal: the wallet must resolve to a registered identity.
 *
 * Without an identityId the governance_votes duplicate-vote claim never runs (it keys on the identity),
 * so one person could add base power 10 per throwaway wallet and leave nothing attributable behind. This
 * is the hole the gate exists to close.
 *
 * Known cost: the frontend auto-registers the first wallet fire-and-forget, retrying three times and then
 * only warning (features/auth/providers/AuthProvider.tsx), so a user whose registration silently failed is
 * refused here. The remedy is the same self-service step that an unregistered wallet already needs for the
 * Alliance mint, which is why the message names My Account. Worth measuring the size of that cohort.
 */
export function checkRegistrationGate(profile: VoterIdentity, policy: VotePolicy): VoteEligibility {
  if (policy.requireRegisteredIdentity && !profile.identityId) {
    return {
      eligible: false,
      code: 'NOT_REGISTERED',
      error: 'Add this wallet in My Account before voting.',
    };
  }
  return { eligible: true };
}

/**
 * Tier 2, binding proposals only: the identity must carry a verified social account.
 *
 * An identity is free to create (wallet login), so tier 1 alone costs an attacker nothing; it only makes
 * the vote attributable and dedupable. One social account per vote is the first real cost.
 *
 * Polls stay open, for two reasons. A stuffed Poll distorts a sentiment number and participation is the
 * point, while a stuffed binding vote decides something and can never be recounted. And the one reward a
 * vote unlocks does not multiply: a governance vote satisfies the referral gate's p1 path
 * (box-services/referral/src/eligibility.ts), but a referral CODE pays nothing until a referee reaches
 * ACTIVATED, so holding N codes is worth the same as holding one.
 *
 * Any type that is not Poll counts as binding, which is also what getProposalType yields on a registry
 * miss or RPC error and what Move's get_proposal_type returns for a proposal that was never registered.
 */
export function checkSocialGate(
  profile: VoterIdentity,
  proposalType: number,
  policy: VotePolicy,
): VoteEligibility {
  const isBinding = proposalType !== POLL_PROPOSAL_TYPE;
  if (policy.requireVerifiedSocialForBinding && isBinding && !hasVerifiedSocial(profile)) {
    return {
      eligible: false,
      code: 'SOCIAL_VERIFICATION_REQUIRED',
      error: 'Link your X account or join the Telegram group to vote on a governance proposal.',
    };
  }
  return { eligible: true };
}

/**
 * Both tiers in order. The route applies them separately so it can skip the proposal-type lookup when the
 * social tier cannot refuse; see handleCertificate.
 */
export function checkVoteEligibility(
  profile: VoterIdentity,
  proposalType: number,
  policy: VotePolicy,
): VoteEligibility {
  const registration = checkRegistrationGate(profile, policy);
  if (!registration.eligible) return registration;
  return checkSocialGate(profile, proposalType, policy);
}
