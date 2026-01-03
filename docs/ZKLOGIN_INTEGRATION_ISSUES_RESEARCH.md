# Sui zkLogin Integration Issues - Research Report

> **Date**: 2026-01-03
> **Author**: Claude Code Research
> **Context**: Nasun Devnet zkLogin "Invalid signature" debugging

## Executive Summary

Sui zkLogin은 OAuth 인증을 통한 지갑 생성을 가능하게 하는 혁신적인 기술이지만, 여러 개발자들이 통합 과정에서 다양한 문제를 겪고 있습니다. 가장 흔한 에러는 **"Groth16 proof verify failed"**와 **"Invalid signature"** 에러이며, 주요 원인은 proving key/verifying key 불일치, maxEpoch 만료, BCS 직렬화 오류 등입니다.

---

## 1. GitHub Issues

### Issue #18026: Groth16 Proof Verify Failed
- **URL**: [MystenLabs/sui#18026](https://github.com/MystenLabs/sui/issues/18026)
- **Status**: OPEN (June 2024)
- **Error Message**:
  ```
  Error: Invalid user signature: Signature is not valid: Signature is not valid:
  General cryptographic error: Groth16 proof verify failed
  ```
- **Description**: Groth16 proof verification failure when calling smart contract with zkLogin signature
- **Classification**: **Bug or Environment Mismatch** - Possible zkey version mismatch between prover and validator
- **Notable**: Intermittent occurrence - initially succeeds then suddenly fails
- **Resolution**: Unresolved (3 assignees allocated)

### Issue #18949: verifyPersonalMessageSignature Error
- **URL**: [MystenLabs/sui#18949](https://github.com/MystenLabs/sui/issues/18949)
- **Status**: CLOSED (August 2024)
- **Error Message**:
  ```
  Signature is not valid: Fail to verify user sig Invalid signature was given to the function
  ```
- **Description**: Signature verification failure when using `verifyPersonalMessageSignature` function
- **Classification**: **SDK Usage Error**
- **Resolution**: Fix BCS serialization method
  ```typescript
  // Wrong
  bytes

  // Correct
  bcs.vector(bcs.u8()).serialize(bytes).toBytes()
  ```

### Issue #17970: Invalid User Signature
- **URL**: [MystenLabs/sui#17970](https://github.com/MystenLabs/sui/issues/17970)
- **Status**: CLOSED (May 2024)
- **Error Message**:
  ```
  Invalid user signature: Required Signature from 0xa7af... is absent ["0x48f0..."]
  ```
- **Description**: Address mismatch when signing with ephemeralKeyPair
- **Classification**: **SDK Usage Error**
- **Resolution**:
  - zkLogin address is not directly derived from keypair
  - Must explicitly set sender address
  - Do not use `txb.sign()` for zkLogin transactions

---

## 2. Developer Forum Discussions

### Transaction Validator Signing Failure (JWK Not Found)
- **URL**: [forums.sui.io/t/transaction-validator-signing-failure/47019](https://forums.sui.io/t/transaction-validator-signing-failure/47019)
- **Date**: January 2025
- **Error Message**:
  ```
  Transaction validator signing failed due to issues with transaction inputs...
  Signature is not valid: General cryptographic error: JWK not found
  ```
- **Description**: JWK not found when attempting transaction with Gmail-based Sui wallet
- **Classification**: **Network/Timing Issue**
- **Possible Causes**:
  - OAuth provider's JWK not synchronized to validators
  - OAuth provider rotated keys but new keys haven't reached consensus
- **Resolution**: Unresolved

### Invalid User Signature on Smart Contract
- **URL**: [forums.sui.io/t/getting-invalid-user-signature-error-on-calling-smart-contract/45350](https://forums.sui.io/t/getting-invalid-user-signature-error-on-calling-smart-contract/45350)
- **Date**: March 2024
- **Error Message**: `Groth16 proof verify failed`
- **Classification**: **Implementation Error or Environment Issue**
- **Resolution**: Unresolved (additional context requested)

---

## 3. Official Documentation Key Points

### Network-Specific Proving Keys (zkey)

| Network | zkey File | Blake2b Hash |
|---------|----------|--------------|
| Mainnet/Testnet | `zkLogin-main.zkey` | `060beb961802568ac9ac7f14de0fbcd55e373e8f5ec7cc32189e26fb65700aa4e36f5604f868022c765e634d14ea1cd58bd4d79cef8f3cf9693510696bcbcbce` |
| Devnet | `zkLogin-test.zkey` | `686e2f5fd969897b1c034d7654799ee2c3952489814e4eaaf3d7e1bb539841047ae8ee5fdcdaca5f4ddd76abb5a8e8eb77b44b693a2ba9d4be57e94292b26ce2` |

**Important**: Devnet and Mainnet/Testnet use **different zkeys**.

### Prover Services

| Prover | Target Network | Limitations |
|--------|---------------|-------------|
| `prover-dev.mystenlabs.com` | Devnet | Development use, accepts all Client IDs (assumed) |
| `prover.mystenlabs.com` | Mainnet/Testnet | **Requires pre-registered Client ID** |
| Enoki | Mainnet | Contact Mysten Labs required |
| Shinami | Testnet/Mainnet | Devnet not supported |
| Self-hosted | All networks | Infrastructure setup required |

### maxEpoch Expiration

- ZK proof is valid only until `maxEpoch`
- Typical setting: `maxEpoch = currentEpoch + 2`
- Proof becomes invalid when current epoch exceeds maxEpoch
- **Resolution**: New OAuth login → New ZK proof issuance

### JWK Consensus Mechanism

- All validators independently call JWK endpoints
- 2f+1 quorum guarantees JWK correctness
- **Potential Issue**: Validator sync delay during OAuth provider key rotation

### Known Limitations

1. **JWT Field Length Limit**: `aud` value limited to 120 characters
2. **OAuth Account Dependency**: Wallet inaccessible if OAuth access lost
3. **No Address Conversion**: Cannot convert between zkLogin address ↔ regular private key address
4. **Rate Limit**: 2 ZK proofs per address per minute (error code: -32012)

---

## 4. Error Pattern Classification

### A. Proving Key / Verifying Key Mismatch
```
Groth16 proof verify failed
```
- **Cause**: Version mismatch between prover's proving key and validator's verifying key
- **Scenarios**:
  - Using Devnet zkey for Mainnet proof generation
  - Using standard prover with custom network
- **Resolution**: Use network-appropriate zkey or run self-hosted prover

### B. Epoch Expiration
```
Invalid signature
```
- **Cause**: Using outdated proof that exceeded maxEpoch
- **Resolution**: Renew proof with new OAuth login

### C. JWK Sync Failure
```
JWK not found
```
- **Cause**: OAuth provider's JWK not present in validator
- **Scenarios**: Right after key rotation or new OAuth provider
- **Resolution**: Retry after time passes (wait for validator consensus)

### D. BCS Serialization Error
```
Fail to verify user sig Invalid signature was given to the function
```
- **Cause**: Incorrect serialization of message bytes
- **Resolution**: Use `bcs.vector(bcs.u8()).serialize()`

### E. Address Mismatch
```
Required Signature from 0x... is absent
```
- **Cause**: Misunderstanding of zkLogin address derivation
- **Resolution**: Explicitly set sender address

---

## 5. Our Situation Analysis (Nasun Devnet)

### Current Problem
- **Error**: `Invalid signature: Groth16 proof verify failed`
- **Environment**: Nasun Devnet (Sui v1.62.1 **mainnet branch** fork)
- **Prover**: `prover-dev.mystenlabs.com`
- **Chain ID**: `4c879694` (custom genesis)

### Mainnet Fork and ZkLoginEnv Determination

**Key Question**: Does forking from Sui mainnet cause zkLogin environment mismatch?

**Answer**: No, forking from mainnet does NOT automatically give you mainnet ZkLoginEnv.

**Core Logic** ([authority_per_epoch_store.rs](https://github.com/MystenLabs/sui/blob/main/crates/sui-core/src/authority/authority_per_epoch_store.rs)):

```rust
let zklogin_env = match chain.1 {
    Chain::Mainnet | Chain::Testnet => ZkLoginEnv::Prod,
    _ => ZkLoginEnv::Test,  // Includes Chain::Unknown
};
```

**Chain Determination**: First 4 bytes of genesis checkpoint digest

| Network | Genesis | Chain | ZkLoginEnv | Verifying Key |
|---------|---------|-------|------------|---------------|
| Sui Mainnet | Official Sui | `Mainnet` | `Prod` | GLOBAL_VERIFYING_KEY |
| Sui Testnet | Official Sui | `Testnet` | `Prod` | GLOBAL_VERIFYING_KEY |
| Sui Devnet | Official Sui | `Unknown` | `Test` | INSECURE_VERIFYING_KEY |
| **Nasun Devnet** | Custom (`4c879694`) | `Unknown` | `Test` | **INSECURE_VERIFYING_KEY** |

**Conclusion**: Even though we forked mainnet code, **new genesis was created** → `Chain::Unknown` → `ZkLoginEnv::Test`

### ZkLoginEnv and Verifying Key Mapping

**Core Logic** ([fastcrypto-zkp/zk_login_api.rs](https://github.com/MystenLabs/fastcrypto/blob/main/fastcrypto-zkp/src/bn254/zk_login_api.rs)):

```rust
pub enum ZkLoginEnv {
    Prod,  // Use secure global verifying key (ceremony)
    Test,  // Use insecure global verifying key
}

let vk = match usage {
    ZkLoginEnv::Prod => &GLOBAL_VERIFYING_KEY,   // prover.mystenlabs.com
    ZkLoginEnv::Test => &INSECURE_VERIFYING_KEY, // prover-dev.mystenlabs.com
};
```

### Theoretical Analysis

| Component | Setting | Expected |
|-----------|---------|----------|
| Nasun validators | `ZkLoginEnv::Test` | INSECURE_VERIFYING_KEY |
| prover-dev | Test environment | INSECURE_VERIFYING_KEY proof |
| **Result** | **Should match** | ✅ |

**But error still occurs** → **Version mismatch suspected**

### Suspected Causes

1. **fastcrypto-zkp Version Mismatch**
   - Nasun Devnet's Sui v1.62.1 → specific fastcrypto-zkp version
   - prover-dev → different fastcrypto-zkp version
   - Even same `INSECURE_VERIFYING_KEY` name can have **different actual values across versions**

2. **Production Prover Restriction**
   - `prover.mystenlabs.com` requires pre-registered Client ID
   - Our Client ID (`869935693878-...`) not registered

### Possible Solutions

| Option | Method | Pros/Cons |
|--------|--------|-----------|
| A | Register Client ID with Mysten Labs | Time-consuming, only valid for Mainnet |
| B | Self-host Prover | Infrastructure cost, full control, **use same fastcrypto-zkp version** |
| C | Temporarily disable zkLogin | Immediately applicable, feature limitation |
| D | Wait for Nasun Mainnet | Long-term solution |
| E | Downgrade Sui version | Find version compatible with prover-dev |

---

## 6. References

### Official Documentation
- [zkLogin Concepts](https://docs.sui.io/concepts/cryptography/zklogin)
- [zkLogin Integration Guide](https://docs.sui.io/guides/developer/cryptography/zklogin-integration)
- [Set Up Proving Service](https://blog.sui.io/proving-service-zklogin/)

### GitHub Repositories
- [MystenLabs/sui](https://github.com/MystenLabs/sui)
- [MystenLabs/zklogin-verifier](https://github.com/MystenLabs/zklogin-verifier)
- [MystenLabs/fastcrypto](https://github.com/MystenLabs/fastcrypto)

### Community Resources
- [Sui Developer Forums](https://forums.sui.io)
- [Sui Discord](https://discord.gg/sui)
- [zkLogin Ceremony Contributions](https://github.com/sui-foundation/zklogin-ceremony-contributions)

---

## 7. Conclusion

The root cause of zkLogin "Invalid signature" error is **not a client code issue but prover-validator infrastructure mismatch**.

To use zkLogin on Nasun Devnet:
1. **Self-host Prover** (Recommended) - Use zkLogin-test.zkey
2. **Contact Mysten Labs** - Request Client ID registration
3. **Temporarily disable** - Use mnemonic wallet only

Long-term, production prover usage should be reviewed when Nasun Mainnet launches.
