# Nasun Link v2 Implementation Status

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

### 2.2. React Hooks (`packages/wallet/src/hooks/`)

| Hook | Description |
|------|-------------|
| `useNasunLink` | Provides methods to create (single/batch) and claim links. |
| `useClaimLink` | Helper hook to parse URL and manage claim state for a specific link. |

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

const { claim, parseUrl } = useNasunLink();

const handleClaim = async (fullUrl) => {
  const { linkId, secret } = parseUrl(fullUrl);
  // Fetch linkData from storage using linkId...
  const linkData = await fetchLinkData(linkId); 
  
  await claim(linkData, secret);
};
```