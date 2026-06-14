// C6a governance /sponsor -- box port of nasun-common-governance-api POST /sponsor (index.ts:854-993).
// Sponsors ONLY Poll-type proposals (Governance proposals require user gas). Byte-parity with the lambda:
// same 2-command whitelist (mint_certificate then vote_with_certificate), same proposal-id extraction,
// same getProposalType registry lookup, same Ed25519 sponsor signature over the built tx bytes.
//
// The ONLY differences from the lambda are operational, not behavioral: (1) the Sui RPC client wraps a
// per-call AbortSignal.timeout (the long-lived box must cap a wedged socket; the lambda relied on its 60s
// ceiling + per-invoke isolation), and (2) the sponsor key arrives via systemd-creds, not Secrets Manager.

import { SuiClient, SuiHTTPTransport } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { fromBase64, toBase64 } from '@mysten/bcs';
import { GOVERNANCE } from './config';
import { RouteAbort } from './http';

// Cached sponsor keypair (parity with the lambda module-scope cache).
let sponsorKeypair: Ed25519Keypair | null = null;
function getSponsorKeypair(): Ed25519Keypair {
  if (sponsorKeypair) return sponsorKeypair;
  sponsorKeypair = Ed25519Keypair.fromSecretKey(Buffer.from(GOVERNANCE.sponsorPrivateKeyHex, 'hex'));
  return sponsorKeypair;
}

// Sui RPC client with a per-call egress timeout (box hardening; see file header). One client per request
// is fine -- the transport is cheap and the lambda also constructed one per invoke. Exported so the
// certificate route (governance-voting.ts checkOnChainVoteExists) reuses the same timeout-wrapped client.
export function makeSuiClient(): SuiClient {
  return new SuiClient({
    transport: new SuiHTTPTransport({
      url: GOVERNANCE.suiRpcUrl,
      fetch: ((input: any, init: any) =>
        fetch(input, { ...(init || {}), signal: AbortSignal.timeout(GOVERNANCE.rpcTimeoutMs) })) as typeof fetch,
    }),
  });
}

// Allowed MoveCall targets for the sponsor whitelist (parity index.ts:140-144).
function allowedTargets(): Set<string> {
  return new Set([
    `${GOVERNANCE.packageId}::voting_power::mint_certificate`,
    `${GOVERNANCE.packageId}::proposal::vote_with_certificate`,
    `${GOVERNANCE.packageId}::multi_choice_proposal::vote_with_certificate`,
  ]);
}

// Parity with index.ts:146-176 validateTxKind: exactly 2 MoveCall commands in the order
// [mint_certificate, vote_with_certificate], both targeting the governance package whitelist.
function validateTxKind(tx: Transaction): { valid: boolean; error?: string } {
  const txData = tx.getData();
  const commands = txData.commands;

  if (commands.length !== 2) {
    return { valid: false, error: `Expected 2 commands, got ${commands.length}` };
  }

  const expectedFunctions = ['mint_certificate', 'vote_with_certificate'];
  const targets = allowedTargets();

  for (let i = 0; i < commands.length; i++) {
    const cmd = commands[i];
    if (cmd.$kind !== 'MoveCall') {
      return { valid: false, error: `Command ${i} is not MoveCall: ${cmd.$kind}` };
    }
    const moveCall = cmd.MoveCall;
    const target = `${moveCall.package}::${moveCall.module}::${moveCall.function}`;
    if (!targets.has(target)) {
      return { valid: false, error: `Unauthorized target: ${target}` };
    }
    if (moveCall.function !== expectedFunctions[i]) {
      return { valid: false, error: `Wrong order at ${i}: expected ${expectedFunctions[i]}, got ${moveCall.function}` };
    }
  }
  return { valid: true };
}

// Parity with index.ts:178-201 extractProposalIdFromTx: pull the proposal object id out of the
// vote_with_certificate call's first Input argument (Imm-or-owned OR shared object).
function extractProposalIdFromTx(tx: Transaction): string | null {
  const txData = tx.getData();
  const commands = txData.commands;
  for (const cmd of commands) {
    if (cmd.$kind === 'MoveCall' && cmd.MoveCall.function === 'vote_with_certificate') {
      const args = cmd.MoveCall.arguments;
      if (args && args.length > 0 && args[0].$kind === 'Input') {
        const inputIndex = args[0].Input;
        const input = txData.inputs[inputIndex];
        if (input && input.$kind === 'Object') {
          const obj = input.Object;
          if (obj.ImmOrOwnedObject) return obj.ImmOrOwnedObject.objectId;
          if (obj.SharedObject) return obj.SharedObject.objectId;
        }
      }
    }
  }
  return null;
}

// Parity with index.ts:203-252 getProposalType: 0=Governance (NOT sponsored), 1=Poll (sponsored).
// Defaults to 0 (Governance) on any registry miss / RPC error -- fail-closed against sponsoring an
// unknown proposal type (the lambda's safe default).
async function getProposalType(suiClient: SuiClient, proposalId: string): Promise<number> {
  if (!GOVERNANCE.proposalTypeRegistryId) {
    console.warn('[compute] PROPOSAL_TYPE_REGISTRY_ID not configured, defaulting to Governance');
    return 0;
  }
  try {
    const registry = await suiClient.getObject({
      id: GOVERNANCE.proposalTypeRegistryId,
      options: { showContent: true },
    });
    if (!registry.data?.content || registry.data.content.dataType !== 'moveObject') {
      console.warn('[compute] Failed to get ProposalTypeRegistry');
      return 0;
    }
    const fields = registry.data.content.fields as Record<string, unknown>;
    const typesTable = fields.types as { fields: { id: { id: string } } } | undefined;
    if (!typesTable?.fields?.id?.id) {
      console.warn('[compute] Types table not found in registry');
      return 0;
    }
    const dynamicField = await suiClient.getDynamicFieldObject({
      parentId: typesTable.fields.id.id,
      name: { type: '0x2::object::ID', value: proposalId },
    });
    if (!dynamicField.data?.content || dynamicField.data.content.dataType !== 'moveObject') {
      console.log(`[compute] Proposal ${proposalId} not in registry, defaulting to Governance`);
      return 0;
    }
    const dfFields = dynamicField.data.content.fields as Record<string, unknown>;
    const value = dfFields.value as { variant: string } | undefined;
    if (!value?.variant) return 0;
    return value.variant === 'Poll' ? 1 : 0;
  } catch (error) {
    console.error('[compute] Failed to get proposal type:', error instanceof Error ? error.message : String(error));
    return 0;
  }
}

/**
 * POST /governance/sponsor { txKindBytes, sender } -> { txBytes, sponsorSignature } | error.
 * Byte-parity with index.ts:854-993. Throws RouteAbort for the pre-flight 400s; returns explicit
 * { status, body } for the 200 / 400 NOT_SPONSORED / 409 ALREADY_VOTED / 500 paths.
 */
export async function handleSponsor(body: any): Promise<{ status: number; body: Record<string, unknown> }> {
  const txKindBytes = body?.txKindBytes;
  const sender = body?.sender;
  if (!txKindBytes || !sender) {
    throw new RouteAbort(400, { error: 'Missing txKindBytes or sender' });
  }

  try {
    const tx = Transaction.fromKind(fromBase64(txKindBytes));

    const validation = validateTxKind(tx);
    if (!validation.valid) {
      console.error('[compute] Transaction validation failed:', validation.error);
      return { status: 400, body: { error: 'Transaction validation failed', details: validation.error } };
    }

    const proposalId = extractProposalIdFromTx(tx);
    if (!proposalId) {
      return { status: 400, body: { error: 'Could not extract proposal ID from transaction' } };
    }

    const suiClient = makeSuiClient();

    const proposalType = await getProposalType(suiClient, proposalId);
    if (proposalType === 0) {
      console.log(`[compute] Rejecting sponsor request for Governance proposal ${proposalId}`);
      return {
        status: 400,
        body: {
          error: 'Governance proposals require user gas payment',
          code: 'NOT_SPONSORED',
          proposalType: 'Governance',
          proposalId,
        },
      };
    }

    console.log(`[compute] Sponsoring Poll proposal ${proposalId}`);
    const keypair = getSponsorKeypair();
    const sponsorAddress = keypair.getPublicKey().toSuiAddress();

    const coins = await suiClient.getCoins({ owner: sponsorAddress, coinType: '0x2::sui::SUI' });
    if (coins.data.length === 0) {
      return { status: 500, body: { error: 'Sponsor has no gas coins' } };
    }

    tx.setSender(sender);
    tx.setGasOwner(sponsorAddress);
    tx.setGasPayment([
      {
        objectId: coins.data[0].coinObjectId,
        version: coins.data[0].version,
        digest: coins.data[0].digest,
      },
    ]);

    const txBytes = await tx.build({ client: suiClient });
    const sponsorSignature = await keypair.signTransaction(txBytes);

    console.log(`[compute] Transaction sponsored for ${sender}`);
    return {
      status: 200,
      body: { txBytes: toBase64(txBytes), sponsorSignature: sponsorSignature.signature },
    };
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('[compute] Sponsor error:', errorMsg);
    // Detect "already voted" abort from the Move contract (ECertificateAlreadyIssued = 6), parity index.ts:976.
    if (errorMsg.includes('MoveAbort') && errorMsg.includes(', 6)')) {
      return { status: 409, body: { error: 'You have already voted on this proposal', code: 'ALREADY_VOTED' } };
    }
    return { status: 500, body: { error: 'Failed to sponsor transaction' } };
  }
}
