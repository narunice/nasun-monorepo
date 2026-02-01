/**
 * Simple wrapper views for sub-screens that delegate to existing components.
 */

import { MnemonicBackup } from "../../security/MnemonicBackup";
import { ImportWallet } from "../../security/ImportWallet";
import { ExportPrivateKey } from "../../security/ExportPrivateKey";
import { SendTransaction } from "../../transaction/SendTransaction";
import { StakingPanel } from "../../staking/StakingPanel";
import { SecuritySettings } from "../../security/SecuritySettings";
import { AddressBookPanel } from "../../address/AddressBookPanel";
import { ReceivePanel } from "../../link/ReceivePanel";
import { PortfolioPanel } from "../../portfolio/PortfolioPanel";
import { NasunLinkWizard } from "../../link/NasunLinkWizard";
import type { ViewMode } from "../LockedStateUI";

export function BackupView({
  mnemonic,
  onConfirm,
}: {
  mnemonic: string;
  onConfirm: () => void;
}) {
  return (
    <div className="p-2 w-full">
      <MnemonicBackup mnemonic={mnemonic} onConfirm={onConfirm} />
    </div>
  );
}

export function ImportView({
  onImportMnemonic,
  onImportPrivateKey,
  resetView,
  isLoading,
}: {
  onImportMnemonic: (mnemonic: string, pwd: string) => Promise<void>;
  onImportPrivateKey: (key: string, pwd: string) => Promise<void>;
  resetView: () => void;
  isLoading: boolean;
}) {
  return (
    <div className="p-2 w-full">
      <ImportWallet
        onImportMnemonic={onImportMnemonic}
        onImportPrivateKey={onImportPrivateKey}
        onCancel={resetView}
        isLoading={isLoading}
      />
    </div>
  );
}

export function ExportView({
  onExport,
  setViewMode,
}: {
  onExport: (pwd: string) => Promise<string>;
  setViewMode: (mode: ViewMode) => void;
}) {
  return (
    <div className="p-2 w-full">
      <ExportPrivateKey onExport={onExport} onClose={() => setViewMode("main")} />
    </div>
  );
}

export function SendView({
  setViewMode,
  setSendRecipient,
  initialRecipient,
}: {
  setViewMode: (mode: ViewMode) => void;
  setSendRecipient: (addr: string | undefined) => void;
  initialRecipient: string | undefined;
}) {
  return (
    <div className="p-2 w-full">
      <SendTransaction
        onClose={() => {
          setViewMode("main");
          setSendRecipient(undefined);
        }}
        onSuccess={() => {
          setSendRecipient(undefined);
        }}
        initialRecipient={initialRecipient}
      />
    </div>
  );
}

export function StakingView({ setViewMode }: { setViewMode: (mode: ViewMode) => void }) {
  return (
    <div className="w-full">
      <StakingPanel onClose={() => setViewMode("main")} compact />
    </div>
  );
}

export function PortfolioView({ setViewMode }: { setViewMode: (mode: ViewMode) => void }) {
  return (
    <div className="py-3 px-4 w-full">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-medium text-gray-900 dark:text-white md:text-base">Portfolio</h3>
        <button
          onClick={() => setViewMode("main")}
          className="text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-white transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>
      <PortfolioPanel />
    </div>
  );
}

export function NasunLinkView({ setViewMode }: { setViewMode: (mode: ViewMode) => void }) {
  return (
    <div className="py-3 px-4 w-full">
      <NasunLinkWizard
        onCancel={() => setViewMode("main")}
        onSuccess={() => {
          // Stay on success screen, user can click Done to go back
        }}
      />
    </div>
  );
}

export function SettingsView({ setViewMode }: { setViewMode: (mode: ViewMode) => void }) {
  return <SecuritySettings onClose={() => setViewMode("main")} />;
}

export function AddressBookView({
  setViewMode,
  setSendRecipient,
  sendRecipient,
}: {
  setViewMode: (mode: ViewMode) => void;
  setSendRecipient: (addr: string | undefined) => void;
  sendRecipient: string | undefined;
}) {
  return (
    <AddressBookPanel
      onClose={() => {
        setViewMode("main");
        setSendRecipient(undefined);
      }}
      onSend={(address) => {
        setSendRecipient(address);
        setViewMode("send");
      }}
      initialAddress={sendRecipient}
    />
  );
}

export function ReceiveView({ setViewMode }: { setViewMode: (mode: ViewMode) => void }) {
  return <ReceivePanel onClose={() => setViewMode("main")} />;
}
