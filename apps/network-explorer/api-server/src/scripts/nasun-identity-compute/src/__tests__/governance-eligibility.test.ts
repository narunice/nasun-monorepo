/**
 * Sybil gate on governance certificate issuance.
 *
 * /certificate is the only producer of the Oracle signature that voting_power::mint_certificate verifies
 * on chain, so these two tiers are what stands between a throwaway wallet and a counted vote. This
 * service has no other tests, so both directions are asserted: that an armed gate refuses, and that a
 * relaxed gate admits.
 *
 * Run with:
 *   npx --no-install tsx --test \
 *     apps/network-explorer/api-server/src/scripts/nasun-identity-compute/src/__tests__/governance-eligibility.test.ts
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  checkRegistrationGate,
  checkSocialGate,
  checkVoteEligibility,
  hasVerifiedSocial,
  POLL_PROPOSAL_TYPE,
  type VotePolicy,
} from '../governance-eligibility.js';

const GOVERNANCE_TYPE = 0; // binding, per the Move registry encoding

const ARMED: VotePolicy = { requireRegisteredIdentity: true, requireVerifiedSocialForBinding: true };
const SOCIAL_OFF: VotePolicy = { requireRegisteredIdentity: true, requireVerifiedSocialForBinding: false };
const ALL_OFF: VotePolicy = { requireRegisteredIdentity: false, requireVerifiedSocialForBinding: false };

const unregistered = {};
const registered = { identityId: 'id-1' };
const withX = { identityId: 'id-1', twitterHandle: 'someone' };
const withTelegram = { identityId: 'id-1', isTelegramMember: true };

describe('gates armed (the deployed default)', () => {
  test('an unregistered wallet is refused, even on a Poll', () => {
    // The hole: with no identityId the governance_votes dedup never runs, so one person could add base
    // power 10 per throwaway wallet and leave nothing attributable behind.
    const decision = checkVoteEligibility(unregistered, POLL_PROPOSAL_TYPE, ARMED);
    assert.equal(decision.eligible, false);
    assert.equal(decision.code, 'NOT_REGISTERED');
  });

  test('registration is reported before the social tier', () => {
    assert.equal(checkVoteEligibility(unregistered, GOVERNANCE_TYPE, ARMED).code, 'NOT_REGISTERED');
  });

  test('a registered wallet with no social may vote on a Poll', () => {
    assert.equal(checkVoteEligibility(registered, POLL_PROPOSAL_TYPE, ARMED).eligible, true);
  });

  test('a registered wallet with no social is refused on a binding proposal', () => {
    const decision = checkVoteEligibility(registered, GOVERNANCE_TYPE, ARMED);
    assert.equal(decision.eligible, false);
    assert.equal(decision.code, 'SOCIAL_VERIFICATION_REQUIRED');
  });

  test('either social account satisfies the binding tier', () => {
    assert.equal(checkVoteEligibility(withX, GOVERNANCE_TYPE, ARMED).eligible, true);
    assert.equal(checkVoteEligibility(withTelegram, GOVERNANCE_TYPE, ARMED).eligible, true);
  });

  test('any type other than Poll counts as binding', () => {
    // getProposalType degrades to 0 on a registry miss or RPC error, and Move's get_proposal_type returns
    // 0 for a proposal that was never registered. An unexpected value must not read as a Poll either.
    for (const type of [0, 2, 99, -1]) {
      assert.equal(
        checkVoteEligibility(registered, type, ARMED).code,
        'SOCIAL_VERIFICATION_REQUIRED',
        `type ${type} should be treated as binding`,
      );
    }
  });

  test('a refusal carries a message the UI can show', () => {
    for (const decision of [
      checkVoteEligibility(unregistered, POLL_PROPOSAL_TYPE, ARMED),
      checkVoteEligibility(registered, GOVERNANCE_TYPE, ARMED),
    ]) {
      assert.ok(decision.error && decision.error.length > 0, 'refusal must explain itself');
    }
  });
});

describe('hasVerifiedSocial', () => {
  test('isTelegramMember must be exactly true, and an empty handle is not a handle', () => {
    assert.equal(hasVerifiedSocial({ isTelegramMember: true }), true);
    assert.equal(hasVerifiedSocial({ twitterHandle: 'someone' }), true);
    assert.equal(hasVerifiedSocial({ isTelegramMember: false }), false);
    assert.equal(hasVerifiedSocial({ twitterHandle: '' }), false);
    assert.equal(hasVerifiedSocial({}), false);
  });
});

describe('gates relaxed', () => {
  // Negative direction: proves the flags drive the decision, rather than the suite only ever observing a
  // hardcoded refusal.
  test('both off admits an unregistered wallet on a binding proposal', () => {
    assert.equal(checkVoteEligibility(unregistered, GOVERNANCE_TYPE, ALL_OFF).eligible, true);
  });

  test('social off still requires registration', () => {
    assert.equal(checkVoteEligibility(registered, GOVERNANCE_TYPE, SOCIAL_OFF).eligible, true);
    assert.equal(checkVoteEligibility(unregistered, GOVERNANCE_TYPE, SOCIAL_OFF).code, 'NOT_REGISTERED');
  });

  test('each tier can be read on its own', () => {
    assert.equal(checkRegistrationGate(registered, ARMED).eligible, true);
    assert.equal(checkSocialGate(registered, POLL_PROPOSAL_TYPE, ARMED).eligible, true);
    assert.equal(checkSocialGate(registered, GOVERNANCE_TYPE, ARMED).eligible, false);
  });
});
