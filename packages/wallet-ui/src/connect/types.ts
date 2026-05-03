/**
 * ViewMode type definitions for the WalletConnect component.
 * Grouped by feature domain for type-safe routing.
 */

export type CoreViewMode =
  | "main"
  | "create"
  | "create-backup"
  | "create-auto-lock"
  | "delete-confirm"
  | "signout-confirm"
  | "import"
  | "export"
  | "export-mnemonic"
  | "send"
  | "receive";

export type AssetViewMode = "staking" | "portfolio" | "add-token" | "nfts" | "asset-recovery";

export type SettingsViewMode = "settings" | "address-book";

export type LedgerViewMode = "ledger-connect" | "ledger-select";

export type PasskeyViewMode = "passkey-setup";

export type NsaViewMode =
  | "nsa-setup"
  | "nsa-info"
  | "nsa-add-signer"
  | "nsa-accept-proposal"
  | "nsa-backup"
  | "nsa-restore"
  | "nsa-guardians"
  | "nsa-recovery"
  | "nsa-guardian-connect";

export type WcViewMode =
  | "wc-main"
  | "wc-pair"
  | "wc-proposal"
  | "wc-request"
  | "wc-session-detail";

export type LinkViewMode = "nasun-link";

export type BackupViewMode = "wallet-backup" | "restore-backup";

export type ViewMode =
  | CoreViewMode
  | AssetViewMode
  | SettingsViewMode
  | LedgerViewMode
  | PasskeyViewMode
  | NsaViewMode
  | WcViewMode
  | LinkViewMode
  | BackupViewMode;
