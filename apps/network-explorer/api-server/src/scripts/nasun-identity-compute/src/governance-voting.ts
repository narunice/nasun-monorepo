// C6b governance /config + /voting-power + /certificate -- box port of nasun-common-governance-api
// (index.ts:702-851). Byte-parity with the Lambda: same rank-based voting power formula, same Oracle
// Ed25519 certificate message (domain || voter || proposalId || power || expiresAt), same identity-based
// duplicate-vote guard + on-chain self-heal.
//
// Box vs Lambda differences are operational only: (1) the leaderboard RANK is fetched from a thin residual
// Lambda (box has no DynamoDB); (2) the voting identity + vote-claim/release guard run over the :3211
// identity loopback (box PG governance_votes, which the Lambda already writes today); (3) the Oracle key
// arrives via systemd-creds; (4) Sui RPC uses the timeout-wrapped client. resolveVotingIdentity has NO
// DynamoDB fallback (box is SoT): a 404 = unregistered wallet -> {} (base power, no guard, parity); a 5xx/
// transport error THROWS -> 500 (the loopback IS the SoT, so we must not issue a cert without it).

import { bcs } from '@mysten/sui/bcs';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { GOVERNANCE } from './config';
import { RouteAbort } from './http';
import { makeSuiClient } from './governance-sponsor';

// Oracle keypair, cached. The cert signature is a RAW Ed25519 signature over the message bytes; the box
// uses @mysten/sui Ed25519Keypair.sign (already bundled) rather than @noble/ed25519 (not a box dependency).
// Both produce the IDENTICAL standard Ed25519 (RFC 8032, deterministic) signature for the same 32-byte
// seed + message, so it is byte-parity with the Lambda's ed25519.signAsync and verifies against the same
// Move on-chain ed25519_verify. Keypair.sign(bytes) is the raw primitive (NO intent prefix, unlike
// signTransaction/signPersonalMessage) -- exactly what the Move contract's build_certificate_message expects.
let oracleKeypair: Ed25519Keypair | null = null;
function getOracleKeypair(): Ed25519Keypair {
  if (!oracleKeypair) oracleKeypair = Ed25519Keypair.fromSecretKey(Buffer.from(GOVERNANCE.oraclePrivateKeyHex, 'hex'));
  return oracleKeypair;
}

// V3 voting-power constants (index.ts:78-80).
const BASE_POWER = 10;
const X_LINK_BONUS = 5;
const TELEGRAM_BONUS = 5;

interface VotingIdentity {
  identityId?: string;
  twitterHandle?: string;
  isTelegramMember?: boolean;
}

// --- voting power math (byte-parity index.ts:563-595) ---------------------------------------------

function calculateRankBonus(rank: number | null): number {
  if (rank === null || rank < 1 || rank > 500) return 0;
  if (rank === 1) return 20;
  if (rank <= 100) return Math.round(20 - (rank - 1) * 10 / 99);
  return 10; // rank 101-500
}

function calculateVotingPower(rank: number | null, hasLinkedX: boolean, isTelegramMember: boolean) {
  const rankBonus = calculateRankBonus(rank);
  const xBonus = hasLinkedX ? X_LINK_BONUS : 0;
  const tgBonus = isTelegramMember ? TELEGRAM_BONUS : 0;
  const total = BASE_POWER + xBonus + tgBonus + rankBonus;
  return {
    total,
    breakdown: {
      base: BASE_POWER,
      xLinked: xBonus,
      telegram: tgBonus,
      rankBonus,
      // Backward compatibility for old frontend during deploy transition (parity index.ts:586-591).
      leaderboard: rankBonus,
      onChain: 0,
      battalionAllowlist: 0,
      genesisAllowlist: 0,
    },
    rank: rank !== null && rank <= 500 ? rank : null,
  };
}

// --- loopback / residual clients ------------------------------------------------------------------

/**
 * Resolve a wallet to its canonical voting identity via the :3211 identity loopback (the SAME box read
 * the flipped governance Lambda already serves: wallet -> primary identity + twitterHandle +
 * isTelegramMember). 200 -> profile; 404 -> {} (unregistered wallet, base power, no guard -- parity with
 * the Lambda for a genuinely-unowned wallet); 5xx/transport -> THROWS (the loopback is the SoT, so we
 * fail closed rather than issue a cert/power on a stale read). Address is lowercased (parity).
 */
async function resolveVotingIdentity(walletAddress: string): Promise<VotingIdentity> {
  if (!walletAddress) return {};
  const url = `${GOVERNANCE.identityBaseUrl}/profile/voting-identity?walletAddress=${encodeURIComponent(walletAddress.toLowerCase())}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { authorization: `Bearer ${GOVERNANCE.identityWriteBearer}` },
    signal: AbortSignal.timeout(GOVERNANCE.loopbackTimeoutMs),
  });
  if (res.status === 200) {
    const d = (await res.json()) as Record<string, any>;
    return {
      identityId: typeof d.identityId === 'string' ? d.identityId : undefined,
      twitterHandle: d.twitterHandle || undefined,
      isTelegramMember: d.isTelegramMember === true,
    };
  }
  if (res.status === 404 || res.status === 400) return {}; // unregistered / bad-format wallet
  throw new Error(`voting-identity returned HTTP ${res.status}`);
}

/**
 * Convert twitterHandle -> leaderboard rank via the residual rank Lambda (box has no DynamoDB). Returns
 * null when there is no handle OR on any residual failure -- byte-parity with the Lambda's getUserRank,
 * which catches DDB errors and returns null (a transient miss degrades to a lower rank bonus, never a
 * 500). The raw handle is sent; the residual lowercases it exactly like the Lambda's getUserRank.
 */
async function fetchRank(twitterHandle?: string): Promise<number | null> {
  if (!twitterHandle) return null;
  if (!GOVERNANCE.rankResidualUrl || !GOVERNANCE.leaderboardInternalToken) return null;
  try {
    const res = await fetch(GOVERNANCE.rankResidualUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-internal-auth': GOVERNANCE.leaderboardInternalToken },
      body: JSON.stringify({ twitterHandle }),
      signal: AbortSignal.timeout(GOVERNANCE.rankResidualTimeoutMs),
    });
    if (!res.ok) {
      console.warn(`[compute] voting-rank residual returned HTTP ${res.status} (rank=null)`);
      return null;
    }
    const d = (await res.json()) as { rank?: number | null };
    return typeof d.rank === 'number' ? d.rank : null;
  } catch (err) {
    console.warn('[compute] voting-rank residual failed (rank=null):', err instanceof Error ? err.message : err);
    return null;
  }
}

// POST :3211 /governance/vote-claim { identityId, proposalId } -> { claimed } (INSERT ON CONFLICT DO
// NOTHING; claimed=true means newly inserted = NOT a duplicate). THROWS on box failure so an unreachable
// guard surfaces as a 500 (parity with the Lambda's authoritativeIdentityWriteJson). Idempotent retry.
async function voteClaim(identityId: string, proposalId: string): Promise<boolean> {
  const json = await identityPost('/governance/vote-claim', { identityId, proposalId });
  return json.claimed === true;
}

async function voteRelease(identityId: string, proposalId: string): Promise<void> {
  await identityPost('/governance/vote-release', { identityId, proposalId });
}

async function identityPost(path: string, payload: unknown): Promise<Record<string, any>> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= 1; attempt++) {
    try {
      const res = await fetch(`${GOVERNANCE.identityBaseUrl}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${GOVERNANCE.identityWriteBearer}` },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(GOVERNANCE.loopbackTimeoutMs),
      });
      if (!res.ok) throw new Error(`identity ${path} returned HTTP ${res.status}`);
      return (await res.json()) as Record<string, any>;
    } catch (err) {
      lastErr = err;
      if (attempt < 1) await new Promise((r) => setTimeout(r, 400));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/**
 * Check if a voter has an on-chain VoteProofNFT for a proposal (self-heal: distinguish a real duplicate
 * from a stale governance_votes row). Byte-parity index.ts:261-299: returns true (safe default) on RPC
 * error or pagination, to PREVENT double-voting. Uses the timeout-wrapped Sui client.
 */
async function checkOnChainVoteExists(voterAddress: string, proposalId: string): Promise<boolean> {
  try {
    const suiClient = makeSuiClient();
    const nftTypes = [
      `${GOVERNANCE.originalPackageId}::proposal::VoteProofNFT`,
      `${GOVERNANCE.multiChoicePackageId}::multi_choice_proposal::MultiChoiceVoteProofNFT`,
    ];
    const results = await Promise.all(
      nftTypes.map((structType) =>
        suiClient.getOwnedObjects({
          owner: voterAddress,
          filter: { StructType: structType },
          options: { showContent: true },
        })
      )
    );
    for (const result of results) {
      if (result.hasNextPage) return true; // safe default
      for (const obj of result.data) {
        if (obj.data?.content?.dataType !== 'moveObject') continue;
        const fields = obj.data.content.fields as Record<string, unknown>;
        if (fields.proposal_id === proposalId) return true;
      }
    }
    return false;
  } catch (error) {
    console.error('[compute] On-chain vote check error:', error instanceof Error ? error.message : String(error));
    return true; // safe default: assume voted to prevent double-voting
  }
}

// --- certificate issuance (byte-parity index.ts:618-697) ------------------------------------------

async function issueCertificate(
  profile: VotingIdentity,
  voter: string,
  proposalId: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  try {
    const hasLinkedX = !!profile.twitterHandle;
    const isTelegramMember = profile.isTelegramMember === true;

    const rank = await fetchRank(profile.twitterHandle);
    const power = calculateVotingPower(rank, hasLinkedX, isTelegramMember);
    const votingPower = power.total;

    // Certificate message: domain (utf8) || voter (32B BCS) || proposalId (32B BCS) || power (u64 BE) ||
    // expiresAt (u64 BE). MUST match the Move contract build_certificate_message byte-for-byte.
    const expiresAt = Date.now() + GOVERNANCE.certTtlMs;

    const domainBytes = Buffer.from(GOVERNANCE.domainSeparator, 'utf8');
    const voterBytes = Buffer.from(bcs.Address.serialize(voter).toBytes());
    const proposalIdBytes = Buffer.from(bcs.Address.serialize(proposalId).toBytes());
    const votingPowerBytes = Buffer.alloc(8);
    votingPowerBytes.writeBigUInt64BE(BigInt(votingPower));
    const expiresAtBytes = Buffer.alloc(8);
    expiresAtBytes.writeBigUInt64BE(BigInt(expiresAt));
    const message = Buffer.concat([domainBytes, voterBytes, proposalIdBytes, votingPowerBytes, expiresAtBytes]);

    const signature = await getOracleKeypair().sign(message);

    return {
      status: 200,
      body: {
        voter,
        proposalId,
        votingPower,
        expiresAt,
        signature: Buffer.from(signature).toString('hex'),
        breakdown: power.breakdown,
      },
    };
  } catch (error: unknown) {
    // Roll back the box governance_votes claim (best-effort) so a failed issuance does not leave the
    // proposal permanently "voted" for this identity (parity index.ts:673-686).
    if (profile.identityId) {
      try {
        await voteRelease(profile.identityId, proposalId);
      } catch (rollbackErr) {
        console.error('[compute] Failed to rollback governanceVotes:', rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr));
      }
    }
    console.error('[compute] Certificate issuance error:', error instanceof Error ? error.message : String(error));
    return { status: 500, body: { error: 'Failed to issue certificate' } };
  }
}

// --- route handlers -------------------------------------------------------------------------------

// GET /governance/config -- static (byte-parity index.ts:743-758).
export function handleConfig(): { status: number; body: Record<string, unknown> } {
  return {
    status: 200,
    body: {
      version: 3,
      system: 'rank-based',
      basePower: BASE_POWER,
      xLinkBonus: X_LINK_BONUS,
      telegramBonus: TELEGRAM_BONUS,
      maxRankBonus: 20,
      minRankBonus: 10,
      maxPower: 40,
    },
  };
}

// GET /governance/voting-power?walletAddress=0x.. (byte-parity index.ts:720-740).
export async function handleVotingPower(walletAddress: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const profile = await resolveVotingIdentity(walletAddress || '');
  const hasLinkedX = !!profile.twitterHandle;
  const isTelegramMember = profile.isTelegramMember === true;
  const rank = await fetchRank(profile.twitterHandle);
  const power = calculateVotingPower(rank, hasLinkedX, isTelegramMember);
  return {
    status: 200,
    body: { totalVotingPower: power.total, rank: power.rank, breakdown: power.breakdown },
  };
}

// POST /governance/certificate { voter, proposalId } (byte-parity index.ts:772-851).
export async function handleCertificate(body: any): Promise<{ status: number; body: Record<string, unknown> }> {
  const voter = body?.voter;
  const proposalId = body?.proposalId;
  if (!voter || !proposalId) throw new RouteAbort(400, { error: 'Missing voter or proposalId' });

  // Resolve outside the try so rollback can access identityId (parity index.ts:802).
  const profile = await resolveVotingIdentity(voter as string);

  // Identity-based duplicate-vote prevention via the box governance_votes guard (vote-claim = INSERT ON
  // CONFLICT DO NOTHING -> claimed). On a non-fresh claim, self-heal: check on-chain whether the vote
  // actually landed; a genuine duplicate -> 409, a stale row -> release + reclaim.
  if (profile.identityId) {
    const claimed = await voteClaim(profile.identityId, proposalId as string);
    if (!claimed) {
      const onChainVoted = await checkOnChainVoteExists(voter as string, proposalId as string);
      if (onChainVoted) {
        return { status: 409, body: { error: 'You have already voted on this proposal', code: 'ALREADY_VOTED' } };
      }
      await voteRelease(profile.identityId, proposalId as string);
      const reclaimed = await voteClaim(profile.identityId, proposalId as string);
      if (!reclaimed) {
        return { status: 409, body: { error: 'You have already voted on this proposal', code: 'ALREADY_VOTED' } };
      }
    }
  }

  return issueCertificate(profile, voter as string, proposalId as string);
}
