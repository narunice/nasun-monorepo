/**
 * useAgentEscrowBalances — read the trading capital actually held inside the
 * agent's on-chain `AgentEscrow` shared object.
 *
 * Why this is separate from `useAgentWalletBalances`:
 *   - `useAgentWalletBalances` calls `suiClient.getAllBalances({owner: agentAddress})`
 *     which only sees coins held directly by the agent's owned wallet (used for
 *     gas).
 *   - The `withdraw_for_action` Move entry only sources from the
 *     `AgentEscrow` shared object — the spend authority lives there, not in
 *     the agent wallet. Trading capital deposited via `escrow::deposit<T>`
 *     therefore *must* be displayed separately or users see "0 NUSDC" right
 *     after a successful deposit (2026-05-20 incident).
 *
 * Reads `balance_keys` from the escrow object plus each dynamic_field
 * `Balance<T>` for known TOKENS entries. Unknown asset types are surfaced as
 * a typed `unknown` entry so future-listed assets do not silently vanish from
 * the UI.
 */

import { useQuery } from '@tanstack/react-query';
import { suiClient } from '@/lib/sui-client';
import { TOKENS, type TokenSymbol } from '../services/network';

export interface AgentEscrowBalance {
  /** TOKENS key when the type matches a known token, otherwise null. */
  symbol: TokenSymbol | null;
  /** Display label: known token's `name`, or a trailing slice of the Move type. */
  label: string;
  /** Fully-qualified Move TypeName, e.g. `${pkg}::nusdc::NUSDC`. */
  type: string;
  decimals: number;
  totalBalanceRaw: bigint;
}

interface DynamicFieldEntry {
  objectId: string;
  objectType: string;
}

interface BalanceContent {
  fields?: {
    value?: string | number;
    name?: { fields?: { name?: string } };
  };
}

function tokenSymbolForType(moveType: string): TokenSymbol | null {
  for (const sym of Object.keys(TOKENS) as TokenSymbol[]) {
    if (TOKENS[sym].type === moveType) return sym;
  }
  return null;
}

/** Parse a `0x2::balance::Balance<T>` object type and recover T. */
function balanceInnerType(objectType: string): string | null {
  const m = objectType.match(/0x[0-9a-f]+::balance::Balance<(.+)>$/i);
  return m ? m[1] : null;
}

async function fetchEscrowBalances(escrowId: string): Promise<AgentEscrowBalance[]> {
  const fields = await suiClient.getDynamicFields({ parentId: escrowId, limit: 50 });
  const entries: DynamicFieldEntry[] = (fields.data ?? []).map((d) => ({
    objectId: d.objectId,
    objectType: d.objectType,
  }));
  if (entries.length === 0) return [];

  const ids = entries.map((e) => e.objectId);
  const objs = await suiClient.multiGetObjects({
    ids,
    options: { showContent: true },
  });

  const out: AgentEscrowBalance[] = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const inner = balanceInnerType(entry.objectType);
    // 0x prefix may or may not appear in dynamic_field object types — normalize.
    const innerNormalized = inner
      ? inner.startsWith('0x')
        ? inner
        : `0x${inner}`
      : null;
    if (!innerNormalized) continue;

    const obj = objs[i];
    const content = obj.data?.content as BalanceContent | undefined;
    const rawVal = content?.fields?.value ?? '0';
    const totalBalanceRaw = BigInt(rawVal);

    const sym = tokenSymbolForType(innerNormalized);
    if (sym) {
      const meta = TOKENS[sym];
      out.push({
        symbol: sym,
        label: meta.symbol,
        type: meta.type,
        decimals: meta.decimals,
        totalBalanceRaw,
      });
    } else {
      // Unknown asset still appears (zero-knowledge fallback). Decimals default
      // to 6 — wrong precision is acceptable for an unknown token because the
      // user can see at least that something is there.
      const tail = innerNormalized.split('::').slice(-1)[0] ?? innerNormalized.slice(0, 8);
      out.push({
        symbol: null,
        label: tail,
        type: innerNormalized,
        decimals: 6,
        totalBalanceRaw,
      });
    }
  }
  return out;
}

export function useAgentEscrowBalances(escrowId: string | null | undefined) {
  return useQuery({
    queryKey: ['nasun-ai', 'agentEscrowBalances', escrowId],
    queryFn: () => fetchEscrowBalances(escrowId!),
    enabled: !!escrowId,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    staleTime: 5_000,
  });
}
