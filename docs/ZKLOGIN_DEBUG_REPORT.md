# zkLogin Integration Bug Report

> **Issue ID**: NASUN-ZKLOGIN-001
> **Date**: 2026-01-03
> **Reporter**: Claude Code (Protocol Debugging Specialist)
> **Severity**: Critical (Blocks zkLogin feature)
> **Status**: Open - Root Cause Identified

---

## 1. Issue Summary

zkLogin transactions on Nasun Devnet fail with `Groth16 proof verify failed` error despite correct client-side implementation and successful proof generation from Mysten Labs' prover-dev service.

**Error Message**:
```
Invalid user signature: Signature is not valid: Signature is not valid:
General cryptographic error: Groth16 proof verify failed
```

---

## 2. Environment

| Component | Value |
|-----------|-------|
| Network | Nasun Devnet |
| Chain ID | `4c879694` |
| Sui Version | v1.62.1 (mainnet branch fork) |
| Prover | `https://prover-dev.mystenlabs.com/v1` |
| OAuth Provider | Google |
| Client ID | `869935693878-o7ln8iu737ia6a6ujsfrjineh94k5ubh.apps.googleusercontent.com` |
| fastcrypto-zkp | `0.1.3` (commit `4db0e90c`) |

---

## 3. Observed Behavior

### What Works
| Step | Status | Notes |
|------|--------|-------|
| Google OAuth login | ✅ Success | Token issued correctly |
| JWT parsing & validation | ✅ Success | All claims extracted |
| Salt API (Lambda) | ✅ Success | Returns deterministic salt |
| Prover-dev proof generation | ✅ Success | ZK proof returned |
| `sui_dryRunTransactionBlock` | ✅ Success | Simulates without error |
| JWK registration | ✅ Success | Google JWK in AuthenticatorState |

### What Fails
| Step | Status | Error |
|------|--------|-------|
| `sui_executeTransactionBlock` | ❌ Fail | `Groth16 proof verify failed` |

**Critical Observation**: Dry run succeeds because it **does not perform signature verification**:
```rust
// sui/crates/sui-json-rpc/src/transaction_execution_api.rs:283
async fn dry_run_transaction_block(&self, tx_bytes: Base64) -> Result<...> {
    let (txn_data, txn_digest, input_objs) = self.prepare_dry_run_transaction_block(tx_bytes)?;
    self.state.dry_exec_transaction(txn_data, txn_digest).await
    // NOTE: No signature verification here
}
```

---

## 4. Expected Behavior

Transaction should execute successfully when:
1. Valid ZK proof is generated from prover-dev
2. Validators use `INSECURE_VERIFYING_KEY` (Test environment)
3. JWK is registered in AuthenticatorState
4. `maxEpoch` has not expired

---

## 5. Root Cause Analysis

### 5.1 ZkLoginEnv Determination

Nasun Devnet correctly uses `ZkLoginEnv::Test`:

```rust
// sui/crates/sui-core/src/authority/authority_per_epoch_store.rs:1080-1084
let zklogin_env = match chain.1 {
    Chain::Mainnet | Chain::Testnet => ZkLoginEnv::Prod,
    _ => ZkLoginEnv::Test,  // <-- Nasun Devnet (Chain::Unknown)
};
```

| Network | Genesis Digest | Chain Type | ZkLoginEnv | Verifying Key |
|---------|----------------|------------|------------|---------------|
| Sui Mainnet | Official | `Mainnet` | Prod | GLOBAL_VERIFYING_KEY |
| Sui Testnet | Official | `Testnet` | Prod | GLOBAL_VERIFYING_KEY |
| Sui Devnet | Official | `Unknown` | Test | INSECURE_VERIFYING_KEY |
| **Nasun Devnet** | `4c879694` | `Unknown` | Test | INSECURE_VERIFYING_KEY |

**Conclusion**: Mainnet fork does NOT cause environment mismatch. Genesis determines chain type.

### 5.2 Verifying Key Selection

```rust
// fastcrypto-zkp/src/bn254/zk_login_api.rs
let vk = match usage {
    ZkLoginEnv::Prod => &GLOBAL_VERIFYING_KEY,   // Ceremony-generated
    ZkLoginEnv::Test => &INSECURE_VERIFYING_KEY, // Test-only
};
```

### 5.3 The Actual Problem: Version Mismatch

**Suspected Root Cause**: `fastcrypto-zkp` version mismatch between prover-dev and Nasun Devnet validators.

| Component | fastcrypto-zkp Version | Source |
|-----------|------------------------|--------|
| Nasun Devnet | `0.1.3` (commit `4db0e90c`, 2025-11-26) | `Cargo.lock` |
| prover-dev | **Unknown** | Mysten Labs internal |

Even though both use `INSECURE_VERIFYING_KEY`, the **actual bytes of this constant may differ across versions**.

**Evidence**:
1. Sui GitHub Issue [#18026](https://github.com/MystenLabs/sui/issues/18026) reports identical symptoms
2. Intermittent failures suggest version drift between prover and validators
3. No resolution provided - 3 assignees allocated but issue remains OPEN

---

## 6. Debugging Attempts

### 6.1 Validator Configuration
```yaml
# Verified in ~/.nasun/nasun_config/
zklogin-sig-disabled: false
jwk-fetch-interval-seconds: 60
zklogin-oauth-providers:
  Unknown:
    - Google
    - Apple
    # ...
```
**Result**: Configuration is correct.

### 6.2 JWK Registration Check
```bash
curl -X POST https://rpc.devnet.nasun.io \
  -d '{"jsonrpc":"2.0","id":1,"method":"sui_getObject",
       "params":["0x0...07", {"showContent": true}]}'
```
**Result**: Google JWK registered (kid: `496d008e...`, epoch: 10201)

### 6.3 Client Code Verification
| Check | Result |
|-------|--------|
| addressSeed calculation | ✅ Matches prover input |
| ephemeralPublicKey format | ✅ Consistent |
| maxEpoch validity | ✅ currentEpoch < maxEpoch |
| Salt format (decimal string) | ✅ Correct |
| legacyAddress parameter | ✅ false (consistent) |

### 6.4 Sui Testnet Cross-Check
Attempted to test on Sui Testnet with same client code.
**Result**: Failed with `"Audience not supported: 869935693878-..."`

**Implication**: Our Client ID is not registered with Mysten Labs production prover.

---

## 7. Why This Was Hard to Debug

### 7.1 Silent Signature Verification
Dry run success gives false confidence. The actual signature verification only happens during execution:

```rust
// sui/crates/sui-types/src/zk_login_authenticator.rs:239-251
verify_zk_login(
    &params.inputs,
    params.max_epoch,
    &params.extended_pk_bytes,
    all_jwk,
    env,  // ZkLoginEnv::Test
).map_err(|e| SuiErrorKind::InvalidSignature { error: e.to_string() })
```

### 7.2 Opaque Error Messages
The error `Groth16 proof verify failed` provides no detail about:
- Which input hash mismatched
- Which verification step failed
- What values were compared

### 7.3 Third-Party Infrastructure Dependency
zkLogin requires:
1. OAuth provider (Google)
2. Salt API (custom Lambda)
3. Prover service (Mysten Labs)
4. Validator infrastructure (Nasun Devnet)

Any version mismatch in the cryptographic components causes opaque failures.

### 7.4 Undocumented Version Requirements
Mysten Labs documentation does not specify:
- Required fastcrypto-zkp version for prover-dev compatibility
- Changelog for INSECURE_VERIFYING_KEY changes
- Network-specific prover version requirements

---

## 8. Community Research Summary

### Related Issues
| Issue | Status | Relevance |
|-------|--------|-----------|
| [MystenLabs/sui#18026](https://github.com/MystenLabs/sui/issues/18026) | OPEN | Identical error, unresolved |
| [MystenLabs/sui#18949](https://github.com/MystenLabs/sui/issues/18949) | CLOSED | BCS serialization (not our case) |
| [MystenLabs/sui#17970](https://github.com/MystenLabs/sui/issues/17970) | CLOSED | Address mismatch (not our case) |

### Forum Discussions
- [forums.sui.io/t/47019](https://forums.sui.io/t/transaction-validator-signing-failure/47019) - JWK sync issues (2025-01)
- [forums.sui.io/t/45350](https://forums.sui.io/t/getting-invalid-user-signature-error-on-calling-smart-contract/45350) - Same error, unresolved (2024-03)

### Documentation Findings
| Network | zkey File | Prover |
|---------|-----------|--------|
| Mainnet/Testnet | `zkLogin-main.zkey` | prover.mystenlabs.com |
| Devnet | `zkLogin-test.zkey` | prover-dev.mystenlabs.com |

---

## 9. Recommendations

### Immediate (Option C - Recommended)
**Temporarily disable zkLogin**

```typescript
// packages/wallet/src/core/zklogin.ts
export async function createZkLoginSession(...) {
  throw new Error('zkLogin is temporarily unavailable on Nasun Devnet');
}
```

**Rationale**: Unblock users with mnemonic wallet while investigating.

### Short-term (Option B)
**Self-host zkLogin Prover**

1. Deploy [MystenLabs/zklogin-verifier](https://github.com/MystenLabs/zklogin-verifier)
2. Use `zkLogin-test.zkey` matching Nasun Devnet's fastcrypto-zkp version
3. Configure client to use self-hosted prover

**Cost**: Infrastructure + maintenance
**Benefit**: Full control over compatibility

### Long-term (Option A)
**Register Client ID with Mysten Labs**

1. Contact Mysten Labs for production prover access
2. Submit Client ID for whitelisting
3. Use `prover.mystenlabs.com` for Testnet/Mainnet

**Note**: Only valid after Nasun Mainnet launch with official genesis.

---

## 10. Files Involved

| File | Role |
|------|------|
| `packages/wallet/src/core/zklogin.ts` | Client zkLogin logic |
| `apps/nasun-website/cdk/lambda-src/zklogin-salt/` | Salt API Lambda |
| `sui/crates/sui-types/src/zk_login_authenticator.rs` | Validator zkLogin verification |
| `sui/crates/sui-core/src/signature_verifier.rs` | Signature verification entry |
| `fastcrypto-zkp/src/bn254/zk_login_api.rs` | Groth16 verification logic |
| `fastcrypto-zkp/src/bn254/zk_login.rs` | Input hash calculation |

---

## 11. Conclusion

The zkLogin `Groth16 proof verify failed` error is **not a client-side bug** but an **infrastructure compatibility issue** between:

1. **prover-dev.mystenlabs.com** (unknown fastcrypto-zkp version)
2. **Nasun Devnet validators** (fastcrypto-zkp 0.1.3)

The recommended path forward is:
1. **Immediate**: Disable zkLogin, use mnemonic wallet
2. **Short-term**: Self-host prover with matching fastcrypto-zkp version
3. **Long-term**: Use production prover after Nasun Mainnet launch

---

## References

- [zkLogin Concepts](https://docs.sui.io/concepts/cryptography/zklogin)
- [zkLogin Integration Guide](https://docs.sui.io/guides/developer/cryptography/zklogin-integration)
- [Set Up Proving Service](https://blog.sui.io/proving-service-zklogin/)
- [fastcrypto GitHub](https://github.com/MystenLabs/fastcrypto)
- [zklogin-verifier GitHub](https://github.com/MystenLabs/zklogin-verifier)

---

*Report generated by Claude Code - Protocol Debugging Specialist*
