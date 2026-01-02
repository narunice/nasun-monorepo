# zkLogin "Invalid Signature" 디버깅 보고서

**날짜**: 2026-01-02
**환경**: Nasun Devnet
**문제**: Google zkLogin 로그인 시 "Invalid signature was given to the function" 에러

---

## 1. 증상

### 성공하는 것
- Google OAuth 로그인 완료
- JWT 파싱 및 검증
- Salt API 호출 및 응답
- Mysten Labs prover-dev에서 proof 생성
- Dry run (sui_dryRunTransactionBlock) 성공

### 실패하는 것
- 실제 트랜잭션 실행 (sui_executeTransactionBlock)
- 에러 메시지: "Invalid signature was given to the function"

---

## 2. 확인 완료 항목 ✅

### 2.1 JWK 등록 상태
```bash
# AuthenticatorState 확인
curl -X POST https://rpc.devnet.nasun.io \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"sui_getObject","params":["0x0000000000000000000000000000000000000000000000000000000000000007", {"showContent": true}]}'
```

**결과**: Google JWK 등록됨
- kid: `496d008e8c7be1cae4209e0d5c21b050a61e960f`
- epoch: 10201
- iss: `https://accounts.google.com`

### 2.2 Validator 설정
```yaml
# ~/.nasun/nasun_config/3.38.127.23-2000.yaml
zklogin-sig-disabled: false
jwk-fetch-interval-seconds: 60  # 3600에서 변경
zklogin-oauth-providers:
  Unknown:
    - Google
    - Apple
    # ... 기타 providers
```

### 2.3 ZkLoginEnv 결정
```rust
// sui/crates/sui-core/src/authority/authority_per_epoch_store.rs:1080-1084
let zklogin_env = match chain.1 {
    Chain::Mainnet | Chain::Testnet => ZkLoginEnv::Prod,
    _ => ZkLoginEnv::Test,  // ← Nasun Devnet
};
```

**결과**: Nasun Devnet은 `ZkLoginEnv::Test` 사용 → `INSECURE_VERIFYING_KEY` 사용

### 2.4 fastcrypto-zkp 버전
```toml
# sui/Cargo.lock
name = "fastcrypto-zkp"
version = "0.1.3"
source = "git+https://github.com/MystenLabs/fastcrypto?rev=4db0e90c732bbf7420ca20de808b698883148d9c"
```

**커밋 날짜**: 2025-11-26 (약 1달 전, 최신)

### 2.5 Prover 호환성
- **클라이언트 prover**: `https://prover-dev.mystenlabs.com/v1`
- **prover-dev 용도**: Sui Testnet/Devnet용 (INSECURE_VERIFYING_KEY)
- **Nasun Devnet**: `ZkLoginEnv::Test` → `INSECURE_VERIFYING_KEY`

**이론상 호환됨**

---

## 3. 검증 흐름 분석

### 3.1 Dry Run vs 실제 실행

```rust
// sui/crates/sui-json-rpc/src/transaction_execution_api.rs:283
async fn dry_run_transaction_block(&self, tx_bytes: Base64) -> Result<...> {
    // TransactionData만 파싱, 서명 검증 X
    let (txn_data, txn_digest, input_objs) = self.prepare_dry_run_transaction_block(tx_bytes)?;
    self.state.dry_exec_transaction(txn_data, txn_digest).await
}
```

**핵심**: Dry run은 서명 검증을 수행하지 않음!

### 3.2 실제 서명 검증

```rust
// sui/crates/sui-types/src/zk_login_authenticator.rs:239-251
verify_zk_login(
    &params.inputs,
    params.max_epoch,
    &params.extended_pk_bytes,
    all_jwk,
    env,  // ZkLoginEnv::Test
)
.map_err(|e| SuiErrorKind::InvalidSignature { error: e.to_string() })
```

### 3.3 Groth16 검증

```rust
// fastcrypto-zkp/src/bn254/zk_login_api.rs:344-352
match verify_zk_login_proof_with_fixed_vk(
    env,
    &input.get_proof().as_arkworks()?,
    &[input.calculate_all_inputs_hash(eph_pubkey_bytes, &modulus, max_epoch)?],
) {
    Ok(true) => Ok(()),
    Ok(false) | Err(_) => Err(FastCryptoError::GeneralError(
        "Groth16 proof verify failed".to_string(),
    )),
}
```

---

## 4. 가능한 원인

### 4.1 Proof 생성과 검증 불일치 (가장 유력)

`calculate_all_inputs_hash` 함수가 계산하는 값:

```rust
// fastcrypto-zkp/src/bn254/zk_login.rs:564-595
poseidon_zk_login(&[
    first,            // ephemeral pubkey split (1)
    second,           // ephemeral pubkey split (2)
    addr_seed,        // address seed
    max_epoch_f,      // max epoch
    iss_base64_f,     // issuer base64
    index_mod_4_f,    // issuer index mod 4
    header_f,         // JWT header base64
    modulus_f,        // JWK modulus
])
```

**가능한 불일치 지점**:
1. `eph_pubkey_bytes` 형식 차이
2. `modulus` 인코딩 차이
3. `addr_seed` 계산 방식 차이

### 4.2 Salt 형식

```typescript
// Lambda (zklogin-salt/src/index.ts:127-131)
function generateSalt(): string {
  const hexSalt = randomBytes(16).toString('hex');
  return BigInt('0x' + hexSalt).toString();  // decimal string
}

// 클라이언트 (wallet/src/core/zklogin.ts:349-352)
const isDecimal = /^[0-9]+$/.test(salt);
const saltBigInt = isDecimal
  ? BigInt(salt)
  : BigInt(salt.startsWith('0x') ? salt : '0x' + salt);
```

**확인 필요**: Salt가 올바르게 전달되는지

### 4.3 legacyAddress 파라미터

```typescript
// @mysten/sui/zklogin
jwtToAddress(jwt: string, userSalt: string | bigint, legacyAddress = false)
```

- Lambda: `jwtToAddress(jwt, salt)` → legacyAddress = false
- 클라이언트: `jwtToAddress(jwt, salt)` → legacyAddress = false

**동일하므로 문제 아님**

### 4.4 fastcrypto-zkp 버전 불일치

Mysten Labs prover-dev가 사용하는 fastcrypto-zkp 버전과
Nasun Devnet이 사용하는 버전이 다를 수 있음.

**확인 방법**: Sui Testnet에서 동일한 코드로 테스트

---

## 5. 추가 확인 필요 항목

### 5.1 Validator 로그
Debug 레벨에서도 zkLogin 검증 관련 로그가 출력되지 않음.
RPC 레벨에서 거부되고 있을 가능성.

```bash
# 현재 설정
Environment="RUST_LOG=debug,consensus_core=warn"
```

### 5.2 클라이언트 데이터 검증
콘솔 로그에서 확인된 값들:
- addressSeed: 일치 (로그에서 확인)
- ephemeralPublicKey: proof 생성 시와 서명 시 동일 (로그에서 확인)
- maxEpoch: 유효 (현재 epoch < maxEpoch)

---

## 6. 권장 다음 단계

### 6.1 즉시 확인
1. **Sui Testnet에서 테스트**
   - 동일한 클라이언트 코드로 Sui Testnet에서 zkLogin 테스트
   - 성공하면: Nasun Devnet 특유의 문제
   - 실패하면: 클라이언트 코드 문제

2. **Salt 값 로깅**
   - Lambda에서 생성한 salt와 클라이언트에서 사용하는 salt가 동일한지 확인

3. **Proof 검증 데이터 비교**
   - Mysten Labs prover-dev에 전달하는 데이터
   - Nasun Devnet 노드에서 검증하는 데이터

### 6.2 심층 디버깅
1. **RPC 레벨 로그 추가**
   - `sui_executeTransactionBlock` 핸들러에 서명 검증 결과 로깅

2. **fastcrypto-zkp 버전 확인**
   - Mysten Labs prover-dev가 사용하는 버전 확인
   - 필요시 Nasun Devnet의 fastcrypto-zkp 업데이트

3. **상세 에러 메시지 확인**
   - `verify_zk_login` 함수에서 반환하는 실제 에러 메시지 캡처

---

## 7. 관련 파일

| 파일 | 역할 |
|------|------|
| `packages/wallet/src/core/zklogin.ts` | 클라이언트 zkLogin 로직 |
| `apps/nasun-website/cdk/lambda-src/zklogin-salt/src/index.ts` | Salt API Lambda |
| `sui/crates/sui-types/src/zk_login_authenticator.rs` | 노드 zkLogin 검증 |
| `sui/crates/sui-core/src/signature_verifier.rs` | 서명 검증기 |
| `fastcrypto-zkp/src/bn254/zk_login_api.rs` | Groth16 검증 로직 |
| `fastcrypto-zkp/src/bn254/zk_login.rs` | zkLogin 입력 계산 |

---

## 8. 요약

**문제**: zkLogin 트랜잭션이 "Invalid signature" 에러로 실패

**확인 완료**:
- JWK 등록됨 ✅
- OAuth providers 설정됨 ✅
- ZkLoginEnv::Test 사용 (prover-dev 호환) ✅
- fastcrypto-zkp 버전 최신 ✅

**가장 유력한 원인**:
- Groth16 proof 검증 실패
- `calculate_all_inputs_hash`에서 계산되는 값과 proof가 불일치

**다음 단계**:
1. Sui Testnet에서 테스트하여 Nasun Devnet 특유 문제인지 확인
2. Salt 값과 ephemeral pubkey가 올바르게 전달되는지 상세 확인
