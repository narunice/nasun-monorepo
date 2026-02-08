# ExecutionComplianceRecord (ECR) 설계

> **후속 문서**: ECR을 30개 필드로 확장한 AIExecutionReport(AER) 설계는 [AER_DESIGN.md](AER_DESIGN.md) 참조.
> AER은 Authorization Proof, Decision Lineage, Economic Context 3개 카테고리(8 필드)를 추가하여
> AI agent의 경제 활동 감사를 지원한다.

## 요약

ExecutionComplianceRecord는 AI 실행이 정해진 프로세스 규칙을 따랐다는 사실을
부인 불가능하게 고정한 on-chain 증명 객체다.

**핵심 원칙:**
- 내용(prompt/output)은 절대 포함하지 않는다 — 프로세스 준수만 기록
- 생성 후 변경 불가 — compliance record는 수정할 수 없다
- 누구나 검증 가능 — 모든 필드가 on-chain에 존재
- 독립 패키지 — cross-package 의존성 없음 (데이터는 파라미터로 전달)

## 왜 지금 만드는가

ECR은 "기능"이 아니라 "기록 구조"다.
스테이킹 계층화, buyback & burn 같은 경제 메커니즘이 추가될 때마다
ECR에 기록할 필드가 늘어나므로, 빈 그릇을 먼저 만들고 기능이 붙을 때마다 채워가는 게 맞다.

- ECR 없이 정산되는 실행들은 compliance 관점에서 **영구적으로 증명 불가능한 빈 구간**
- 스테이킹 계층화를 나중에 만들면 "실행 시점에 Executor가 어떤 티어였는가"를 저장할 곳이 없음
- 구현 비용이 낮음: submit_proof()에서 struct 하나 더 생성하는 수준

## 현재 Gap 분석

| 항목 | 현재 상태 | 문제 |
|------|----------|------|
| Execution Context | ComputeRequest에 존재 | 충분 |
| Environment Proof | off-chain only (AttestationDocument) | **on-chain 기록 없음** |
| Policy/Ruleset | 글로벌 상수 (MIN_PRICE, TIMEOUT) | **요청별 스냅샷 없음** |
| Economic Finality | escrow + payment 존재 | 충분 |
| Attestation Verification | server.ts에서 수행 | **결과 저장 안 됨** |
| Credibility Snapshot | executor-level reputation만 | **실행 시점 스냅샷 없음** |
| Settlement Receipt | RequestReceipt NFT | **최소 데이터, attestation 없음** |

## 구조

### 패키지 위치

```
apps/baram/contracts-compliance/
├── Move.toml
└── sources/
    └── compliance.move
```

### 핵심 Struct

```move
public struct ExecutionComplianceRecord has key, store {
    id: UID,

    // === Execution Context ===
    request_id: u64,
    requester: address,
    executor: address,
    model: String,
    prompt_hash: vector<u8>,       // SHA-256 (내용이 아닌 식별자)

    // === Execution Result ===
    result_hash: vector<u8>,       // SHA-256 (내용이 아닌 식별자)
    execution_time_ms: u64,

    // === Environment Proof ===
    tee_type: u8,                  // 0=None, 1=Nitro, 2=SGX, 3=SEV
    pcr0: vector<u8>,              // 실제 PCR0 (48 bytes)
    attestation_hash: vector<u8>,  // COSE_Sign1 rawDocument의 SHA-256
    pcr_baseline_version: u64,     // 검증에 사용된 baseline version
    pcr_verified: bool,            // PCR 검증 통과 여부

    // === Credibility Snapshot ===
    executor_reputation: u64,      // 실행 시점의 평판 (0-1000)
    executor_stake_amount: u64,    // 실행 시점의 스테이킹 양
    executor_slash_count: u64,     // 실행 시점의 슬래싱 횟수

    // === Economic Finality ===
    payment_amount: u64,           // NUSDC 정산 금액

    // === Temporal Proof ===
    request_created_at: u64,       // 요청 생성 시각
    settled_at: u64,               // 정산 완료 시각

    // === Policy Snapshot ===
    policy_version: u64,           // 적용된 정책 버전
    timeout_ms: u64,               // 적용된 타임아웃
    min_price: u64,                // 적용된 최소 가격
}
```

### 보조 Struct

- **ComplianceRegistry** (shared object): total_records, record_ids 테이블, 정책 파라미터
- **AdminCap**: 정책 업데이트 권한
- **ComplianceRecordCreated** (event): 인덱싱용 이벤트

### 함수

| 함수 | 유형 | 설명 |
|------|------|------|
| `create_record()` | entry | 정산 시 ECR 생성, requester에게 전송 |
| `update_policy()` | entry (admin) | 정책 파라미터 업데이트 |
| `is_fully_compliant()` | view | TEE + PCR verified + staked 확인 |
| `is_tee_execution()` | view | TEE 사용 여부 |
| `get_*()` | view | 각 필드 getter |

## 아키텍처 결정

### 왜 독립 패키지인가

`baram.move`의 `submit_proof()`를 수정하려면 패키지 업그레이드가 필요하고,
ExecutorRegistry, AttestationRegistry를 인자로 받으면 shared object 접근이 늘어난다.

대신 **독립 패키지**로 만들어서:
1. 기존 baram 패키지를 수정하지 않음 (하위 호환)
2. Cross-package 의존성 제거 (모든 데이터는 파라미터로 전달)
3. Frontend에서 PTB로 `submit_proof` + `create_record`를 원자적으로 호출

### PTB 호출 흐름

```
Frontend PTB:
  1. baram::submit_proof(registry, request_id, result_hash, ...)
  2. baram_compliance::create_record(
       compliance_registry,
       request_id, requester, executor, model, prompt_hash,
       result_hash, execution_time_ms,
       tee_type, pcr0, attestation_hash, pcr_baseline_version, pcr_verified,
       executor_reputation, executor_stake_amount, executor_slash_count,
       payment_amount, request_created_at,
       clock
     )
```

### View 함수 의존성 (읽기용)

ECR 생성에 필요한 데이터를 TypeScript에서 읽어오기 위한 기존 view 함수:

| 패키지 | 함수 | ECR 필드 |
|--------|------|----------|
| executor.move | `get_executor_reputation()` | executor_reputation |
| executor.move | `get_executor_tee_type()` | tee_type |
| executor_staking.move | `get_stake_amount()` | executor_stake_amount |
| executor_staking.move | `get_slash_stats()` | executor_slash_count |
| attestation_registry.move | `get_current_version()` | pcr_baseline_version |

모든 view 함수가 이미 존재한다. 추가 수정 불필요.

## 빌드

```bash
# V6 리셋 이후 chain ID 불일치 이슈로 인해 test-publish 사용
sui client test-publish \
  apps/baram/contracts-compliance \
  --gas-budget 100000000 \
  --dry-run \
  --build-env devnet
```

**참고**: V6 리셋 이후 Sui 프레임워크의 `[environments]` chain ID가
`56c8b101`로 변경되어 `sui move build`가 실패한다.
`test-publish --build-env devnet`으로 우회 가능.

## 향후 확장

ECR이 기록 그릇으로서 채워갈 항목:

| 단계 | 추가 기능 | ECR 변경 |
|------|----------|---------|
| ~~Executor 스테이킹 계층화~~ | ~~tier 시스템~~ | ✅ `executor_tier: u8` 필드 추가됨 |
| 프로토콜 수수료 분배 | fee split | `protocol_fee: u64` 필드 추가 |
| Attestation 보증금 | bond 시스템 | `bond_status: u8` 필드 추가 |
| Dispute Resolution | 이의 제기 | `dispute_id: Option<u64>` 필드 추가 |
| **AER 확장** | **Authorization + Lineage + Economic Context** | **8개 신규 필드 — [AER_DESIGN.md](AER_DESIGN.md) 참조** |
