# Nasun Link v2 Implementation Status

> Last Updated: 2026-01-24
> Status: **COMPLETED**
> Package: @nasun/wallet

---

## 1. Overview

Nasun Link v2 has been fully implemented, enabling secure token distribution via shareable URLs.

### Features
- **Ephemeral Keypairs**: Generated locally for each link.
- **AES-256-GCM Encryption**: Link payload is encrypted with a secret stored only in the URL fragment.
- **Native & Token Support**: Supports both SUI/Native tokens and other coin types.
- **Batch Creation**: Create up to 100 links at once.

---

## 2. Implemented Architecture

### 2.1. Core Components (`packages/wallet/src/core/link/`)

| File | Description |
|------|-------------|
| `generator.ts` | Logic for creating links: generates keys, funds ephemeral address, creates encrypted payload. |
| `claim.ts` | Logic for claiming links: decrypts payload, transfers funds to recipient. |
| `crypto.ts` | Cryptographic utilities: `generateEphemeralKeypair`, `encryptPayload`, `decryptPayload`. |
| `types.ts` | Type definitions for Link configuration and data. |

### 2.2. React Hook (`packages/wallet/src/hooks/`)

| Hook | Description |
|------|-------------|
| `useNasunLink` | Unified hook for creating and claiming links. |

**`useNasunLink` API:**

| Method | Signature | Description |
|--------|-----------|-------------|
| `create` | `(config: LinkConfig) => Promise<{url, data}>` | Create a single claimable link |
| `createBatch` | `(config: LinkConfig, count: number) => Promise<Array<{url, data}>>` | Create up to 100 links |
| `claim` | `(linkData: LinkData, secret: string) => Promise<ClaimResult>` | Claim tokens from a link |
| `validateClaim` | `(linkData: LinkData) => Promise<ClaimValidation>` | Check if link is claimable |
| `parseUrl` | `(url: string) => {linkId, secret}` | Extract linkId and secret from URL |
| `checkBalance` | `(address: string, coinType: string) => Promise<{balance, hasFunds}>` | Check ephemeral address balance |

---

## 3. Security Model

1.  **Secret Isolation**: The decryption key (secret) is part of the URL hash (`#secret`). It is never sent to the server.
2.  **Client-Side Processing**: Encryption and decryption happen entirely on the client side.
3.  **Ephemeral Funds**: Funds are held in a dedicated temporary address on-chain until claimed.

---

## 4. Usage Example

### Creating a Link
```typescript
import { useNasunLink } from '@nasun/wallet';

const { createLink } = useNasunLink();

const create = async () => {
  const { url } = await createLink({
    type: 'single',
    coinType: '0x2::sui::SUI',
    amount: 1_000_000_000n, // 1 SUI
  });
  console.log('Share this URL:', url.fullUrl);
};
```

### Claiming a Link
```typescript
import { useNasunLink } from '@nasun/wallet';

const { claim, parseUrl, validateClaim } = useNasunLink();

const handleClaim = async (fullUrl: string) => {
  const { linkId, secret } = parseUrl(fullUrl);
  const linkData = await fetchLinkData(linkId);

  const validation = await validateClaim(linkData);
  if (!validation.isValid) {
    console.error('Cannot claim:', validation.reason);
    return;
  }

  const result = await claim(linkData, secret);
  console.log('Claimed:', result.txDigest);
};
```