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
import type { ViewMode } from "../types";

export function BackupView({
  mnemonic,
  onConfirm,
}: {
  mnemonic: string;
  onConfirm: () => void;
}) {
  return (
    <div className="w-full">
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
    <div className="w-full">
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
    <div className="w-full">
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
    <div className="w-full">
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
    <div className="w-full">
      <PortfolioPanel onClose={() => setViewMode("main")} />
    </div>
  );
}

export function NasunLinkView({ setViewMode }: { setViewMode: (mode: ViewMode) => void }) {
  return (
    <div className="w-full">
      <NasunLinkWizard
        className="p-4"
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
