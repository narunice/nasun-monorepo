/**
 * ZK-ID Nullifier Utilities
 *
 * Implements domain-separated nullifiers for Sybil resistance.
 *
 * SECURITY PRINCIPLE: Domain Separation
 * - nullifier = hash(credential_secret || domain || action_id)
 * - Same credential produces different nullifiers for different contexts
 * - Prevents cross-context nullifier reuse attacks
 */

import { type NullifierInput, type NullifierRegistry, ZKIDError } from './types';

// ============================================
// Nullifier Calculation
// ============================================

/**
 * Calculate nullifier with domain separation
 *
 * Uses SHA-256 for deterministic, collision-resistant nullifier generation.
 * The nullifier is unique per (credential, domain, action) tuple.
 *
 * @param input - Nullifier input with credential secret, domain, and action ID
 * @returns Hex-encoded nullifier string
 */
export async function calculateNullifier(input: NullifierInput): Promise<string> {
  const { credentialSecret, domain, actionId } = input;

  // Validate inputs
  if (!credentialSecret || credentialSecret.length === 0) {
    throw new ZKIDError(
      'PROOF_GENERATION_FAILED',
      'Credential secret is required for nullifier calculation'
    );
  }

  if (!domain || domain.length === 0) {
    throw new ZKIDError(
      'NULLIFIER_DOMAIN_MISMATCH',
      'Domain is required for nullifier calculation'
    );
  }

  if (!actionId || actionId.length === 0) {
    throw new ZKIDError(
      'PROOF_GENERATION_FAILED',
      'Action ID is required for nullifier calculation'
    );
  }

  // Construct message with domain separator
  // Format: "ZKID_NULLIFIER_V1:{domain}:{actionId}:{credentialSecret}"
  const message = `ZKID_NULLIFIER_V1:${domain}:${actionId}:${credentialSecret}`;

  // Hash using Web Crypto API (available in browsers and Node.js 15+)
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);

  // Convert to hex string
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

  return hashHex;
}

/**
 * Validate nullifier format
 */
export function isValidNullifier(nullifier: string): boolean {
  // SHA-256 produces 64 hex characters
  return /^[a-f0-9]{64}$/.test(nullifier);
}

/**
 * Create nullifier input from context
 */
export function createNullifierInput(
  credentialSecret: string,
  domain: string,
  actionId: string
): NullifierInput {
  return {
    credentialSecret,
    domain,
    actionId,
  };
}

// ============================================
// Nullifier Registry Implementations
// ============================================

/**
 * In-memory nullifier registry (for testing)
 *
 * WARNING: Data is lost on page refresh.
 * Use APIBackedNullifierRegistry for production.
 */
export class InMemoryNullifierRegistry implements NullifierRegistry {
  private usedNullifiers: Set<string> = new Set();

  async check(nullifier: string): Promise<boolean> {
    return this.usedNullifiers.has(nullifier);
  }

  async register(nullifier: string): Promise<void> {
    if (this.usedNullifiers.has(nullifier)) {
      throw new ZKIDError(
        'NULLIFIER_ALREADY_USED',
        'This nullifier has already been used'
      );
    }
    this.usedNullifiers.add(nullifier);
  }

  /** Clear all nullifiers (for testing) */
  clear(): void {
    this.usedNullifiers.clear();
  }

  /** Get count of registered nullifiers (for testing) */
  get size(): number {
    return this.usedNullifiers.size;
  }
}

/**
 * API-backed nullifier registry
 *
 * Stores nullifiers on a backend server for persistence.
 */
export class APIBackedNullifierRegistry implements NullifierRegistry {
  private readonly apiUrl: string;
  private readonly options?: {
    timeout?: number;
    headers?: Record<string, string>;
  };

  constructor(
    apiUrl: string,
    options?: {
      timeout?: number;
      headers?: Record<string, string>;
    }
  ) {
    this.apiUrl = apiUrl;
    this.options = options;
  }

  async check(nullifier: string): Promise<boolean> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.options?.timeout ?? 10000
    );

    try {
      const response = await fetch(`${this.apiUrl}/nullifiers/${nullifier}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...this.options?.headers,
        },
        signal: controller.signal,
      });

      if (response.status === 404) {
        return false; // Nullifier not found = not used
      }

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = (await response.json()) as { exists: boolean };
      return data.exists;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ZKIDError('PROVER_TIMEOUT', 'Nullifier check timed out');
      }
      throw new ZKIDError(
        'PROVER_UNAVAILABLE',
        `Failed to check nullifier: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  async register(nullifier: string): Promise<void> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.options?.timeout ?? 10000
    );

    try {
      const response = await fetch(`${this.apiUrl}/nullifiers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.options?.headers,
        },
        body: JSON.stringify({ nullifier }),
        signal: controller.signal,
      });

      if (response.status === 409) {
        throw new ZKIDError(
          'NULLIFIER_ALREADY_USED',
          'This nullifier has already been used'
        );
      }

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
    } catch (error) {
      if (error instanceof ZKIDError) throw error;

      if (error instanceof Error && error.name === 'AbortError') {
        throw new ZKIDError('PROVER_TIMEOUT', 'Nullifier registration timed out');
      }

      throw new ZKIDError(
        'PROVER_UNAVAILABLE',
        `Failed to register nullifier: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}

// ============================================
// Domain Helpers
// ============================================

/**
 * Standard domain formats for common use cases
 */
export const NULLIFIER_DOMAINS = {
  /** Nasun Link claim domain */
  nasunLink: (linkId: string) => `nasun.link:${linkId}`,

  /** Campaign domain */
  campaign: (campaignId: string) => `campaign:${campaignId}`,

  /** Smart contract domain */
  contract: (chainId: number, address: string) =>
    `contract:${chainId}:${address}`,

  /** Generic event domain */
  event: (eventId: string) => `event:${eventId}`,
} as const;

/**
 * Parse domain string to extract type and ID
 */
export function parseDomain(domain: string): { type: string; id: string } {
  const parts = domain.split(':');
  if (parts.length < 2) {
    return { type: 'unknown', id: domain };
  }
  return { type: parts[0], id: parts.slice(1).join(':') };
}
