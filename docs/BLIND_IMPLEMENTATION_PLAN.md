# Blind - AI Settlement Layer Prototype

## Overview

**blind**는 나선 네트워크의 "AI를 위한 Settlement Layer" 비전을 증명하는 프로토타입이다.

**핵심 가치:**
- 사용자: 프라이버시 보장 (프롬프트가 AI 제공자에게 노출되지 않음)
- AI 제공자: 지불 보장 (에스크로 + 온체인 정산)
- 양측 모두 상대방을 신뢰할 필요 없음 (trustless settlement)

**MVP 목표:** 투자자/파트너에게 "이 팀은 실제로 만들 수 있다"를 증명

---

## Deployed Contracts (Nasun Devnet)

| Contract | ID | Description |
|----------|----|----|
| **Package** | `0x2b1515ad3454d0199fda7dab70ccff737d8c8acfeb7ed181263c43b73566e697` | blind 모듈 |
| **BlindRegistry** | `0xd4ca7c8c34138886361b7f5253d68efa84afe29b00f4f53c0c34a356dca4bc7f` | Shared object (요청 저장소) |
| **UpgradeCap** | `0x6dee91dceed0dc32f778ee258f63f1a1a8ac3e2e45ede095f06c0240e8c9b811` | 업그레이드 권한 |

**Deployment TX:** `9SaaFnQNkG6JBMTNbRT56C4ys5pcjGeSxKZuxcMxLwfK`
**Deployed:** 2026-01-25

---

## Architecture

```
┌─────────────┐     1. Create Request      ┌─────────────────┐
│   Frontend  │ ─────────────────────────► │  Nasun L1       │
│  (React)    │     (NUSDC Escrow)         │  (blind.move)   │
└─────────────┘                            └─────────────────┘
       │                                           │
       │ 2. Execute Request                        │
       ▼                                           │
┌─────────────────┐                                │
│  Lambda Backend │  3. Submit Proof              │
│  (AI Executor)  │ ──────────────────────────────►
│  - OpenAI API   │     (Auto Settlement)
└─────────────────┘
```

---

## Folder Structure

```
apps/blind/
├── contracts/                    # Move 스마트컨트랙트
│   ├── sources/
│   │   └── blind.move           # 에스크로 + 정산 로직
│   └── Move.toml
│
├── cdk/                          # AWS CDK 인프라
│   ├── lib/
│   │   └── blind-stack.ts       # Lambda + API Gateway
│   ├── lambda-src/
│   │   └── executor/            # AI 실행자 Lambda
│   │       ├── src/
│   │       │   ├── index.ts     # Handler
│   │       │   ├── services/
│   │       │   │   ├── openai.ts
│   │       │   │   └── sui.ts
│   │       │   └── types.ts
│   │       ├── package.json
│   │       └── tsconfig.json
│   ├── package.json
│   └── cdk.json
│
├── src/                          # Frontend (React)
│   ├── main.tsx
│   ├── App.tsx
│   ├── pages/
│   │   └── HomePage.tsx
│   ├── features/
│   │   └── request/
│   │       ├── components/
│   │       │   ├── RequestForm.tsx
│   │       │   ├── RequestStatus.tsx
│   │       │   └── ResultDisplay.tsx
│   │       └── hooks/
│   │           └── useCreateRequest.ts
│   └── config/
│       └── network.ts
│
├── index.html
├── package.json
├── vite.config.ts
├── tailwind.config.js
├── tsconfig.json
└── .env.example
```

---

## Implementation Plan

### Phase 1: Move Contract (Day 1-2)

**File:** `apps/blind/contracts/sources/blind.move`

**Core Structs:**
```move
// Shared registry for all requests
public struct BlindRegistry has key {
    id: UID,
    next_request_id: u64,
    requests: Table<u64, ComputeRequest>,
}

// Single compute request with escrow
public struct ComputeRequest has store {
    request_id: u64,
    requester: address,
    executor: address,
    escrow: Balance<NUSDC>,      // Locked funds
    price: u64,
    prompt_hash: vector<u8>,     // SHA-256 of encrypted prompt
    model: String,
    created_at: u64,
    timeout_at: u64,             // 5 min default
    status: u8,                  // PENDING, COMPLETED, CANCELLED
    result_hash: vector<u8>,     // Set after execution
}

// Receipt NFT for requester
public struct RequestReceipt has key, store {
    id: UID,
    request_id: u64,
    price: u64,
    prompt_hash: vector<u8>,
}
```

**Core Functions:**
```move
// User: Create request with NUSDC escrow
public entry fun create_request(
    registry: &mut BlindRegistry,
    payment: Coin<NUSDC>,
    prompt_hash: vector<u8>,
    model: String,
    executor: address,
    clock: &Clock,
    ctx: &mut TxContext
)

// Executor: Submit proof and receive payment
public entry fun submit_proof(
    registry: &mut BlindRegistry,
    request_id: u64,
    result_hash: vector<u8>,
    execution_time_ms: u64,
    clock: &Clock,
    ctx: &mut TxContext
)

// User: Cancel before timeout
public entry fun cancel_request(...)

// User: Claim refund after timeout
public entry fun claim_timeout_refund(...)
```

**Reference:** [faucet.move](../apps/pado/contracts/sources/faucet.move) - Shared Object, Balance, Clock 패턴

**Tasks:**
1. [ ] Create `apps/blind/contracts/` folder structure
2. [ ] Write `Move.toml` (reference pado_tokens)
3. [ ] Implement `blind.move` with escrow logic
4. [ ] Build: `/home/naru/my_apps/nasun-devnet/sui/target/release/sui move build`
5. [ ] Deploy to devnet
6. [ ] Record PACKAGE_ID, REGISTRY_ID in `.env`

---

### Phase 2: Lambda Backend (Day 3-4)

**CDK Stack:** `apps/blind/cdk/lib/blind-stack.ts`

**Lambda Handler Flow:**
```typescript
// POST /execute
1. Receive { requestId, encryptedPrompt }
2. Verify request exists on-chain (status = PENDING)
3. Verify prompt hash matches
4. Call OpenAI API
5. Generate result hash (SHA-256)
6. Submit proof to chain (auto-settlement)
7. Return { result, txDigest }
```

**Environment Variables:**
- `OPENAI_API_KEY` - OpenAI API key
- `SUI_RPC_URL` - https://rpc.devnet.nasun.io
- `BLIND_PACKAGE_ID` - Contract package ID
- `BLIND_REGISTRY_ID` - Shared registry object ID
- `EXECUTOR_PRIVATE_KEY` - Executor wallet private key (Secrets Manager)

**Reference:** [nasun-website governance-api](../apps/nasun-website/cdk/lambda-src/governance-api/) - Lambda + Sui 트랜잭션 패턴

**Tasks:**
1. [ ] Create `apps/blind/cdk/` folder structure
2. [ ] Implement OpenAI service wrapper
3. [ ] Implement Sui client for proof submission
4. [ ] Create Lambda handler
5. [ ] Write CDK stack (API Gateway + Lambda)
6. [ ] Deploy and test API endpoints

---

### Phase 3: Frontend (Day 5-6)

**Key Components:**

1. **RequestForm.tsx** - 프롬프트 입력 + 모델 선택 + 결제
2. **RequestStatus.tsx** - 요청 상태 실시간 표시
3. **ResultDisplay.tsx** - AI 응답 + 트랜잭션 링크

**User Flow:**
```
1. Connect wallet (@nasun/wallet-ui)
2. Check NUSDC balance (Token Faucet if needed)
3. Enter prompt + select model (gpt-4o-mini: 0.1 NUSDC)
4. Click "Pay & Submit"
   → Encrypt prompt (client-side)
   → Sign NUSDC escrow transaction
   → Send to Lambda for execution
5. Display result + settlement confirmation
```

**Reference:** [pado main.tsx](../apps/pado/frontend/src/main.tsx) - WalletProvider, configureWallet 초기화 패턴

**Tasks:**
1. [ ] Create `apps/blind/` Vite project structure
2. [ ] Configure @nasun/wallet, @nasun/wallet-ui integration
3. [ ] Implement RequestForm component
4. [ ] Implement useCreateRequest hook
5. [ ] Implement ResultDisplay component
6. [ ] Style with Tailwind + nasun colors

---

### Phase 4: Integration & Testing (Day 7)

**E2E Test Flow:**
1. Get NUSDC from Token Faucet
2. Create request with 0.1 NUSDC
3. Verify escrow transaction on Explorer
4. Wait for AI execution
5. Verify settlement transaction on Explorer
6. Confirm executor received NUSDC

**Tasks:**
1. [ ] E2E flow testing
2. [ ] Error handling (timeout, insufficient balance)
3. [ ] UI polish
4. [ ] Documentation

---

## Critical Files to Reference

| File | Purpose |
|------|---------|
| [apps/pado/contracts/sources/faucet.move](../apps/pado/contracts/sources/faucet.move) | Shared Object, Balance, Clock, Table 패턴 |
| [apps/pado/contracts/Move.toml](../apps/pado/contracts/Move.toml) | Move.toml 구조, Sui 의존성 |
| [apps/pado/frontend/src/main.tsx](../apps/pado/frontend/src/main.tsx) | WalletProvider, configureWallet 초기화 |
| [apps/pado/frontend/src/config/network.ts](../apps/pado/frontend/src/config/network.ts) | 환경변수, 네트워크 설정 |
| [apps/nasun-website/cdk/](../apps/nasun-website/cdk/) | CDK 스택, Lambda 구조 |

---

## Environment Variables

```env
# Network
VITE_SUI_RPC_URL=https://rpc.devnet.nasun.io
VITE_NETWORK_NAME=Nasun Devnet
VITE_CHAIN_ID=6681cdfd

# Tokens (from pado_tokens)
VITE_NUSDC_TYPE=0x9984aab5fe518cf658532bf04e45b1eea075fe86ae62ad124bc3c8694f61dbb4::nusdc::NUSDC

# Blind Contract (after deployment)
VITE_BLIND_PACKAGE_ID=<to be set>
VITE_BLIND_REGISTRY_ID=<to be set>

# Backend
VITE_BACKEND_URL=https://xxx.execute-api.ap-northeast-2.amazonaws.com/prod

# Executor (Lambda env)
OPENAI_API_KEY=<secret>
EXECUTOR_PRIVATE_KEY=<secret>
```

---

## MVP Scope

**Included:**
- NUSDC escrow + auto-settlement
- OpenAI API wrapping (gpt-4o-mini)
- Basic prompt input UI
- Result display + transaction confirmation
- Timeout refund mechanism

**Excluded (Future):**
- TEE (Trusted Execution Environment) - 현재는 서버에서 평문 처리
- True encryption - MVP는 Base64 인코딩
- Multiple executors - 단일 Executor
- Price competition - 고정 가격
- Dispute resolution
- ZK proof verification

---

## Verification

1. **Contract:** Build succeeds, deploy to devnet, functions callable
2. **Backend:** API responds, OpenAI calls work, proof submitted on-chain
3. **Frontend:** Wallet connects, NUSDC payment works, result displays
4. **E2E:** Full flow from request to settlement completes successfully
5. **Explorer:** All transactions visible on https://explorer.devnet.nasun.io

---

## Future Roadmap

MVP 이후 확장 계획. 각 Phase는 이전 Phase 완료 후 진행.

### Phase 2: Executor Staking & Slashing

**목표:** Executor의 신뢰성을 경제적 인센티브로 보장

**새로운 컨트랙트 구조:**

```move
public struct ExecutorRegistry has key {
    id: UID,
    executors: Table<address, ExecutorInfo>,
    min_stake: u64,                    // 최소 스테이킹 금액
    slash_rates: SlashRates,           // 슬래싱 비율
}

public struct ExecutorInfo has store {
    staked_nsn: Balance<NSN>,          // 스테이킹된 NSN
    reputation: u64,                   // 평판 점수 (0-1000)
    completed_jobs: u64,               // 완료한 작업 수
    failed_jobs: u64,                  // 실패한 작업 수
    slashed_amount: u64,               // 누적 슬래싱 금액
    registered_at: u64,
    is_active: bool,
}

public struct SlashRates has store, copy, drop {
    timeout_bps: u64,                  // 타임아웃: 500 = 5%
    invalid_result_bps: u64,           // 잘못된 결과: 1000 = 10%
    repeat_offense_multiplier: u64,    // 반복 위반 시 배수
}
```

**슬래싱 조건:**

| 위반 유형 | 슬래싱 비율 | 판단 방식 |
|-----------|-------------|-----------|
| 타임아웃 (실행 안 함) | 5% | 자동 (Clock 기반) |
| 잘못된 결과 제출 | 10% | 분쟁 해결 (Phase 4) |
| 반복 위반 (3회 이상) | 2x 배수 | 자동 |

**슬래싱된 토큰 배분:**
- 50% → 피해자(요청자)에게 보상
- 30% → Protocol Treasury
- 20% → 소각 (deflationary)

**Executor 등록 플로우:**
```
1. Executor가 NSN 스테이킹 (최소 1000 NSN)
2. ExecutorRegistry에 등록
3. 요청 수락 가능 상태
4. 타임아웃/실패 시 자동 슬래싱
5. 스테이킹 해제 시 7일 대기 기간
```

---

### Phase 3: Revenue Distribution

**목표:** 다자간 수익 배분 (App, Model, Compute, Protocol)

**참여자 구조:**

```
사용자가 1 NUSDC 지불
         │
         ▼
┌────────────────────────────────────────────────────────┐
│                     수익 배분                           │
├──────────────┬──────────────┬──────────────┬───────────┤
│  Client App  │  AI Model    │  Compute     │ Protocol  │
│  (dApp)      │  (Creator)   │  (Executor)  │ (Nasun)   │
├──────────────┼──────────────┼──────────────┼───────────┤
│    10%       │    20%       │    65%       │    5%     │
│   0.1 NUSDC  │  0.2 NUSDC   │  0.65 NUSDC  │ 0.05 NUSDC│
└──────────────┴──────────────┴──────────────┴───────────┘
```

**새로운 컨트랙트 구조:**

```move
// 모델 등록 (로열티 정보 포함)
public struct ModelObject has key, store {
    id: UID,
    name: String,
    creator: address,
    royalty_bps: u64,              // 2000 = 20%
    model_type: String,            // "llm", "image", "video"
    endpoint_hash: vector<u8>,     // 실행 엔드포인트 해시
    is_active: bool,
}

public struct ModelRegistry has key {
    id: UID,
    models: Table<ID, ModelObject>,
    verified_models: vector<ID>,   // 검증된 모델 목록
}

// 요청 생성 시 배분 정보 포함
public struct ComputeRequest has store {
    // ... 기존 필드들

    // 수익 배분 (확장)
    app_address: address,          // Client App 주소
    app_fee_bps: u64,              // 1000 = 10%
    model_id: Option<ID>,          // ModelObject 참조
    protocol_fee_bps: u64,         // 500 = 5%
    // executor_fee = 10000 - app - model_royalty - protocol
}
```

**정산 로직:**

```move
public fun settle_with_distribution(
    registry: &mut BlindRegistry,
    model_registry: &ModelRegistry,
    request_id: u64,
    clock: &Clock,
    ctx: &mut TxContext
) {
    let request = table::borrow_mut(&mut registry.requests, request_id);
    let total = balance::value(&request.escrow);

    // 1. Protocol fee
    let protocol_amount = total * request.protocol_fee_bps / 10000;
    let protocol_coin = coin::take(&mut request.escrow, protocol_amount, ctx);
    transfer::public_transfer(protocol_coin, PROTOCOL_TREASURY);

    // 2. App fee
    let app_amount = total * request.app_fee_bps / 10000;
    let app_coin = coin::take(&mut request.escrow, app_amount, ctx);
    transfer::public_transfer(app_coin, request.app_address);

    // 3. Model royalty (if model registered)
    if (option::is_some(&request.model_id)) {
        let model_id = option::borrow(&request.model_id);
        let model = table::borrow(&model_registry.models, *model_id);
        let model_amount = total * model.royalty_bps / 10000;
        let model_coin = coin::take(&mut request.escrow, model_amount, ctx);
        transfer::public_transfer(model_coin, model.creator);
    };

    // 4. Executor (나머지 전부)
    let executor_coin = coin::from_balance(
        balance::withdraw_all(&mut request.escrow),
        ctx
    );
    transfer::public_transfer(executor_coin, request.executor);
}
```

---

### Phase 4: TEE Integration

**목표:** 진정한 Blind Inference - Executor도 프롬프트를 볼 수 없음

**아키텍처 변경:**

```
MVP (현재):
┌──────────┐                    ┌─────────────────┐
│  User    │ ─── 암호화 ───►   │  Lambda         │ ◄── 신뢰점: 운영자
│          │                    │  (평문 처리)    │
└──────────┘                    └─────────────────┘

TEE 도입 후:
┌──────────┐                    ┌─────────────────────────────┐
│  User    │ ─── 암호화 ───►   │  TEE (SGX/SEV)              │
│          │                    │  ┌───────────────────────┐  │
└──────────┘                    │  │ Secure Enclave        │  │
                                │  │ - 복호화 (내부만)     │  │
                                │  │ - AI 실행             │  │
                                │  │ - 결과 암호화         │  │
                                │  └───────────────────────┘  │
                                │  + Hardware Attestation     │ ◄── 신뢰점: 하드웨어
                                └─────────────────────────────┘
```

**컨트랙트 변경:**

```move
public struct ExecutionProof has copy, drop {
    request_id: u64,
    result_hash: vector<u8>,
    execution_time_ms: u64,

    // TEE Attestation (Phase 4 추가)
    tee_type: u8,                     // 0=None, 1=SGX, 2=SEV, 3=TrustZone
    attestation_report: vector<u8>,   // Hardware signed report
    enclave_measurement: vector<u8>,  // MRENCLAVE (code hash)
}

public struct TrustedEnclaveRegistry has key {
    id: UID,
    trusted_measurements: Table<vector<u8>, EnclaveInfo>,
}

public struct EnclaveInfo has store {
    tee_type: u8,
    version: String,
    audited_at: u64,
    is_active: bool,
}

// 증명 검증 함수
public fun verify_tee_attestation(
    proof: &ExecutionProof,
    enclave_registry: &TrustedEnclaveRegistry
): bool {
    // 1. Attestation 서명 검증 (Intel/AMD 공개키)
    // 2. Enclave measurement가 신뢰 목록에 있는지 확인
    // 3. Report 내용과 request 정보 일치 확인
    // 4. Attestation 시간이 유효한지 확인
}
```

**지원 TEE:**
- Intel SGX (서버급)
- AMD SEV (클라우드)
- ARM TrustZone (엣지)
- NVIDIA H100 Confidential Computing (GPU)

---

### Phase 5: Dispute Resolution

**목표:** 결과 품질에 대한 분쟁 해결

**분쟁 유형:**
1. 실행 안 됨 (타임아웃) → 자동 처리 (Phase 2)
2. 잘못된 결과 → 분쟁 해결 필요
3. 품질 불만족 → 분쟁 해결 필요

**분쟁 해결 메커니즘:**

```move
public struct Dispute has key {
    id: UID,
    request_id: u64,
    disputer: address,              // 분쟁 제기자
    dispute_type: u8,               // INVALID_RESULT, QUALITY, OTHER
    evidence_hash: vector<u8>,      // 증거 해시
    stake: Balance<NUSDC>,          // 분쟁 스테이킹 (악용 방지)
    votes: Table<address, bool>,    // 검증자 투표
    created_at: u64,
    resolved_at: u64,
    outcome: Option<bool>,          // true=disputer wins
}

public struct DisputeConfig has store {
    min_stake: u64,                 // 최소 분쟁 스테이킹
    voting_period: u64,             // 투표 기간 (ms)
    min_voters: u64,                // 최소 투표자 수
    quorum_bps: u64,                // 정족수 (5000 = 50%)
}
```

**분쟁 해결 플로우:**
```
1. 요청자가 분쟁 제기 + NUSDC 스테이킹
2. 투표 기간 시작 (24-48시간)
3. 검증자들이 증거 검토 후 투표
4. 정족수 달성 시 결과 확정
5. 승자에게 스테이킹 반환 + 보상
6. 패자 스테이킹은 승자 + Treasury로 배분
```

---

### Roadmap Summary

| Phase | 내용 | 핵심 기능 | 예상 기간 |
|-------|------|-----------|-----------|
| **1 (MVP)** | 기본 에스크로 | NUSDC 에스크로, 자동 정산 | 1주 |
| **2** | 스테이킹 | NSN 스테이킹, 자동 슬래싱 | 2주 |
| **3** | 수익 배분 | App/Model/Compute/Protocol 배분 | 2주 |
| **4** | TEE | Hardware Attestation, Blind Inference | 4주 |
| **5** | 분쟁 해결 | 검증자 투표, 분쟁 스테이킹 | 3주 |

---

### Token Economics ($NSN)

**용도:**
1. **Executor Staking** - 서비스 제공 자격
2. **Slashing Collateral** - 위반 시 페널티
3. **Governance** - 프로토콜 파라미터 투표
4. **Fee Discount** - NSN으로 수수료 지불 시 할인

**Value Accrual:**
- Protocol fee의 일부 소각 (deflationary)
- 슬래싱된 토큰의 일부 소각
- Executor 스테이킹 수요 증가
