export { AuthProvider } from './providers/AuthProvider';
export { useAuth } from './hooks/useAuth';
export type { AuthContextType } from './types';

// NOTE: Callback and WalletLoginButton are intentionally NOT re-exported here.
// They pull in heavy dependencies (@nasun/wallet ~497KB, wagmi/RainbowKit)
// that would contaminate the initial bundle via barrel imports.
// Import them directly when needed:
//   - Callback: import("@/features/auth/components/Callback")
//   - WalletLoginButton: import("@/features/auth/components/WalletLoginButton")
