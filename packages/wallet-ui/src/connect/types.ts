/**
 * ViewMode type definitions for the WalletConnect component.
 * Grouped by feature domain for type-safe routing.
 */

export type CoreViewMode =
  | "main"
  | "create"
  | "create-backup"
  | "import"
  | "export"
  | "send"
  | "receive";

export type AssetViewMode = "staking" | "portfolio";

export type SettingsViewMode = "settings" | "address-book";

export type LedgerViewMode = "ledger-connect" | "ledger-select";

export type NsaViewMode =
  | "nsa-setup"
  | "nsa-info"
  | "nsa-add-signer"
  | "nsa-accept-proposal"
  | "nsa-backup"
  | "nsa-guardians"
  | "nsa-recovery";

export type WcViewMode =
  | "wc-main"
  | "wc-pair"
  | "wc-proposal"
  | "wc-request"
  | "wc-session-detail";

export type LinkViewMode = "nasun-link";

export type ViewMode =
  | CoreViewMode
  | AssetViewMode
  | SettingsViewMode
  | LedgerViewMode
  | NsaViewMode
  | WcViewMode
  | LinkViewMode;
