# Blind - AI Settlement Layer Prototype

## Overview

**blind**는 나선 네트워크의 "AI를 위한 Settlement Layer" 비전을 증명하는 프로토타입이다.

**핵심 가치:**
- 사용자: 프라이버시 보장 (TEE로 프롬프트가 Executor에게도 노출되지 않음)
- AI 제공자: 지불 보장 (에스크로 + 온체인 정산)
- 양측 모두 상대방을 신뢰할 필요 없음 (trustless settlement)

**MVP 목표:** 투자자/파트너에게 "이 팀은 실제로 만들 수 있다"를 증명

---

## 구현 상태 (2026-01-26)

| Phase | Status | 설명 |
|-------|--------|------|
| Phase 1: Move Contract | ✅ 완료 | `blind.move` - 에스크로, 정산 |
| Phase 2: Lambda Backend | ✅ 완료 | AWS Lambda + OpenAI API |
| Phase 3: Frontend | ✅ 완료 | React + @nasun/wallet-ui |
| Phase 4: E2E Test | ✅ 완료 | 통합 테스트 완료 |
| Phase A: MVP 완성 | ✅ 완료 | 전체 E2E 흐름 검증 |
| Phase B: ExecutorRegistry | ✅ 완료 | Executor 등록/선택 기능 |
| Phase C: TEE Integration | ⏳ 다음 | AWS Nitro Enclave |

---

## Deployed Contracts (Nasun Devnet)

### Blind Contract (Phase 1)
| 항목 | 주소 |
|------|------|
| Package ID | `0x2b1515ad3454d0199fda7dab70ccff737d8c8acfeb7ed181263c43b73566e697` |
| BlindRegistry (shared) | `0xd4ca7c8c34138886361b7f5253d68efa84afe29b00f4f53c0c34a356dca4bc7f` |
| UpgradeCap | `0x6dee91dceed0dc32f778ee258f63f1a1a8ac3e2e45ede095f06c0240e8c9b811` |

**Deployment TX:** `9SaaFnQNkG6JBMTNbRT56C4ys5pcjGeSxKZuxcMxLwfK`
**Deployed:** 2026-01-25

### Executor Registry (Phase B)
| 항목 | 주소 |
|------|------|
| Package ID | `0xb4fb2a0d5cdee06f455d450a7bb0c3150e9e614b15e5635ada5a9499f90f79e0` |
| ExecutorRegistry (shared) | `0x29e75bb29a917af3bc2ba6d993e4c91e8e03fdeb3e0e4bc4578e3dc343daa0f5` |
| AdminCap | `0x977f87bccdb1e6a4091139bf0deafee837ff257388f2dbc74248a1b8027ddd08` |

**Deployed:** 2026-01-26

### 등록된 Executor
| 이름 | Operator | Endpoint | TEE | Reputation |
|------|----------|----------|-----|------------|
| Nasun Lambda Executor | `0xa952b023c471e51457eb71b5c9e7424f0799103fc2336d79c0ffc2164c5ca854` | `https://8t2yw2ukoj.execute-api.ap-northeast-2.amazonaws.com/prod` | None | 500 |

---

## Deployed Backend (AWS)

| Resource | Value |
|----------|-------|
| **API Endpoint** | `https://8t2yw2ukoj.execute-api.ap-northeast-2.amazonaws.com/prod` |
| **Executor Address** | `0xa952b023c471e51457eb71b5c9e7424f0799103fc2336d79c0ffc2164c5ca854` |
| **Lambda ARN** | `arn:aws:lambda:ap-northeast-2:135808943968:function:blind-executor` |
| **CloudFormation Stack** | `BlindStack` |

**Secrets Manager:**
- `blind/openai` - OpenAI API key
- `blind/executor` - Executor wallet private key

**Deployed:** 2026-01-25

---

## Architecture (Phase B)

```
┌─────────────┐     1. Select Executor     ┌─────────────────────┐
│   Frontend  │ ◄────────────────────────  │  ExecutorRegistry   │
│  (React)    │     (Fetch active list)    │  (executor.move)    │
└─────────────┘                            └─────────────────────┘
       │
       │ 2. Create Request (with selected Executor)
       ▼
┌─────────────────┐     (NUSDC Escrow)     ┌─────────────────┐
│   Frontend      │ ─────────────────────► │  BlindRegistry  │
│                 │                        │  (blind.move)   │
└─────────────────┘                        └─────────────────┘
       │                                           │
       │ 3. Execute Request                        │
       ▼                                           │
┌─────────────────┐                                │
│  Lambda Backend │  4. Submit Proof              │
│  (AI Executor)  │ ──────────────────────────────►
│  - OpenAI API   │     (Auto Settlement)
└─────────────────┘
```

**주요 변경 (Phase B):**
- 사용자가 Executor 목록에서 선택 가능
- Executor 정보 (이름, TEE 타입, Reputation) 표시
- 선택된 Executor의 endpoint로 요청 전송

---

## Folder Structure

```
apps/blind/
├── contracts/                    # Move 스마트컨트랙트 (Phase 1)
│   ├── sources/
│   │   └── blind.move           # 에스크로 + 정산 로직
│   └── Move.toml
│
├── contracts-executor/           # ExecutorRegistry (Phase B)
│   ├── sources/
│   │   └── executor.move        # Executor 등록/관리
│   ├── Move.toml
│   └── Pub.devnet.toml          # 배포 정보
│
├── cdk/                          # AWS CDK 인프라 (Phase 2)
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
├── frontend/                     # Frontend (React) - Phase 3
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── pages/
│   │   │   └── HomePage.tsx
│   │   ├── features/
│   │   │   └── request/
│   │   │       ├── components/
│   │   │       │   ├── RequestForm.tsx      # Executor 선택 통합
│   │   │       │   ├── ExecutorSelector.tsx # Phase B
│   │   │       │   ├── ResultDisplay.tsx
│   │   │       │   └── index.ts
│   │   │       └── hooks/
│   │   │           ├── useCreateRequest.ts
│   │   │           ├── useExecutors.ts      # Phase B
│   │   │           └── index.ts
│   │   └── config/
│   │       └── network.ts                   # EXECUTOR_CONFIG 추가
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   ├── tsconfig.json
│   └── .env
│
└── executor-nitro/               # TEE Executor (Phase C) - 예정
    ├── src/
    │   ├── enclave/             # Enclave 내부 코드
    │   └── host/                # Host 프록시
    └── Dockerfile
```

---

## Environment Variables

```env
# Network
VITE_SUI_RPC_URL=https://rpc.devnet.nasun.io
VITE_NETWORK_NAME=Nasun Devnet
VITE_CHAIN_ID=6681cdfd

# Tokens (from pado_tokens)
VITE_NUSDC_TYPE=0x9984aab5fe518cf658532bf04e45b1eea075fe86ae62ad124bc3c8694f61dbb4::nusdc::NUSDC

# Blind Contract (deployed 2026-01-25)
VITE_BLIND_PACKAGE_ID=0x2b1515ad3454d0199fda7dab70ccff737d8c8acfeb7ed181263c43b73566e697
VITE_BLIND_REGISTRY_ID=0xd4ca7c8c34138886361b7f5253d68efa84afe29b00f4f53c0c34a356dca4bc7f
VITE_BLIND_UPGRADE_CAP=0x6dee91dceed0dc32f778ee258f63f1a1a8ac3e2e45ede095f06c0240e8c9b811

# Executor Registry (deployed 2026-01-26)
VITE_EXECUTOR_PACKAGE_ID=0xb4fb2a0d5cdee06f455d450a7bb0c3150e9e614b15e5635ada5a9499f90f79e0
VITE_EXECUTOR_REGISTRY_ID=0x29e75bb29a917af3bc2ba6d993e4c91e8e03fdeb3e0e4bc4578e3dc343daa0f5

# Executor (Lambda wallet)
VITE_EXECUTOR_ADDRESS=0xa952b023c471e51457eb71b5c9e7424f0799103fc2336d79c0ffc2164c5ca854

# Backend URL (deployed 2026-01-25)
VITE_BACKEND_URL=https://8t2yw2ukoj.execute-api.ap-northeast-2.amazonaws.com/prod

# Lambda Environment (AWS Secrets Manager)
OPENAI_API_KEY=<stored in Secrets Manager>
EXECUTOR_PRIVATE_KEY=<stored in Secrets Manager>
```

---

## MVP Scope

**구현 완료 (Phase A-B):**
- ✅ NUSDC escrow + auto-settlement
- ✅ OpenAI API wrapping (gpt-4o-mini, gpt-4o)
- ✅ Prompt input + Model selection UI
- ✅ Result display + transaction confirmation
- ✅ Timeout refund mechanism
- ✅ ExecutorRegistry + Executor 선택 UI
- ✅ TEE type 필드 (향후 확장용)

**다음 단계 (Phase C):**
- ⏳ TEE (Trusted Execution Environment) - AWS Nitro Enclave
- ⏳ True encryption - TEE 공개키로 암호화

**장기 계획 (Phase D-F):**
- Validator 연동 + Staking
- Price competition / Auction
- Dispute resolution
- Model Marketplace
- Enterprise features

---

## Git Commit History

| Commit | Description | Date |
|--------|-------------|------|
| `6ef5ef8` | feat(blind): implement Phase B - ExecutorRegistry with frontend integration | 2026-01-26 |
| `cad837e` | feat(blind): implement Phase 3 - Frontend with E2E test verified | 2026-01-25 |
| `3d8b72f` | feat(blind): implement Phase 2 - Lambda Backend deployed to AWS | 2026-01-25 |
| `6c43012` | feat(blind): implement Phase 1 - Move contract deployed to devnet | 2026-01-25 |
| `6ce3574` | docs: add blind implementation plan | 2026-01-24 |

**Rollback Point:** `cad837e` (Phase A 완료 시점)

---

## Implementation Details

### Phase 1: Move Contract ✅ 완료

**File:** `apps/blind/contracts/sources/blind.move`

**Core Structs:**
```move
public struct BlindRegistry has key {
    id: UID,
    next_request_id: u64,
    requests: Table<u64, ComputeRequest>,
}

public struct ComputeRequest has store {
    request_id: u64,
    requester: address,
    executor: address,
    escrow: Balance<NUSDC>,
    price: u64,
    prompt_hash: vector<u8>,
    model: String,
    created_at: u64,
    timeout_at: u64,
    status: u8,
    result_hash: vector<u8>,
}
```

**Core Functions:**
- `create_request()` - NUSDC 에스크로 생성
- `submit_proof()` - Executor가 결과 제출 + 자동 정산
- `cancel_request()` - 타임아웃 전 취소
- `claim_timeout_refund()` - 타임아웃 후 환불

---

### Phase B: ExecutorRegistry ✅ 완료

**File:** `apps/blind/contracts-executor/sources/executor.move`

**Core Structs:**
```move
public struct ExecutorRegistry has key {
    id: UID,
    executors: Table<address, ExecutorInfo>,
    total_executors: u64,
    active_executors: u64,
}

public struct ExecutorInfo has store, copy, drop {
    operator: address,
    name: String,
    endpoint_url: String,
    tee_type: u8,              // 0=None, 1=Nitro, 2=SGX, 3=SEV
    tee_attestation: vector<u8>,
    supported_models: vector<String>,
    reputation: u64,           // 0-1000
    completed_jobs: u64,
    failed_jobs: u64,
    registered_at: u64,
    last_active_at: u64,
    is_active: bool,
}
```

**Core Functions:**
- `register_executor()` - AdminCap으로 Executor 등록
- `update_executor()` - Executor 정보 업데이트
- `deactivate_executor()` - Executor 비활성화
- `update_executor_stats()` - Job 통계 업데이트

**Frontend Components:**
- `useExecutors` hook - 온체인 Executor 목록 조회
- `ExecutorSelector` - Executor 선택 UI
- `RequestForm` - Executor 선택 통합

---

### Phase C: TEE Integration ⏳ 다음 단계

**핵심 목표:** 프라이버시 보장 - Executor도 사용자 프롬프트 볼 수 없음

**구현 전략 (비용 최적화):**

#### Phase C-1: 로컬 시뮬레이션 (비용 $0)
- [ ] `apps/blind/executor-nitro/` 프로젝트 구조 생성
- [ ] Enclave ↔ Host 통신 프로토콜 설계 (vsock)
- [ ] 암호화/복호화 로직 구현 (Web Crypto API)
- [ ] Docker 기반 로컬 시뮬레이션

#### Phase C-2: 실제 Nitro 테스트 (~$5-10)
- [ ] EC2 Spot Instance + Nitro Enclave 테스트
- [ ] Enclave 부팅/vsock 통신 검증
- [ ] Attestation document 생성/검증
- [ ] 암호화된 프롬프트 E2E 테스트

#### Phase C-3: 데모용 상시 운영 (~$50-100/월)
- [ ] Reserved/Spot 혼합 운영
- [ ] ExecutorRegistry에 TEE type 업데이트
- [ ] Frontend TEE 뱃지 표시

**TEE 비용 참고:**
| 옵션 | 초기 비용 | 월 비용 | 비고 |
|------|----------|---------|------|
| AWS Nitro (Spot) | $0 | ~$50 | 개발/테스트용 |
| AWS Nitro (Reserved) | $0 | ~$100 | 데모/프로덕션 |
| Azure SGX | $0 | ~$400 | 대안 |
| 자체 서버 SGX | ~$3,000 | ~$200 | 장기 옵션 |

---

## Future Roadmap

### Phase D: Validator 통합 (장기)
- Nasun Validator와 연동
- Tier 1 (Validator) 자동 자격 부여
- 슬래싱 메커니즘 활성화

### Phase E: Model Marketplace (장기)
- ModelRegistry 컨트랙트
- Model Provider 온보딩
- 수익 분배: Model Creator + Executor + Protocol

### Phase F: Enterprise Features (장기)
- SLA 보장 (99.9% uptime)
- 컴플라이언스 인증
- 온프레미스 배포

---

## Tiered Executor System (계획)

| Tier | 자격 | Stake | 수수료 |
|------|------|-------|--------|
| Tier 1: Validator | Active Validator + TEE | Validator stake 사용 | 90% |
| Tier 2: Staked | 50,000 NASUN + TEE | 50,000 NASUN | 85% |
| Tier 3: Open | 10,000 NASUN + TEE | 10,000 NASUN | 80% |

**Executor 전환 일정:**
```
Phase A-C (3-6개월): Nasun 단독 운영, TEE/품질 기준 확립
Phase D (6-9개월): 2-3개 신뢰 Validator 초대 (Closed Beta)
Phase E+ (9개월+): Open Executor 등록 오픈
```

---

## Verification

1. **Contract:** Build succeeds, deploy to devnet, functions callable ✅
2. **Backend:** API responds, OpenAI calls work, proof submitted on-chain ✅
3. **Frontend:** Wallet connects, NUSDC payment works, result displays ✅
4. **E2E:** Full flow from request to settlement completes successfully ✅
5. **ExecutorRegistry:** Executor selection works, on-chain data fetched ✅
6. **Explorer:** All transactions visible on https://explorer.devnet.nasun.io ✅

---

## Critical Files to Reference

| File | Purpose |
|------|---------|
| [apps/pado/contracts/sources/faucet.move](../apps/pado/contracts/sources/faucet.move) | Shared Object, Balance, Clock, Table 패턴 |
| [apps/blind/contracts/sources/blind.move](../apps/blind/contracts/sources/blind.move) | 에스크로 + 정산 로직 |
| [apps/blind/contracts-executor/sources/executor.move](../apps/blind/contracts-executor/sources/executor.move) | Executor 등록/관리 |
| [apps/blind/frontend/src/features/request/](../apps/blind/frontend/src/features/request/) | Frontend 컴포넌트 |
