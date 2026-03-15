/**
 * Address Book Session Manager
 * Handles challenge-sign-verify flow to obtain a session JWT for address book sync.
 * The session token is cached and automatically refreshed before expiration.
 */

export interface AddressBookSessionConfig {
  /** API endpoint base URL (e.g., 'https://xxx.execute-api.../prod') */
  apiEndpoint: string;
  /** Get the current wallet address. Returns null if no wallet connected. */
  getWalletAddress: () => string | null;
  /**
   * Sign a message. Caller handles signer type detection:
   * - LocalSigner/PasskeySigner: use signer.signPersonal(msg)
   * - ZkLoginSigner: use signer.signWithEphemeralKey(msg)
   * Returns base64 signature string.
   */
  signMessage: (message: Uint8Array) => Promise<string>;
  /** zkLogin only: get ephemeral public key (base64) for server verification */
  getEphemeralPublicKey?: () => string;
}

// Refresh token 5 minutes before expiration
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

/**
 * Decode JWT exp claim without a library.
 * Returns expiration time in milliseconds, or 0 if decoding fails.
 */
function getJwtExpMs(token: string): number {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return 0;
    // Base64url decode the payload
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const decoded = JSON.parse(atob(payload));
    return typeof decoded.exp === 'number' ? decoded.exp * 1000 : 0;
  } catch {
    return 0;
  }
}

export class AddressBookSessionManager {
  private config: AddressBookSessionConfig;
  private cachedToken: string | null = null;
  private tokenExpMs = 0;
  private refreshPromise: Promise<string | null> | null = null;

  constructor(config: AddressBookSessionConfig) {
    this.config = config;
  }

  /**
   * Get a valid session token. Returns cached token if still valid,
   * otherwise performs challenge-sign-verify to obtain a new one.
   * Returns null if wallet is not connected or signing fails.
   */
  async getToken(): Promise<string | null> {
    const walletAddress = this.config.getWalletAddress();
    if (!walletAddress) return null;

    // Return cached token if still valid (with buffer)
    if (this.cachedToken && this.tokenExpMs - Date.now() > REFRESH_BUFFER_MS) {
      return this.cachedToken;
    }

    // Deduplicate concurrent refresh calls (mutex pattern)
    if (this.refreshPromise) return this.refreshPromise;

    this.refreshPromise = this.refreshToken(walletAddress)
      .finally(() => { this.refreshPromise = null; });

    return this.refreshPromise;
  }

  /**
   * Invalidate the cached token. Call when the wallet changes.
   */
  invalidate(): void {
    this.cachedToken = null;
    this.tokenExpMs = 0;
    this.refreshPromise = null;
  }

  private async refreshToken(walletAddress: string): Promise<string | null> {
    try {
      // Step 1: Request challenge
      const challengeRes = await fetch(`${this.config.apiEndpoint}/challenge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress }),
      });

      if (!challengeRes.ok) {
        console.warn('[AddressBookSession] Challenge request failed:', challengeRes.status);
        return null;
      }

      const { nonce, message } = await challengeRes.json();

      // Step 2: Sign the challenge message
      const messageBytes = new TextEncoder().encode(message);
      const signature = await this.config.signMessage(messageBytes);

      // Step 3: Verify signature and get session token
      const verifyBody: Record<string, string> = { signature, nonce, walletAddress };
      if (this.config.getEphemeralPublicKey) {
        verifyBody.ephemeralPublicKey = this.config.getEphemeralPublicKey();
      }

      const verifyRes = await fetch(`${this.config.apiEndpoint}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(verifyBody),
      });

      if (!verifyRes.ok) {
        console.warn('[AddressBookSession] Verify request failed:', verifyRes.status);
        return null;
      }

      const { token } = await verifyRes.json();

      // Cache the token
      this.cachedToken = token;
      this.tokenExpMs = getJwtExpMs(token);

      return token;
    } catch (error) {
      console.warn('[AddressBookSession] Auth flow failed:', error);
      return null;
    }
  }
}
