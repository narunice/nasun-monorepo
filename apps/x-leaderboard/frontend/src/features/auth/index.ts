// Auth stub for standalone leaderboard app
// In the full nasun-website, this provides Cognito-based authentication.
// For the standalone leaderboard, auth is not available.

interface AuthUser {
  twitterHandle?: string;
  username?: string;
}

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  signInWithTwitter: () => void;
}

export function useAuth(): AuthState {
  return {
    user: null,
    isAuthenticated: false,
    signInWithTwitter: () => {
      // Redirect to main nasun.io for authentication
      window.open('https://nasun.io/my-account', '_blank');
    },
  };
}
