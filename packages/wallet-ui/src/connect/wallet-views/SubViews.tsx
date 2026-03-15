/**
 * Simple wrapper views for sub-screens that delegate to existing components.
 */

import { useState } from "react";
import { MnemonicBackup } from "../../security/MnemonicBackup";
import { AutoLockSetup } from "../../security/AutoLockSetup";
import { ImportWallet } from "../../security/ImportWallet";
import { ExportPrivateKey } from "../../security/ExportPrivateKey";
import { ExportMnemonic } from "../../security/ExportMnemonic";
import { SendTransaction } from "../../transaction/SendTransaction";
import { StakingPanel } from "../../staking/StakingPanel";
import { SecuritySettings } from "../../security/SecuritySettings";
import { AddressBookPanel } from "../../address/AddressBookPanel";
import { ReceivePanel } from "../../link/ReceivePanel";
import { PortfolioPanel } from "../../portfolio/PortfolioPanel";
import { NasunLinkWizard } from "../../link/NasunLinkWizard";
import { AddERC20Token } from "../../balance/AddERC20Token";
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

export function AutoLockSetupView({ onComplete }: { onComplete: () => void }) {
  return (
    <div className="w-full">
      <AutoLockSetup onComplete={onComplete} />
    </div>
  );
}

export function ImportView({
  onImportMnemonic,
  onImportPrivateKey,
  resetView,
  isLoading,
  initialPrivateKey,
}: {
  onImportMnemonic: (mnemonic: string, pwd: string) => Promise<void>;
  onImportPrivateKey: (key: string, pwd: string) => Promise<void>;
  resetView: () => void;
  isLoading: boolean;
  initialPrivateKey?: string;
}) {
  return (
    <div className="w-full">
      <ImportWallet
        onImportMnemonic={onImportMnemonic}
        onImportPrivateKey={onImportPrivateKey}
        onCancel={resetView}
        isLoading={isLoading}
        initialPrivateKey={initialPrivateKey}
      />
    </div>
  );
}

export function ExportView({
  onExport,
  setViewMode,
  authMode,
}: {
  onExport: (pwd: string) => Promise<string>;
  setViewMode: (mode: ViewMode) => void;
  authMode?: "password" | "biometric";
}) {
  return (
    <div className="w-full">
      <ExportPrivateKey onExport={onExport} onClose={() => setViewMode("main")} authMode={authMode} />
    </div>
  );
}

export function ExportMnemonicView({
  onExport,
  setViewMode,
  authMode,
}: {
  onExport: (pwd: string) => Promise<string | null>;
  setViewMode: (mode: ViewMode) => void;
  authMode?: "password" | "biometric";
}) {
  return (
    <div className="w-full">
      <ExportMnemonic onExport={onExport} onClose={() => setViewMode("main")} authMode={authMode} />
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
        onAddressBook={() => setViewMode("address-book")}
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

export function AddTokenView({ setViewMode }: { setViewMode: (mode: ViewMode) => void }) {
  return (
    <div className="w-full">
      <AddERC20Token onClose={() => setViewMode("main")} />
    </div>
  );
}

export function DeleteConfirmationView({
  onConfirm,
  onCancel,
  showPasskeyWarning = false,
  error,
}: {
  onConfirm: () => void;
  onCancel: () => void;
  showPasskeyWarning?: boolean;
  error?: string | null;
}) {
  const [confirmed, setConfirmed] = useState(false);

  return (
    <div className="p-4 w-full">
      <h3 className="text-base md:text-lg xl:text-xl font-medium text-gray-900 dark:text-white mb-3">
        Remove Wallet
      </h3>

      <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
        <div className="flex items-start gap-2">
          <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div className="text-sm xl:text-base text-red-600 dark:text-red-400">
            <p className="font-medium mb-1">This action cannot be undone</p>
            <p className="text-xs xl:text-sm text-red-500/80 dark:text-red-400/80">
              Your assets are safe on-chain, but you will need your recovery phrase or private key to restore access. Without a backup, your wallet will be permanently lost.
            </p>
          </div>
        </div>
      </div>

      {showPasskeyWarning && (
        <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
          <div className="flex items-start gap-2">
            <svg className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <p className="text-xs xl:text-sm text-amber-700 dark:text-amber-400">
              Passkey wallets are stored on this device only. Without your recovery
              phrase, you cannot restore access on any device.
            </p>
          </div>
        </div>
      )}

      <label className="flex items-start gap-3 cursor-pointer mb-4 select-none">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          className="mt-1 w-4 h-4 rounded border-gray-300 dark:border-zinc-600 text-red-600 focus:ring-red-500 cursor-pointer"
        />
        <span className="text-sm xl:text-base text-gray-700 dark:text-zinc-300">
          I have backed up my recovery phrase and understand this action cannot be undone
        </span>
      </label>

      {error && (
        <p className="text-xs xl:text-sm text-red-500 mb-2">{error}</p>
      )}

      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className="flex-1 px-3 py-2 text-sm xl:text-base text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white border border-gray-300 dark:border-zinc-600 rounded transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={!confirmed}
          className="flex-1 px-3 py-2 text-sm xl:text-base font-medium rounded transition-colors bg-red-600 hover:bg-red-700 text-white disabled:bg-gray-300 dark:disabled:bg-zinc-600 disabled:text-gray-500 dark:disabled:text-zinc-400 disabled:cursor-not-allowed"
        >
          Remove Wallet
        </button>
      </div>
    </div>
  );
}

export function SignOutConfirmationView({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="p-4 w-full">
      <h3 className="text-base md:text-lg xl:text-xl font-medium text-gray-900 dark:text-white mb-3">
        Sign Out
      </h3>

      <p className="text-sm xl:text-base text-gray-600 dark:text-zinc-400 mb-4">
        Are you sure you want to sign out? You can sign back in anytime.
      </p>

      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className="flex-1 px-3 py-2 text-sm xl:text-base text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white border border-gray-300 dark:border-zinc-600 rounded transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          className="flex-1 px-3 py-2 text-sm xl:text-base font-medium rounded transition-colors bg-gray-700 hover:bg-gray-800 dark:bg-zinc-600 dark:hover:bg-zinc-500 text-white"
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}
