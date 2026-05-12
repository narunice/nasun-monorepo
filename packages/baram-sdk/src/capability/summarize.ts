/**
 * Human-readable mutation summaries for hardware-wallet signing (Plan B §5.4).
 *
 * Ledger / Trezor users approving a Capability mutation tx see opaque BCS
 * bytes by default. A mis-set risk_limits at signing time is expensive to
 * recover from (revoke + recreate + relink). These summarizers produce a
 * deterministic one-line description that the frontend renders above the
 * "Sign tx" button. The signed tx remains the canonical source of truth;
 * the summary is UX only.
 *
 * Determinism contract: same args → same string. Tests verify both
 * directions and a few representative diffs.
 */

import type { PauseMode, RiskLimits } from './types';

export type MutationArgs =
  | { kind: 'set_pause_mode'; newMode: PauseMode; previousMode?: PauseMode }
  | {
      kind: 'update_risk_limits';
      newLimits: RiskLimits;
      previousLimits?: RiskLimits;
    }
  | {
      kind: 'replace_allowed_actions';
      newActions: string[];
      previousActions?: string[];
    }
  | {
      kind: 'replace_allowed_assets';
      newAssets: string[];
      previousAssets?: string[];
    }
  | {
      kind: 'replace_allowed_targets';
      newTargets: string[];
      previousTargets?: string[];
    }
  | { kind: 'revoke' };

/**
 * Returns a single human-readable line. Compact enough for Ledger's
 * narrow screen; the frontend may wrap it for desktop displays.
 */
export function summarizeMutation(args: MutationArgs): string {
  switch (args.kind) {
    case 'set_pause_mode':
      return summarizePause(args.newMode, args.previousMode);
    case 'update_risk_limits':
      return summarizeRisk(args.newLimits, args.previousLimits);
    case 'replace_allowed_actions':
      return summarizeList('actions', args.newActions, args.previousActions);
    case 'replace_allowed_assets':
      return summarizeList('assets', args.newAssets, args.previousAssets);
    case 'replace_allowed_targets':
      return summarizeList('targets', args.newTargets, args.previousTargets);
    case 'revoke':
      return 'Revoke capability (terminal). Agent execution will halt.';
  }
}

function summarizePause(next: PauseMode, prev?: PauseMode): string {
  const tail = prev ? ` (was ${prev.toUpperCase()})` : '';
  return `Set pause mode: ${next.toUpperCase()}${tail}`;
}

function summarizeRisk(next: RiskLimits, prev?: RiskLimits): string {
  if (!prev) {
    return (
      `Risk limits: max_notional=${next.maxNotionalPerAction.toString()}, ` +
      `max_daily_loss=${next.maxDailyLoss.toString()}, ` +
      `slippage=${next.maxSlippageBps}bps, ` +
      `stop_loss=${next.stopLossBps}bps, take_profit=${next.takeProfitBps}bps`
    );
  }
  const parts: string[] = [];
  if (next.maxNotionalPerAction !== prev.maxNotionalPerAction) {
    parts.push(
      `max_notional ${prev.maxNotionalPerAction.toString()} -> ${next.maxNotionalPerAction.toString()}`,
    );
  }
  if (next.maxDailyLoss !== prev.maxDailyLoss) {
    parts.push(`max_daily_loss ${prev.maxDailyLoss.toString()} -> ${next.maxDailyLoss.toString()}`);
  }
  if (next.maxSlippageBps !== prev.maxSlippageBps) {
    parts.push(`slippage ${prev.maxSlippageBps} -> ${next.maxSlippageBps}bps`);
  }
  if (next.stopLossBps !== prev.stopLossBps) {
    parts.push(`stop_loss ${prev.stopLossBps} -> ${next.stopLossBps}bps`);
  }
  if (next.takeProfitBps !== prev.takeProfitBps) {
    parts.push(`take_profit ${prev.takeProfitBps} -> ${next.takeProfitBps}bps`);
  }
  if (parts.length === 0) return 'Risk limits change: no-op (identical values)';
  return `Risk limits change: ${parts.join(', ')}`;
}

function summarizeList(
  label: 'actions' | 'assets' | 'targets',
  next: string[],
  prev?: string[],
): string {
  if (!prev) {
    const head = next.slice(0, 3).join(', ');
    const overflow = next.length > 3 ? ` (+${next.length - 3} more)` : '';
    return `Set allowed ${label} to [${head}${overflow}]`;
  }
  const prevSet = new Set(prev);
  const nextSet = new Set(next);
  const added = next.filter((x) => !prevSet.has(x));
  const removed = prev.filter((x) => !nextSet.has(x));
  if (added.length === 0 && removed.length === 0) {
    return `Allowed ${label} change: no-op (same set)`;
  }
  const parts: string[] = [];
  if (added.length > 0) parts.push(`+${added.length} (${trunc(added)})`);
  if (removed.length > 0) parts.push(`-${removed.length} (${trunc(removed)})`);
  return `Allowed ${label} change: ${parts.join(', ')}`;
}

function trunc(items: string[]): string {
  const head = items.slice(0, 2).join(', ');
  return items.length > 2 ? `${head}, +${items.length - 2}` : head;
}
