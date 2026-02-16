/**
 * Passkey wallet setup view.
 * Registers a new passkey credential and creates a wallet.
 *
 * Receives createWallet/isLoading/error from the parent's usePasskey() instance
 * to ensure keypair state is shared (fixes disconnected-after-creation bug).
 */

import { useState } from "react";
import type { PasskeyError } from "@nasun/wallet";

const inputClass =
  "px-3 py-2 bg-gray-100 dark:bg-zinc-700 border border-gray-300 dark:border-zinc-600 rounded text-gray-900 dark:text-white text-sm xl:text-base focus:outline-none focus:ring-2 focus:ring-blue-500";

export function PasskeySetupView({
  onBack,
  onCreated,
  createWallet,
  isLoading,
  error,
}: {
  onBack: () => void;
  onCreated: (mnemonic: string) => void;
  createWallet: (userName: string, password?: string) => Promise<{ address: string; mnemonic: string }>;
  isLoading: boolean;
  error: PasskeyError | null;
}) {
  const [userName, setUserName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const passwordMismatch = confirmPassword.length > 0 && password !== confirmPassword;
  const passwordTooShort = password.length > 0 && password.length < 6;
  const canCreate =
    userName.trim().length > 0 &&
    password.length >= 6 &&
    password === confirmPassword &&
    !isLoading;

  const handleCreate = async () => {
    if (!canCreate) return;
    try {
      const { mnemonic } = await createWallet(userName.trim(), password);
      onCreated(mnemonic);
    } catch {
      // Error is stored in hook state
    }
  };

  return (
    <div className="p-4 w-full">
      <h3 className="text-base md:text-lg xl:text-xl font-medium text-gray-900 dark:text-white mb-1">
        Setup Passkey Wallet
      </h3>
      <p className="text-xs xl:text-sm text-gray-500 dark:text-zinc-400 mb-3">
        Use biometrics (Face ID, Touch ID, Windows Hello) to secure your wallet.
      </p>

      <div className="flex flex-col gap-2">
        <input
          type="text"
          placeholder="Display name (e.g., My Wallet)"
          value={userName}
          onChange={(e) => setUserName(e.target.value)}
          className={inputClass}
          disabled={isLoading}
          autoFocus
        />

        <input
          type="password"
          placeholder="Wallet password (min 6 characters)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
          disabled={isLoading}
        />

        <input
          type="password"
          placeholder="Confirm password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && canCreate && handleCreate()}
          className={inputClass}
          disabled={isLoading}
        />

        {passwordTooShort && (
          <p className="text-xs text-amber-500">Password must be at least 6 characters</p>
        )}
        {passwordMismatch && (
          <p className="text-xs text-red-400">Passwords don't match</p>
        )}

        <p className="text-[10px] xl:text-xs text-gray-400 dark:text-zinc-500">
          Password protects your wallet if your device doesn't support hardware encryption.
          On supported devices, only biometrics are needed to unlock.
        </p>

        {error && (
          <p className="text-xs xl:text-sm text-red-400">{error.message}</p>
        )}

        <div className="flex gap-2 mt-2">
          <button
            onClick={onBack}
            className="flex-1 px-3 py-2 text-sm xl:text-base text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            disabled={isLoading}
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!canCreate}
            className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-zinc-600 disabled:text-gray-500 dark:disabled:text-zinc-400 text-white font-medium rounded text-sm xl:text-base transition-colors flex items-center justify-center gap-2"
          >
            {isLoading ? (
              "Authenticating..."
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4"
                  />
                </svg>
                Create
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
