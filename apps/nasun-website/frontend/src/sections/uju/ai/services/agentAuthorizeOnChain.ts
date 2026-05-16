/**
 * On-chain authorization step in the Activate Agent flow: the user's
 * wallet calls `capability::set_delegated_agent(cap, agent_address)` so
 * the spawned PM2 runtime can install pending-proposal locks with its
 * own keypair (otherwise `capability::assert_owner` aborts code 558).
 *
 * Runs AFTER the SSM vault upload because the agent address used here
 * MUST be the address derived from the keypair that the chat-server is
 * about to spawn -- the two paths read the same on-chain capability
 * and must agree on who is delegated.
 *
 * Failure here does not poison the SSM upload (vault has already
 * committed) but the spawned agent will fall back to "no on-chain
 * lock, no inline keyboard" behavior until the owner re-runs this step
 * (e.g. via a future "Re-authorize" button). We surface the error to
 * the modal so the user knows what's degraded.
 */

import { Transaction } from '@mysten/sui/transactions';
import type { Signer } from '@nasun/wallet';
import { getSuiClient } from '@nasun/wallet';
import { BARAM } from '@nasun/devnet-config';

const SUI_OBJECT_ID_RE = /^0x[0-9a-fA-F]{64}$/;
const SUI_ADDRESS_RE = /^0x[0-9a-fA-F]{1,64}$/;

export async function authorizeAgentOnChain(
  signer: Signer,
  walletAddress: string,
  capabilityId: string,
  agentAddress: string,
): Promise<string> {
  if (!SUI_OBJECT_ID_RE.test(capabilityId)) {
    throw new Error('Invalid capabilityId');
  }
  if (!SUI_ADDRESS_RE.test(agentAddress)) {
    throw new Error('Invalid agentAddress');
  }
  if (!SUI_ADDRESS_RE.test(walletAddress)) {
    throw new Error('Invalid walletAddress');
  }

  const aerPackageId = BARAM.aerPackageId;
  if (!aerPackageId) {
    throw new Error('AER package id missing from devnet config');
  }

  const tx = new Transaction();
  tx.setSender(walletAddress);
  tx.moveCall({
    target: `${aerPackageId}::capability::set_delegated_agent`,
    arguments: [
      tx.object(capabilityId),
      tx.pure.address(agentAddress),
    ],
  });

  const suiClient = getSuiClient();
  const txBytes = await tx.build({ client: suiClient });
  const { signature } = await signer.sign(txBytes);

  const result = await suiClient.executeTransactionBlock({
    transactionBlock: txBytes,
    signature,
    options: { showEffects: true },
  });

  if (result.effects?.status?.status !== 'success') {
    const err = result.effects?.status?.error ?? 'unknown move error';
    throw new Error(`authorize_failed: ${err}`);
  }
  return result.digest;
}
