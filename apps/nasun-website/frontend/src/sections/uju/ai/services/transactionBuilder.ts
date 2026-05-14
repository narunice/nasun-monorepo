/**
 * Transaction builders for Nasun AI flows. S3 scope: agent profile registration only.
 * Budget / capability / spending limits builders will be ported in S4 alongside
 * AgentDetail and Budgets pages.
 */

import { Transaction } from '@mysten/sui/transactions';
import { BARAM } from '@nasun/devnet-config';

const SUI_CLOCK_ID = '0x6';
const SUI_OBJECT_ID_RE = /^0x[0-9a-fA-F]{64}$/;

function validateObjectId(id: string, label: string): void {
  if (!SUI_OBJECT_ID_RE.test(id)) {
    throw new Error(`Invalid ${label}: expected 0x + 64 hex chars`);
  }
}

export function buildCreateAgentTransaction(params: {
  agentAddress: string;
  name: string;
  role: string;
  capabilities: string[];
}): Transaction {
  validateObjectId(params.agentAddress, 'agentAddress');
  const tx = new Transaction();
  tx.moveCall({
    target: `${BARAM.agentPackageId}::agent_profile::create_agent`,
    arguments: [
      tx.object(BARAM.agentProfileRegistry),
      tx.pure.address(params.agentAddress),
      tx.pure.string(params.name),
      tx.pure.string(params.role),
      tx.pure.vector('string', params.capabilities),
      tx.object(SUI_CLOCK_ID),
    ],
  });
  return tx;
}
