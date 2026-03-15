/**
 * Nasun Link Claim Processor
 *
 * Handles claiming tokens from link URLs.
 * Decrypts ephemeral keys and executes transfers.
 * Supports ZK-ID conditions for gated claims (P2-4).
 */

import { Transaction } from '@mysten/sui/transactions';
import type { LinkData, ClaimResult, ClaimValidation, ClaimCondition } from './types';
import { deserializeLinkConfig } from './types';
import { recoverKeypair, verifyPassword } from './crypto';
import { getSuiClient } from '../../sui/client';
import type { ZKIDProof } from '../zkid/types';
import { verifyAgainstCondition, type ZKIDConditionCheck } from '../zkid/verifier';

/** Native token type */
const NATIVE_TOKEN_TYPE = '0x2::sui::SUI';

/**
 * Claim tokens from a link
 *
 * Decrypts the ephemeral private key and transfers funds to recipient.
 *
 * @param linkData - Link data from storage
 * @param secret - Secret from URL hash
 * @param recipientAddress - Address to receive tokens
 * @param password - Password if link is password-protected
 * @returns Claim result with transaction digest
 *
 * @example
 * ```typescript
 * const result = await claimLink(
 *   linkData,
 *   'secretFromUrlHash',
 *   '0xRecipientAddress...'
 * );
 *
 * console.log('Claimed!', result.txDigest);
 * ```
 */
export async function claimLink(
  linkData: LinkData,
  secret: string,
  recipientAddress: string,
  password?: string
): Promise<ClaimResult> {
  // Validate claim eligibility
  const validation = await validateClaim(linkData, password);
  if (!validation.canClaim) {
    throw new Error(validation.reason || 'Cannot claim link');
  }

  // Recover ephemeral keypair from encrypted payload
  const ephemeralKeypair = await recoverKeypair(linkData.encryptedPayload, secret);

  // Verify ephemeral address matches
  if (ephemeralKeypair.toSuiAddress() !== linkData.ephemeralAddress) {
    throw new Error('Invalid secret - address mismatch');
  }

  // Get link config
  const config = deserializeLinkConfig(linkData.config);

  // Execute transfer
  const result = await executeTransfer(
    ephemeralKeypair,
    recipientAddress,
    config.coinType,
    config.amount,
    linkData.id
  );

  return result;
}

/**
 * Validate if a link can be claimed
 *
 * Checks status, expiration, claim count, and conditions.
 *
 * @param linkData - Link data to validate
 * @param password - Password if required
 * @returns Validation result
 */
export async function validateClaim(
  linkData: LinkData,
  password?: string
): Promise<ClaimValidation> {
  const config = deserializeLinkConfig(linkData.config);

  // Check status
  if (linkData.status !== 'active') {
    return {
      canClaim: false,
      reason: `Link is ${linkData.status}`,
    };
  }

  // Check expiration
  if (config.expiresAt && Date.now() > config.expiresAt) {
    return {
      canClaim: false,
      reason: 'Link has expired',
      expiresAt: config.expiresAt,
    };
  }

  // Check max claims
  if (config.maxClaims && linkData.claimCount >= config.maxClaims) {
    return {
      canClaim: false,
      reason: 'Maximum claims reached',
      remainingClaims: 0,
    };
  }

  // Check conditions
  if (config.conditions && config.conditions.length > 0) {
    for (const condition of config.conditions) {
      if (condition.type === 'password') {
        if (!password) {
          return {
            canClaim: false,
            reason: 'Password required',
          };
        }

        const valid = await verifyPassword(password, condition.hash);
        if (!valid) {
          return {
            canClaim: false,
            reason: 'Invalid password',
          };
        }
      }

      // Other conditions (twitter, email) would need additional verification
      // For now, we only support password condition
    }
  }

  return {
    canClaim: true,
    remainingClaims: config.maxClaims
      ? config.maxClaims - linkData.claimCount
      : undefined,
    expiresAt: config.expiresAt,
  };
}

/**
 * Execute token transfer from ephemeral to recipient
 *
 * Transfers all tokens of the specified type from the ephemeral address.
 */
async function executeTransfer(
  ephemeralKeypair: ReturnType<typeof import('@mysten/sui/keypairs/ed25519').Ed25519Keypair.prototype.toSuiAddress> extends string
    ? import('@mysten/sui/keypairs/ed25519').Ed25519Keypair
    : never,
  recipient: string,
  coinType: string,
  _amount: bigint,
  linkId: string
): Promise<ClaimResult> {
  const client = getSuiClient();
  const ephemeralAddress = ephemeralKeypair.toSuiAddress();
  const tx = new Transaction();

  // Normalize coin type
  const normalizedType = normalizeCoinType(coinType);

  if (normalizedType === NATIVE_TOKEN_TYPE) {
    // Get all gas coins
    const coins = await client.getCoins({
      owner: ephemeralAddress,
      coinType: NATIVE_TOKEN_TYPE,
    });

    if (coins.data.length === 0) {
      throw new Error('Link has no funds');
    }

    // Calculate total balance
    const totalBalance = coins.data.reduce(
      (sum, c) => sum + BigInt(c.balance),
      0n
    );

    if (totalBalance === 0n) {
      throw new Error('Link has zero balance');
    }

    // Merge all coins if multiple
    const coinObjects = coins.data.map((c) => tx.object(c.coinObjectId));
    if (coinObjects.length > 1) {
      tx.mergeCoins(coinObjects[0], coinObjects.slice(1));
    }

    // Transfer all merged coins
    tx.transferObjects([coinObjects[0]], tx.pure.address(recipient));

    const result = await client.signAndExecuteTransaction({
      signer: ephemeralKeypair,
      transaction: tx,
      options: { showEffects: true },
    });

    if (result.effects?.status.status !== 'success') {
      throw new Error(
        `Transfer failed: ${result.effects?.status.error || 'Unknown error'}`
      );
    }

    return {
      txDigest: result.digest,
      amount: totalBalance,
      recipient,
      linkId,
    };
  } else {
    // Non-native token transfer
    const coins = await client.getCoins({
      owner: ephemeralAddress,
      coinType: normalizedType,
    });

    if (coins.data.length === 0) {
      throw new Error('Link has no funds for specified token');
    }

    const totalBalance = coins.data.reduce(
      (sum, c) => sum + BigInt(c.balance),
      0n
    );

    // Merge and transfer
    const coinObjects = coins.data.map((c) => tx.object(c.coinObjectId));
    if (coinObjects.length > 1) {
      tx.mergeCoins(coinObjects[0], coinObjects.slice(1));
    }
    tx.transferObjects([coinObjects[0]], tx.pure.address(recipient));

    const result = await client.signAndExecuteTransaction({
      signer: ephemeralKeypair,
      transaction: tx,
      options: { showEffects: true },
    });

    if (result.effects?.status.status !== 'success') {
      throw new Error(
        `Transfer failed: ${result.effects?.status.error || 'Unknown error'}`
      );
    }

    return {
      txDigest: result.digest,
      amount: totalBalance,
      recipient,
      linkId,
    };
  }
}

/**
 * Normalize coin type string
 */
function normalizeCoinType(coinType: string): string {
  if (coinType === 'NSN' || coinType === 'SUI') {
    return NATIVE_TOKEN_TYPE;
  }
  return coinType;
}

/**
 * Parse link URL to extract components
 *
 * @param url - Full link URL
 * @returns Link ID and secret
 *
 * @example
 * ```typescript
 * const { linkId, secret } = parseLinkUrl(
 *   'https://nasun.io/claim/abc123#secretKey...'
 * );
 * ```
 */
export function parseLinkUrl(url: string): { linkId: string; secret: string } {
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/').filter(Boolean);
    const linkId = pathParts[pathParts.length - 1];
    const secret = urlObj.hash.slice(1); // Remove '#'

    if (!linkId) {
      throw new Error('Missing link ID in URL');
    }

    if (!secret) {
      throw new Error('Missing secret in URL hash');
    }

    return { linkId, secret };
  } catch (error) {
    if (error instanceof Error && error.message.includes('Missing')) {
      throw error;
    }
    throw new Error('Invalid link URL format');
  }
}

/**
 * Build link URL from components
 *
 * @deprecated Use encodeClaimPayload() + fullUrl from createLink() instead.
 * This function produces the legacy short-linkId URL format.
 *
 * @param baseUrl - Base URL
 * @param linkId - Link ID or encoded claim payload
 * @param secret - Secret
 * @returns Full URL string
 */
export function buildLinkUrl(
  baseUrl: string,
  linkId: string,
  secret: string
): string {
  return `${baseUrl}/${linkId}#${secret}`;
}

/**
 * Check if ephemeral address has funds
 *
 * @param ephemeralAddress - Address to check
 * @param coinType - Token type
 * @returns Balance info
 */
export async function checkLinkBalance(
  ephemeralAddress: string,
  coinType: string
): Promise<{ balance: bigint; hasFunds: boolean }> {
  const client = getSuiClient();
  const normalizedType = normalizeCoinType(coinType);

  const coins = await client.getCoins({
    owner: ephemeralAddress,
    coinType: normalizedType,
  });

  const balance = coins.data.reduce((sum, c) => sum + BigInt(c.balance), 0n);

  return {
    balance,
    hasFunds: balance > 0n,
  };
}

/**
 * Get claim status for a link
 *
 * Provides user-friendly status information.
 */
export function getClaimStatus(linkData: LinkData): {
  status: string;
  message: string;
  canClaim: boolean;
} {
  const config = deserializeLinkConfig(linkData.config);

  switch (linkData.status) {
    case 'claimed':
      return {
        status: 'claimed',
        message: 'This link has already been claimed',
        canClaim: false,
      };

    case 'expired':
      return {
        status: 'expired',
        message: 'This link has expired',
        canClaim: false,
      };

    case 'cancelled':
      return {
        status: 'cancelled',
        message: 'This link has been cancelled by the creator',
        canClaim: false,
      };

    case 'active':
      // Check expiration
      if (config.expiresAt && Date.now() > config.expiresAt) {
        return {
          status: 'expired',
          message: 'This link has expired',
          canClaim: false,
        };
      }

      // Check max claims
      if (config.maxClaims && linkData.claimCount >= config.maxClaims) {
        return {
          status: 'claimed',
          message: 'Maximum claims reached',
          canClaim: false,
        };
      }

      return {
        status: 'active',
        message: 'Ready to claim',
        canClaim: true,
      };

    default:
      return {
        status: 'unknown',
        message: 'Unknown link status',
        canClaim: false,
      };
  }
}

// ============================================
// ZK-ID Claim Validation (P2-4)
// ============================================

/**
 * Validate claim with ZK-ID proof support
 *
 * Extended validation that supports ZK-ID conditions:
 * - zkid-age: Age verification
 * - zkid-kyc: KYC verification
 * - zkid-unique: Unique claim (Sybil resistance)
 *
 * @param linkData - Link data to validate
 * @param password - Password if required
 * @param zkidProof - ZK-ID proof for gated conditions
 * @returns Validation result
 */
export async function validateClaimWithZKID(
  linkData: LinkData,
  password?: string,
  zkidProof?: ZKIDProof
): Promise<ClaimValidation> {
  // First, run standard validation
  const baseValidation = await validateClaim(linkData, password);
  if (!baseValidation.canClaim) {
    return baseValidation;
  }

  const config = deserializeLinkConfig(linkData.config);

  // Check ZK-ID conditions
  if (config.conditions && config.conditions.length > 0) {
    for (const condition of config.conditions) {
      // Skip non-ZK-ID conditions (already handled by validateClaim)
      if (!isZKIDCondition(condition)) {
        continue;
      }

      // ZK-ID proof required
      if (!zkidProof) {
        return {
          canClaim: false,
          reason: getZKIDConditionMessage(condition),
        };
      }

      // Convert to ZKIDConditionCheck format
      const zkidCondition = toZKIDConditionCheck(condition);
      if (!zkidCondition) {
        return {
          canClaim: false,
          reason: `Unsupported condition type: ${condition.type}`,
        };
      }

      // Verify proof against condition
      const result = await verifyAgainstCondition(zkidProof, zkidCondition);
      if (!result.valid) {
        return {
          canClaim: false,
          reason: result.reason || `ZK-ID verification failed for ${condition.type}`,
        };
      }
    }
  }

  return baseValidation;
}

/**
 * Check if condition is a ZK-ID condition
 */
function isZKIDCondition(condition: ClaimCondition): boolean {
  return condition.type.startsWith('zkid-');
}

/**
 * Convert ClaimCondition to ZKIDConditionCheck
 */
function toZKIDConditionCheck(
  condition: ClaimCondition
): ZKIDConditionCheck | null {
  switch (condition.type) {
    case 'zkid-age':
      return { type: 'zkid-age', threshold: condition.threshold };
    case 'zkid-kyc':
      return { type: 'zkid-kyc', level: condition.level };
    case 'zkid-unique':
      return { type: 'zkid-unique', contextId: condition.contextId };
    default:
      return null;
  }
}

/**
 * Get user-friendly message for ZK-ID condition
 */
function getZKIDConditionMessage(condition: ClaimCondition): string {
  switch (condition.type) {
    case 'zkid-age':
      return `Age verification required (${condition.threshold}+)`;
    case 'zkid-kyc':
      return `KYC verification required (${condition.level} level)`;
    case 'zkid-unique':
      return 'Identity verification required (one claim per person)';
    default:
      return 'ZK-ID verification required';
  }
}

/**
 * Check if link has ZK-ID conditions
 */
export function hasZKIDConditions(linkData: LinkData): boolean {
  const config = deserializeLinkConfig(linkData.config);
  if (!config.conditions) return false;
  return config.conditions.some(isZKIDCondition);
}

/**
 * Get ZK-ID conditions from link
 */
export function getZKIDConditions(linkData: LinkData): ClaimCondition[] {
  const config = deserializeLinkConfig(linkData.config);
  if (!config.conditions) return [];
  return config.conditions.filter(isZKIDCondition);
}
