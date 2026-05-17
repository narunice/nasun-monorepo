import { Transaction } from '@mysten/sui/transactions';
import { suiClient } from '@/lib/sui-client';
import { loadAgentKeypair } from './agentKeyStorage';
import { getCoinsByType } from './coinService';
import { TOKENS } from './network';

const MIN_GAS_RESERVE_MIST = 50_000_000n;

export async function executeTradingWithdraw(args: {
  walletAddress: string;
  agentAddress: string;
  agentId: string;
  passphrase: string;
  coinType: string;
  amountRaw: bigint;
}): Promise<string> {
  const kp = await loadAgentKeypair(args.agentId, args.walletAddress, args.passphrase);
  if (!kp) {
    throw new Error('No stored key for this agent. Re-create or import.');
  }
  if (kp.toSuiAddress().toLowerCase() !== args.agentAddress.toLowerCase()) {
    throw new Error('Decrypted key does not match agent address.');
  }

  const tx = new Transaction();
  tx.setSender(args.agentAddress);

  const recipient = args.walletAddress;

  if (args.coinType === TOKENS.NASUN.type) {
    const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(args.amountRaw)]);
    tx.transferObjects([coin], tx.pure.address(recipient));
  } else {
    const coins = await getCoinsByType(suiClient, args.agentAddress, args.coinType, args.amountRaw);
    if (coins.length === 0) {
      throw new Error(`Agent has no balance for this token.`);
    }
    const [primary, ...rest] = coins;
    if (rest.length > 0) {
      tx.mergeCoins(
        tx.object(primary.objectId),
        rest.map((c) => tx.object(c.objectId)),
      );
    }
    const [out] = tx.splitCoins(tx.object(primary.objectId), [tx.pure.u64(args.amountRaw)]);
    tx.transferObjects([out], tx.pure.address(recipient));
  }

  const txBytes = await tx.build({ client: suiClient });
  const { signature } = await kp.signTransaction(txBytes);

  const result = await suiClient.executeTransactionBlock({
    transactionBlock: txBytes,
    signature,
    options: { showEffects: true },
  });

  if (result.effects?.status?.status !== 'success') {
    throw new Error(result.effects?.status?.error ?? 'Transaction failed');
  }

  return result.digest;
}

export function computeNasunMaxWithdraw(agentNasunRaw: bigint): bigint {
  return agentNasunRaw > MIN_GAS_RESERVE_MIST ? agentNasunRaw - MIN_GAS_RESERVE_MIST : 0n;
}
