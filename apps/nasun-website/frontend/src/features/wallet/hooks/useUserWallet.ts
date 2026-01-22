// /src/hooks/wallet/useUserWallet.ts

import { useUserStore } from "../../../store/userStore";

export const useUserWallet = () => {
  // Use separate selectors to avoid creating new objects on every render
  const user = useUserStore((state) => state.user);
  const isLoading = useUserStore((state) => state.isLoading);
  const error = useUserStore((state) => state.error);

  // Note: The original hook had dependencies on wallet actions that are no longer in the user store.
  // This hook is now simplified to only provide user state.
  // Wallet-specific logic should be handled separately, possibly in a new hook or component.

  return {
    user,
    isLoading,
    error,
  };
};