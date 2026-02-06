# zkLogin Troubleshooting Guide

> **Last Updated**: 2026-01-03
> **Status**: Resolved

This document records the zkLogin "Invalid Signature" debugging process and solution for Nasun Devnet.

---

## Problem Summary

zkLogin transactions failed with signature verification error despite successful OAuth login and ZK proof generation.

**Error Message**:
```
Invalid user signature: Signature is not valid: Fail to verify user sig
Invalid signature was given to the function
```

---

## Environment

| Component | Value |
|-----------|-------|
| Network | Nasun Devnet |
| RPC | `https://rpc.devnet.nasun.io` |
| Prover | `https://rpc.devnet.nasun.io/zkprover/v1` (self-hosted) |
| OAuth | Google |
| SDK | `@mysten/sui` v1.45.2 |

---

## Root Cause

**Wrong**: Using `keypair.sign(txBytes)` for userSignature generation.

```typescript
// WRONG - Raw Ed25519 signature without intent or hash
const rawSignature = await keypair.sign(txBytes);
const userSignature = toSerializedSignature({
  signature: rawSignature,
  signatureScheme: 'ED25519',
  publicKey: keypair.getPublicKey(),
});
```

**Why it's wrong**:
1. `keypair.sign()` only performs raw Ed25519 signing
2. No intent prefix is applied
3. No blake2b hash is computed
4. Validators expect: `sign(blake2b(intent + txBytes))`

---

## Solution

Use `keypair.signTransaction()` which properly:
1. Applies intent prefix (`TransactionData`)
2. Computes blake2b hash of intent message
3. Signs the digest (not raw bytes)
4. Returns serialized signature format

```typescript
// CORRECT - Uses signTransaction() with proper intent + blake2b
const { signature: userSignature } = await keypair.signTransaction(txBytes);
```

**File**: [packages/wallet/src/core/zklogin.ts:470](../packages/wallet/src/core/zklogin.ts#L470)

---

## SDK Signing Methods Comparison

| Method | Intent | Blake2b | Format | Use Case |
|--------|--------|---------|--------|----------|
| `keypair.sign(data)` | No | No | Raw 64 bytes | Low-level, internal use only |
| `keypair.signTransaction(bytes)` | Yes | Yes | Serialized 97 bytes | Transaction signing |
| `keypair.signPersonalMessage(bytes)` | Yes | Yes | Serialized | Message signing |

**Key SDK Code** (`@mysten/sui/cryptography/keypair.js`):

```javascript
// Signer base class
async signWithIntent(bytes, intent) {
  const intentMessage = messageWithIntent(intent, bytes);  // 1. Add intent
  const digest = blake2b(intentMessage, { dkLen: 32 });    // 2. Blake2b hash
  const signature = toSerializedSignature({
    signature: await this.sign(digest),                     // 3. Sign digest!
    signatureScheme: this.getKeyScheme(),
    publicKey: this.getPublicKey(),
  });
  return { signature, bytes: toBase64(bytes) };
}

async signTransaction(bytes) {
  return this.signWithIntent(bytes, "TransactionData");
}
```

---

## Debugging Timeline

### Initial Hypothesis (Rejected)

| Hypothesis | Status | Reason |
|------------|--------|--------|
| fastcrypto-zkp version mismatch | Rejected | Same error on Sui Devnet |
| addressSeed format | Rejected | Error was about "user signature" |
| userSignature 64 vs 97 bytes | Partial | Format was wrong, but root cause was deeper |

### Root Cause Discovery

1. Changed userSignature from 64 bytes to 97 bytes (serialized format)
2. Still failed with "Fail to verify user sig"
3. Tested on Sui Devnet with prover-dev → Same error
4. Analyzed SDK source code (`keypair.js`)
5. Found: `signTransaction()` applies intent + blake2b, but `sign()` doesn't
6. **Fixed**: Changed `keypair.sign()` → `keypair.signTransaction()`

---

## Verification

**Successful Transaction**: `8ypbkdh6Qhh6WmLwZ29RMkpgYarjaWCem4i5X7Szrj5u`

**Commit**: `1c23706`

**Tag**: `zklogin-v1.0.0`

---

## Key Files

| File | Role |
|------|------|
| `packages/wallet/src/core/zklogin.ts` | zkLogin core logic (signing, proof, etc.) |
| `packages/wallet/src/hooks/useZkLogin.ts` | React hook for zkLogin |
| `apps/pado/frontend/src/hooks/useTokenTransaction.ts` | Token transfer with zkLogin |

---

## Lessons Learned

1. **Read SDK source code**: Documentation may not cover all edge cases
2. **Test on official networks first**: Helps isolate client vs infrastructure issues
3. **Check signing method carefully**: `sign()` vs `signTransaction()` have very different behaviors
4. **Intent prefix matters**: Sui uses intent-based signing for domain separation

---

## Related Resources

- [Sui zkLogin Documentation](https://docs.sui.io/concepts/cryptography/zklogin)
- [Sui Cryptography Concepts](https://docs.sui.io/concepts/cryptography/transaction-auth/signatures)
- [@mysten/sui SDK](https://github.com/MystenLabs/sui/tree/main/sdk/typescript)

---

## Quick Reference

### zkLogin Flow

```
1. OAuth Login → JWT
2. Fetch Salt → Salt API (Lambda)
3. Generate ZK Proof → Prover
4. Build Transaction → Sui SDK
5. Sign with Ephemeral Key → keypair.signTransaction()  ← KEY FIX
6. Create zkLogin Signature → getZkLoginSignature()
7. Execute Transaction → RPC
```

### Debug Checklist

- [ ] JWT valid and not expired?
- [ ] Salt returned correctly?
- [ ] ZK proof generated?
- [ ] maxEpoch > currentEpoch?
- [ ] **Using `signTransaction()` not `sign()`?** ← Most likely issue
- [ ] JWK registered in AuthenticatorState?
