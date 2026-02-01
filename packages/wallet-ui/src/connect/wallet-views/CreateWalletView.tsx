/**
 * Create wallet form view.
 */

export function CreateWalletView({
  password,
  setPassword,
  confirmPassword,
  setConfirmPassword,
  isLoading,
  error,
  handleCreate,
  resetView,
}: {
  password: string;
  setPassword: (v: string) => void;
  confirmPassword: string;
  setConfirmPassword: (v: string) => void;
  isLoading: boolean;
  error: string | null;
  handleCreate: () => void;
  resetView: () => void;
}) {
  return (
    <div className="p-4 w-full ">
      <h3 className="text-sm md:text-base font-medium text-gray-900 dark:text-white mb-3">
        Create New Wallet
      </h3>

      <div className="flex flex-col gap-2">
        <input
          type="password"
          placeholder="Password (min. 8 characters)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="px-3 py-2 bg-gray-100 dark:bg-zinc-700 border border-gray-300 dark:border-zinc-600 rounded text-gray-900 dark:text-white text-sm md:text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={isLoading}
          autoFocus
        />

        <input
          type="password"
          placeholder="Confirm Password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          onKeyDown={(e) =>
            e.key === "Enter" &&
            password.length >= 8 &&
            password === confirmPassword &&
            handleCreate()
          }
          className="px-3 py-2 bg-gray-100 dark:bg-zinc-700 border border-gray-300 dark:border-zinc-600 rounded text-gray-900 dark:text-white text-sm md:text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={isLoading}
        />

        {password.length > 0 && password.length < 8 && (
          <p className="text-xs text-red-400">Password must be at least 8 characters</p>
        )}

        {confirmPassword.length > 0 && password !== confirmPassword && (
          <p className="text-xs text-red-400">Passwords do not match</p>
        )}

        {error && <p className="text-xs text-red-400">{error}</p>}

        <div className="flex gap-2 mt-2">
          <button
            onClick={resetView}
            className="flex-1 px-3 py-2 text-sm md:text-base text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            disabled={isLoading}
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={isLoading || password.length < 8 || password !== confirmPassword}
            className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-zinc-600 disabled:text-gray-500 dark:disabled:text-zinc-400 text-white font-medium rounded text-sm md:text-base transition-colors"
          >
            {isLoading ? "Creating..." : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
