import { suiClient } from '@/lib/sui-client';
import { TOKENS } from './network';

const GAS_ERROR_PATTERNS = [
  'Insufficient gas',
  'No valid gas coins',
  'gas coin balance',
  'too low',
  'GasBalanceTooLow',
];

export function isGasInsufficientError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return GAS_ERROR_PATTERNS.some((p) => msg.includes(p));
}

const MIN_GAS_MIST = 10_000_000n;

export async function preflightGasCheck(address: string): Promise<boolean> {
  const b = await suiClient.getBalance({ owner: address, coinType: TOKENS.NASUN.type });
  return BigInt(b.totalBalance) >= MIN_GAS_MIST;
}
