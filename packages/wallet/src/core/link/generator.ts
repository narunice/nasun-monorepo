/**
 * Nasun Link Generator
 *
 * Creates claimable links by funding ephemeral addresses
 * and generating encrypted claim URLs.
 */

import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import type {
  LinkConfig,
  LinkData,
  LinkURL,
  CreateLinkResponse,
} from './types';
import { serializeLinkConfig } from './types';
import {
  generateEphemeralKeypair,
  encryptPayload,
  generateSecret,
  generateLinkId,
} from './crypto';
import { encodeClaimPayload } from './encoding';
import { getSuiClient } from '../../sui/client';

/** Default base URL for claim links */
const DEFAULT_BASE_URL = 'https://nasun.io/claim';

/** Native token type */
const NATIVE_TOKEN_TYPE = '0x2::sui::SUI';

/**
 * Create a new claimable link
 *
 * Generates an ephemeral keypair, funds it with tokens,
 * and creates an encrypted claim URL.
 *
 * @param config - Link configuration
 * @param senderKeypair - Sender's keypair for funding
 * @param baseUrl - Base URL for the link (optional)
 * @returns Link URL and data for storage
 *
 * @example
 * ```typescript
 * const { url, data } = await createLink(
 *   {
 *     type: 'single',
 *     coinType: 'NSN',
 *     amount: 1000000000n, // 1 NASUN
 *   },
 *   senderKeypair
 * );
 *
 * // Share url.fullUrl with recipient
 * console.log(url.fullUrl);
 * // https://nasun.io/claim/abc123def456#secretKey...
 * ```
 */
export async function createLink(
  config: LinkConfig,
  senderKeypair: Ed25519Keypair,
  baseUrl: string = DEFAULT_BASE_URL
): Promise<CreateLinkResponse> {
  // Validate amount
  if (config.amount <= 0n) {
    throw new Error('Amount must be positive');
  }

  // Generate ephemeral keypair
  const ephemeralKeypair = generateEphemeralKeypair();
  const ephemeralAddress = ephemeralKeypair.toSuiAddress();

  // Generate secret for URL
  const secret = generateSecret();

  // Encrypt private key with secret
  const privateKeyBytes = ephemeralKeypair.getSecretKey();
  const encryptedPayload = await encryptPayload(privateKeyBytes, secret);

  // Generate link ID
  const linkId = generateLinkId(ephemeralAddress);

  // Fund the ephemeral address
  const fundingTxDigest = await fundEphemeralAddress(
    senderKeypair,
    ephemeralAddress,
    config.coinType,
    config.amount
  );

  // Create link data
  const data: LinkData = {
    id: linkId,
    creator: senderKeypair.toSuiAddress(),
    ephemeralAddress,
    encryptedPayload,
    config: serializeLinkConfig(config),
    status: 'active',
    claimCount: 0,
    createdAt: Date.now(),
    fundingTxDigest,
  };

  // Build URL with encoded claim payload
  const encoded = await encodeClaimPayload(data, secret);
  const url: LinkURL = {
    baseUrl,
    linkId,
    secret,
    fullUrl: `${baseUrl}/${encoded}#${secret}`,
  };

  return { url, data };
}

/**
 * Fund ephemeral address with tokens
 *
 * Transfers tokens from sender to the ephemeral address.
 *
 * @param sender - Sender's keypair
 * @param recipient - Ephemeral address to fund
 * @param coinType - Token type to transfer
 * @param amount - Amount to transfer
 * @returns Transaction digest
 */
async function fundEphemeralAddress(
  sender: Ed25519Keypair,
  recipient: string,
  coinType: string,
  amount: bigint
): Promise<string> {
  const client = getSuiClient();
  const tx = new Transaction();

  // Normalize coin type
  const normalizedType = normalizeCoinType(coinType);

  if (normalizedType === NATIVE_TOKEN_TYPE) {
    // Native token transfer - split from gas
    const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(amount)]);
    tx.transferObjects([coin], tx.pure.address(recipient));
  } else {
    // Non-native token transfer
    const senderAddress = sender.toSuiAddress();
    const coins = await client.getCoins({
      owner: senderAddress,
      coinType: normalizedType,
    });

    if (!coins.data.length) {
      throw new Error(`No ${coinType} coins found in wallet`);
    }

    // Calculate total available
    const totalAvailable = coins.data.reduce(
      (sum, c) => sum + BigInt(c.balance),
      0n
    );

    if (totalAvailable < amount) {
      throw new Error(
        `Insufficient ${coinType} balance. Have ${totalAvailable}, need ${amount}`
      );
    }

    // Use first coin, split if needed
    const primaryCoin = tx.object(coins.data[0].coinObjectId);

    // Merge additional coins if first one isn't enough
    if (BigInt(coins.data[0].balance) < amount && coins.data.length > 1) {
      const additionalCoins = coins.data
        .slice(1)
        .map((c) => tx.object(c.coinObjectId));
      tx.mergeCoins(primaryCoin, additionalCoins);
    }

    const [splitCoin] = tx.splitCoins(primaryCoin, [tx.pure.u64(amount)]);
    tx.transferObjects([splitCoin], tx.pure.address(recipient));
  }

  const result = await client.signAndExecuteTransaction({
    signer: sender,
    transaction: tx,
    options: { showEffects: true },
  });

  if (result.effects?.status.status !== 'success') {
    throw new Error(
      `Failed to fund link: ${result.effects?.status.error || 'Unknown error'}`
    );
  }

  return result.digest;
}

/**
 * Normalize coin type string
 *
 * Converts shorthand names to full type strings.
 */
function normalizeCoinType(coinType: string): string {
  if (coinType === 'NSN' || coinType === 'SUI') {
    return NATIVE_TOKEN_TYPE;
  }
  return coinType;
}

/**
 * Create multiple links in batch
 *
 * Creates multiple identical links for airdrops or promotions.
 * Each link has its own ephemeral keypair and URL.
 *
 * @param config - Link configuration
 * @param count - Number of links to create
 * @param senderKeypair - Sender's keypair for funding
 * @param baseUrl - Base URL for links (optional)
 * @returns Array of link URLs and data
 *
 * @example
 * ```typescript
 * const links = await createBatchLinks(
 *   { type: 'single', coinType: 'NSN', amount: 1000000000n },
 *   10, // Create 10 links
 *   senderKeypair
 * );
 *
 * links.forEach(({ url }) => {
 *   console.log(url.fullUrl);
 * });
 * ```
 */
export async function createBatchLinks(
  config: LinkConfig,
  count: number,
  senderKeypair: Ed25519Keypair,
  baseUrl: string = DEFAULT_BASE_URL
): Promise<CreateLinkResponse[]> {
  if (count <= 0) {
    throw new Error('Count must be positive');
  }

  if (count > 100) {
    throw new Error('Maximum 100 links per batch');
  }

  const links: CreateLinkResponse[] = [];

  for (let i = 0; i < count; i++) {
    const link = await createLink(config, senderKeypair, baseUrl);
    links.push(link);
  }

  return links;
}

/**
 * Estimate gas cost for creating a link
 *
 * @param coinType - Token type
 * @param amount - Amount per link
 * @returns Estimated gas in native tokens
 */
export async function estimateLinkCreationGas(
  coinType: string,
  _amount: bigint
): Promise<bigint> {
  // Rough estimate: 2M gas units at 1000 MIST per unit
  // Native token transfer is cheaper, non-native needs more
  const normalizedType = normalizeCoinType(coinType);
  const baseGas = normalizedType === NATIVE_TOKEN_TYPE ? 1_000_000n : 2_000_000n;

  // Add buffer
  return (baseGas * 1200n) / 1000n; // 20% buffer
}

/**
 * Validate link configuration
 *
 * @param config - Link configuration to validate
 * @returns Validation result
 */
export function validateLinkConfig(config: LinkConfig): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (config.amount <= 0n) {
    errors.push('Amount must be positive');
  }

  if (config.type !== 'single' && !config.maxClaims) {
    errors.push('maxClaims required for multi/first-n links');
  }

  if (config.maxClaims && config.maxClaims <= 0) {
    errors.push('maxClaims must be positive');
  }

  if (config.expiresAt && config.expiresAt <= Date.now()) {
    errors.push('expiresAt must be in the future');
  }

  if (config.message && config.message.length > 500) {
    errors.push('Message must be 500 characters or less');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
