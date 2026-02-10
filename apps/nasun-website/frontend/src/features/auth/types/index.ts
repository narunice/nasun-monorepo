import type { UserData } from "../../../store/userStore";

export interface AuthContextType {
  user: UserData | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: Error | null;
  signInWithGoogle: () => Promise<void>;
  signInWithTwitter: () => Promise<void>;
  signInWithMetaMask: (identityId: string, cognitoToken: string | undefined, walletAddress: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}
