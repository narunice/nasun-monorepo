import type { UserData } from "../../../store/userStore";

export interface AuthContextType {
  user: UserData | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: Error | null;
  signInWithWallet: (identityId: string, cognitoToken: string | undefined, walletAddress: string, connectorName?: string, walletProof?: string, proofIssuedAt?: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}
