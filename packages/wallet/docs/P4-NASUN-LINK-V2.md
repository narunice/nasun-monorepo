# P4 Nasun Link v2 Implementation Plan

> Created: 2026-01-11
> Status: PLANNING
> Package: @nasun/wallet

---

## 1. Overview

### What is Nasun Link?

Nasun Link enables token distribution through shareable URLs. Recipients can claim tokens without pre-existing wallets, making it ideal for:

- **Onboarding**: New users claim tokens via link
- **Airdrops**: Mass distribution without knowing addresses
- **Gifts**: Send crypto to non-crypto users
- **Campaigns**: Marketing and promotional distributions

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Nasun Link v2                            │
│  ┌────────────────────────────────────────────────────────┐ │
│  │                    Link Generator                       │ │
│  │  ┌─────────────────┐    ┌─────────────────────────┐   │ │
│  │  │ Ephemeral Key   │    │    Link Encryption      │   │ │
│  │  │ Generator       │    │    (AES-256-GCM)        │   │ │
│  │  └─────────────────┘    └─────────────────────────┘   │ │
│  └────────────────────────────────────────────────────────┘ │
│                              │                               │
│  ┌────────────────────────────────────────────────────────┐ │
│  │                    Claim Processor                      │ │
│  │  ┌─────────────────┐    ┌─────────────────────────┐   │ │
│  │  │ Link Decryption │    │    Transfer Execution   │   │ │
│  │  │                 │    │    (Sponsored TX)       │   │ │
│  │  └─────────────────┘    └─────────────────────────┘   │ │
│  └────────────────────────────────────────────────────────┘ │
│                              │                               │
│                    useSigner() / useSmartAccount()          │
└─────────────────────────────────────────────────────────────┘
                               │
                    ┌──────────┴──────────┐
                    │                     │
              Nasun Devnet           Claim Registry
              (Token Transfer)       (Prevent Double Claim)
```

### Link Structure

```
https://nasun.io/claim/{linkId}#{secret}

- linkId: Public identifier (stored in DB/chain)
- secret: Private key fragment (in URL hash, never sent to server)
```

---

## 2. Core Concepts

### Link Types

| Type | Description | Use Case |
|------|-------------|----------|
| **Single Claim** | One recipient, one claim | Gifts, P2P transfers |
| **Multi Claim** | Multiple recipients, fixed amount each | Airdrops, promotions |
| **First-N Claim** | First N claimants get tokens | FCFS campaigns |

### Security Model

1. **Ephemeral Keypair**: Generated per link, private key split
2. **URL Hash Fragment**: Secret never leaves browser
3. **Claim Registry**: On-chain prevention of double claims
4. **Optional Conditions**: ZK proofs for gated claims

---

## 3. Implementation Steps

### Step 1: Core Types (Day 1)

**File**: `core/link/types.ts`

```typescript
import type { CoinType } from '../../types/coin';

/** Link claim type */
export type LinkType = 'single' | 'multi' | 'first-n';

/** Link status */
export type LinkStatus = 'active' | 'claimed' | 'expired' | 'cancelled';

/** Link configuration */
export interface LinkConfig {
  /** Link type */
  type: LinkType;
  /** Token type to send */
  coinType: CoinType;
  /** Amount per claim (in base units) */
  amount: bigint;
  /** Max number of claims (for multi/first-n) */
  maxClaims?: number;
  /** Expiration timestamp (ms) */
  expiresAt?: number;
  /** Optional message */
  message?: string;
  /** Claim conditions (for gated links) */
  conditions?: ClaimCondition[];
}

/** Claim condition types */
export type ClaimCondition =
  | { type: 'none' }
  | { type: 'password'; hash: string }
  | { type: 'twitter'; handle: string }
  | { type: 'email'; domain: string };

/** Link data stored on-chain or backend */
export interface LinkData {
  /** Unique link ID */
  id: string;
  /** Creator address */
  creator: string;
  /** Encrypted payload */
  encryptedPayload: string;
  /** Link configuration */
  config: LinkConfig;
  /** Current status */
  status: LinkStatus;
  /** Number of claims made */
  claimCount: number;
  /** Creation timestamp */
  createdAt: number;
}

/** Claim result */
export interface ClaimResult {
  /** Transaction digest */
  txDigest: string;
  /** Amount claimed */
  amount: bigint;
  /** Recipient address */
  recipient: string;
}

/** Link URL components */
export interface LinkURL {
  /** Base URL */
  baseUrl: string;
  /** Public link ID */
  linkId: string;
  /** Secret (URL hash fragment) */
  secret: string;
  /** Full URL */
  fullUrl: string;
}
```

### Step 2: Encryption Utils (Day 1)

**File**: `core/link/crypto.ts`

```typescript
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

/**
 * Generate ephemeral keypair for link
 */
export function generateEphemeralKeypair(): Ed25519Keypair {
  return Ed25519Keypair.generate();
}

/**
 * Derive encryption key from secret
 */
export async function deriveKey(secret: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode('nasun-link-v2'),
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt link payload
 */
export async function encryptPayload(
  privateKeyBytes: Uint8Array,
  secret: string
): Promise<string> {
  const key = await deriveKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    privateKeyBytes
  );

  // Combine IV + ciphertext
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);

  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypt link payload
 */
export async function decryptPayload(
  encryptedPayload: string,
  secret: string
): Promise<Uint8Array> {
  const key = await deriveKey(secret);
  const combined = Uint8Array.from(atob(encryptedPayload), c => c.charCodeAt(0));

  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );

  return new Uint8Array(decrypted);
}

/**
 * Generate secure random secret
 */
export function generateSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}
```

### Step 3: Link Generator (Day 2)

**File**: `core/link/generator.ts`

```typescript
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import type { LinkConfig, LinkData, LinkURL } from './types';
import { generateEphemeralKeypair, encryptPayload, generateSecret } from './crypto';
import { getSuiClient } from '../../sui/client';

const DEFAULT_BASE_URL = 'https://nasun.io/claim';

/**
 * Create a new claimable link
 *
 * @param config - Link configuration
 * @param senderKeypair - Sender's keypair for funding
 * @param baseUrl - Base URL for the link
 * @returns Link URL and data
 */
export async function createLink(
  config: LinkConfig,
  senderKeypair: Ed25519Keypair,
  baseUrl: string = DEFAULT_BASE_URL
): Promise<{ url: LinkURL; data: LinkData }> {
  // Generate ephemeral keypair
  const ephemeralKeypair = generateEphemeralKeypair();
  const ephemeralAddress = ephemeralKeypair.toSuiAddress();

  // Generate secret for URL
  const secret = generateSecret();

  // Encrypt private key with secret
  const privateKeyBytes = ephemeralKeypair.getSecretKey();
  const encryptedPayload = await encryptPayload(privateKeyBytes, secret);

  // Generate link ID (hash of ephemeral public key)
  const linkId = ephemeralAddress.slice(2, 18); // First 16 chars

  // Fund the ephemeral address
  await fundEphemeralAddress(
    senderKeypair,
    ephemeralAddress,
    config.coinType,
    config.amount
  );

  // Create link data
  const data: LinkData = {
    id: linkId,
    creator: senderKeypair.toSuiAddress(),
    encryptedPayload,
    config,
    status: 'active',
    claimCount: 0,
    createdAt: Date.now(),
  };

  // Build URL
  const url: LinkURL = {
    baseUrl,
    linkId,
    secret,
    fullUrl: `${baseUrl}/${linkId}#${secret}`,
  };

  return { url, data };
}

/**
 * Fund ephemeral address with tokens
 */
async function fundEphemeralAddress(
  sender: Ed25519Keypair,
  recipient: string,
  coinType: string,
  amount: bigint
): Promise<string> {
  const client = getSuiClient();
  const tx = new Transaction();

  if (coinType === '0x2::sui::SUI' || coinType === 'NASUN') {
    // Native token transfer
    const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(amount)]);
    tx.transferObjects([coin], tx.pure.address(recipient));
  } else {
    // Other token transfer
    const coins = await client.getCoins({
      owner: sender.toSuiAddress(),
      coinType,
    });

    if (!coins.data.length) {
      throw new Error(`No ${coinType} coins found`);
    }

    const [coin] = tx.splitCoins(
      tx.object(coins.data[0].coinObjectId),
      [tx.pure.u64(amount)]
    );
    tx.transferObjects([coin], tx.pure.address(recipient));
  }

  const result = await client.signAndExecuteTransaction({
    signer: sender,
    transaction: tx,
    options: { showEffects: true },
  });

  if (result.effects?.status.status !== 'success') {
    throw new Error('Failed to fund link');
  }

  return result.digest;
}

/**
 * Create multiple links in batch
 */
export async function createBatchLinks(
  config: LinkConfig,
  count: number,
  senderKeypair: Ed25519Keypair,
  baseUrl: string = DEFAULT_BASE_URL
): Promise<Array<{ url: LinkURL; data: LinkData }>> {
  const links: Array<{ url: LinkURL; data: LinkData }> = [];

  for (let i = 0; i < count; i++) {
    const link = await createLink(config, senderKeypair, baseUrl);
    links.push(link);
  }

  return links;
}
```

### Step 4: Claim Processor (Day 2-3)

**File**: `core/link/claim.ts`

```typescript
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import type { LinkData, ClaimResult } from './types';
import { decryptPayload } from './crypto';
import { getSuiClient } from '../../sui/client';

/**
 * Claim tokens from a link
 *
 * @param linkData - Link data from storage
 * @param secret - Secret from URL hash
 * @param recipientAddress - Address to receive tokens
 * @returns Claim result
 */
export async function claimLink(
  linkData: LinkData,
  secret: string,
  recipientAddress: string
): Promise<ClaimResult> {
  // Validate link status
  if (linkData.status !== 'active') {
    throw new Error(`Link is ${linkData.status}`);
  }

  // Check expiration
  if (linkData.config.expiresAt && Date.now() > linkData.config.expiresAt) {
    throw new Error('Link has expired');
  }

  // Check max claims for multi/first-n
  if (linkData.config.maxClaims && linkData.claimCount >= linkData.config.maxClaims) {
    throw new Error('Link has reached maximum claims');
  }

  // Decrypt ephemeral private key
  const privateKeyBytes = await decryptPayload(linkData.encryptedPayload, secret);
  const ephemeralKeypair = Ed25519Keypair.fromSecretKey(privateKeyBytes);

  // Execute transfer
  const result = await executeTransfer(
    ephemeralKeypair,
    recipientAddress,
    linkData.config.coinType,
    linkData.config.amount
  );

  return result;
}

/**
 * Execute token transfer from ephemeral to recipient
 */
async function executeTransfer(
  ephemeralKeypair: Ed25519Keypair,
  recipient: string,
  coinType: string,
  amount: bigint
): Promise<ClaimResult> {
  const client = getSuiClient();
  const ephemeralAddress = ephemeralKeypair.toSuiAddress();
  const tx = new Transaction();

  if (coinType === '0x2::sui::SUI' || coinType === 'NASUN') {
    // Get all gas coins and merge
    const coins = await client.getCoins({
      owner: ephemeralAddress,
      coinType: '0x2::sui::SUI',
    });

    if (coins.data.length === 0) {
      throw new Error('Link has no funds');
    }

    // Transfer all coins
    const coinObjects = coins.data.map(c => tx.object(c.coinObjectId));
    if (coinObjects.length > 1) {
      tx.mergeCoins(coinObjects[0], coinObjects.slice(1));
    }
    tx.transferObjects([coinObjects[0]], tx.pure.address(recipient));
  } else {
    // Other token transfer
    const coins = await client.getCoins({
      owner: ephemeralAddress,
      coinType,
    });

    if (coins.data.length === 0) {
      throw new Error('Link has no funds for specified token');
    }

    const coinObjects = coins.data.map(c => tx.object(c.coinObjectId));
    if (coinObjects.length > 1) {
      tx.mergeCoins(coinObjects[0], coinObjects.slice(1));
    }
    tx.transferObjects([coinObjects[0]], tx.pure.address(recipient));
  }

  const result = await client.signAndExecuteTransaction({
    signer: ephemeralKeypair,
    transaction: tx,
    options: { showEffects: true },
  });

  if (result.effects?.status.status !== 'success') {
    throw new Error('Transfer failed');
  }

  return {
    txDigest: result.digest,
    amount,
    recipient,
  };
}

/**
 * Parse link URL to extract components
 */
export function parseLinkUrl(url: string): { linkId: string; secret: string } {
  const urlObj = new URL(url);
  const pathParts = urlObj.pathname.split('/');
  const linkId = pathParts[pathParts.length - 1];
  const secret = urlObj.hash.slice(1); // Remove '#'

  if (!linkId || !secret) {
    throw new Error('Invalid link URL');
  }

  return { linkId, secret };
}

/**
 * Check if a link can be claimed
 */
export async function canClaim(linkData: LinkData): Promise<{
  canClaim: boolean;
  reason?: string;
}> {
  if (linkData.status !== 'active') {
    return { canClaim: false, reason: `Link is ${linkData.status}` };
  }

  if (linkData.config.expiresAt && Date.now() > linkData.config.expiresAt) {
    return { canClaim: false, reason: 'Link has expired' };
  }

  if (linkData.config.maxClaims && linkData.claimCount >= linkData.config.maxClaims) {
    return { canClaim: false, reason: 'Maximum claims reached' };
  }

  return { canClaim: true };
}
```

### Step 5: React Hooks (Day 3-4)

**File**: `hooks/useNasunLink.ts`

```typescript
import { useState, useCallback } from 'react';
import { useSigner } from './useSigner';
import type { LinkConfig, LinkURL, LinkData, ClaimResult } from '../core/link/types';
import { createLink, createBatchLinks } from '../core/link/generator';
import { claimLink, parseLinkUrl, canClaim } from '../core/link/claim';
import { LocalSigner } from '../core/signer/adapters/LocalSigner';

export interface UseNasunLinkResult {
  /** Create a single claimable link */
  createLink: (config: LinkConfig) => Promise<{ url: LinkURL; data: LinkData }>;
  /** Create multiple links */
  createBatchLinks: (config: LinkConfig, count: number) => Promise<Array<{ url: LinkURL; data: LinkData }>>;
  /** Claim tokens from a link */
  claim: (linkData: LinkData, secret: string) => Promise<ClaimResult>;
  /** Check if link can be claimed */
  checkClaimable: (linkData: LinkData) => Promise<{ canClaim: boolean; reason?: string }>;
  /** Parse link URL */
  parseUrl: (url: string) => { linkId: string; secret: string };
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error: string | null;
}

/**
 * Hook for creating and claiming Nasun Links
 *
 * @example
 * ```tsx
 * const { createLink, claim, isLoading } = useNasunLink();
 *
 * // Create a link
 * const { url, data } = await createLink({
 *   type: 'single',
 *   coinType: 'NASUN',
 *   amount: 1000000000n, // 1 NASUN
 * });
 *
 * // Share url.fullUrl with recipient
 *
 * // Recipient claims
 * const result = await claim(data, secret);
 * ```
 */
export function useNasunLink(): UseNasunLinkResult {
  const { signer, address } = useSigner();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = useCallback(
    async (config: LinkConfig): Promise<{ url: LinkURL; data: LinkData }> => {
      if (!signer || !(signer instanceof LocalSigner)) {
        throw new Error('Local signer required to create links');
      }

      setIsLoading(true);
      setError(null);

      try {
        const keypair = signer.getKeypair();
        return await createLink(config, keypair);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to create link';
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [signer]
  );

  const createBatch = useCallback(
    async (config: LinkConfig, count: number): Promise<Array<{ url: LinkURL; data: LinkData }>> => {
      if (!signer || !(signer instanceof LocalSigner)) {
        throw new Error('Local signer required to create links');
      }

      setIsLoading(true);
      setError(null);

      try {
        const keypair = signer.getKeypair();
        return await createBatchLinks(config, count, keypair);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to create links';
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [signer]
  );

  const claim = useCallback(
    async (linkData: LinkData, secret: string): Promise<ClaimResult> => {
      if (!address) {
        throw new Error('Wallet not connected');
      }

      setIsLoading(true);
      setError(null);

      try {
        return await claimLink(linkData, secret, address);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to claim';
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [address]
  );

  return {
    createLink: create,
    createBatchLinks: createBatch,
    claim,
    checkClaimable: canClaim,
    parseUrl: parseLinkUrl,
    isLoading,
    error,
  };
}

/**
 * Hook for claiming from a link URL
 */
export function useClaimLink(fullUrl: string) {
  const [linkData, setLinkData] = useState<LinkData | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const { claim, isLoading, error } = useNasunLink();

  // Parse URL on mount
  useState(() => {
    try {
      const { linkId, secret: s } = parseLinkUrl(fullUrl);
      setSecret(s);
      // TODO: Fetch linkData from backend/chain using linkId
    } catch {
      // Invalid URL
    }
  });

  const executeClaim = useCallback(async (): Promise<ClaimResult | null> => {
    if (!linkData || !secret) return null;
    return claim(linkData, secret);
  }, [linkData, secret, claim]);

  return {
    linkData,
    canClaim: linkData?.status === 'active',
    claim: executeClaim,
    isLoading,
    error,
  };
}
```

### Step 6: Module Exports (Day 4)

**File**: `core/link/index.ts`

```typescript
export * from './types';
export * from './crypto';
export * from './generator';
export * from './claim';
```

**File**: `index.ts` (update)

```typescript
// Nasun Link
export {
  createLink,
  createBatchLinks,
  claimLink,
  parseLinkUrl,
  canClaim,
} from './core/link';

export type {
  LinkType,
  LinkStatus,
  LinkConfig,
  LinkData,
  ClaimResult,
  LinkURL,
  ClaimCondition,
} from './core/link/types';

export { useNasunLink, useClaimLink } from './hooks/useNasunLink';
```

---

## 4. Storage Strategy

### Option A: Backend API (Recommended for v1)

```typescript
// Simple REST API
POST /api/links          // Create link
GET  /api/links/:id      // Get link data
POST /api/links/:id/claim // Record claim
```

### Option B: On-chain (Future)

```move
// Link registry contract
module nasun_link::registry {
    struct Link has key {
        id: UID,
        creator: address,
        encrypted_payload: vector<u8>,
        config: LinkConfig,
        claim_count: u64,
        status: u8,
    }
}
```

---

## 5. Security Considerations

### Secret Protection

- URL hash fragment never sent to server
- Client-side decryption only
- No logging of secrets

### Double Claim Prevention

- Backend/on-chain registry tracks claims
- Atomic claim + status update

### Expiration Handling

- Expired links cannot be claimed
- Funds return to creator (optional)

---

## 6. File Structure

```
packages/wallet/src/
├── core/
│   ├── link/                     # Nasun Link [NEW]
│   │   ├── types.ts              # Link types
│   │   ├── crypto.ts             # Encryption utils
│   │   ├── generator.ts          # Link creation
│   │   ├── claim.ts              # Claim processing
│   │   └── index.ts              # Exports
│   └── ...
├── hooks/
│   ├── useNasunLink.ts           # [NEW]
│   └── ...
└── index.ts                      # Updated exports
```

---

## 7. Estimated Effort

| Step | Description | Effort |
|------|-------------|--------|
| 1 | Core types | 0.5 day |
| 2 | Encryption utils | 0.5 day |
| 3 | Link generator | 1 day |
| 4 | Claim processor | 1 day |
| 5 | React hooks | 1 day |
| 6 | Testing & docs | 1 day |
| **Total** | | **5 days** |

---

## 8. Success Criteria

- [ ] Create single claimable link
- [ ] Claim tokens via link URL
- [ ] URL secret never exposed to server
- [ ] Double claim prevention works
- [ ] Batch link creation supported
- [ ] All tests pass (10+ tests)

---

## 9. Future Enhancements (P5+)

1. **ZK Conditional Claims**
   - Twitter verification
   - Email domain verification
   - NFT holder verification

2. **On-chain Registry**
   - Decentralized link storage
   - Claim verification on-chain

3. **Gasless Claims**
   - Sponsor claim transactions
   - Zero friction onboarding

4. **Link Analytics**
   - View count tracking
   - Claim rate analytics
