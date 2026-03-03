import type { UserData } from "../../../store/userStore";

export interface AuthContextType {
  user: UserData | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: Error | null;
  signInWithGoogle: () => Promise<void>;
  signInWithTwitter: () => Promise<void>;
  signInWithWallet: (identityId: string, cognitoToken: string | undefined, walletAddress: string, connectorName?: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}
