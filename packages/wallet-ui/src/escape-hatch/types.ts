/**
 * Asset Recovery (Escape Hatch) - Types
 *
 * Generic types for cross-app asset recovery UI. Adapters live in host apps
 * (e.g. pado) and may use Sui SDK; this package stays Sui-free.
 */

export interface RecoveryBalance {
  token: string;
  amount: bigint;
  decimals: number;
}

export interface RecoverySimulation {
  summary: string;
  details?: Record<string, string>;
}

export interface RecoveryAction {
  /** Button label, e.g. "Withdraw all to wallet" */
  label: string;
  /** Build + sign + execute the tx. Returns the digest. */
  execute: () => Promise<{ digest: string }>;
  /** Surface a confirmation dialog before executing. */
  destructive?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  /** Optional preview shown in the confirmation dialog. */
  simulate?: () => Promise<RecoverySimulation>;
}

export interface RecoverableItem {
  /** Stable id (e.g. on-chain object id). */
  id: string;
  label: string;
  productName: string;
  balances?: RecoveryBalance[];
  actions: RecoveryAction[];
}

export interface RecoveryAdapter {
  productName: string;
  /** Discover all recoverable items for the given address. */
  discover: (address: string) => Promise<RecoverableItem[]>;
}
