# Baram - AI Compliance Settlement Layer

## Vision

**Baram**은 나선 네트워크의 AI Compliance Settlement Layer다.

> "Trust through cryptography, not through reputation alone."

**핵심 가치:**
- **Privacy**: TEE(AWS Nitro Enclave) 내에서 프롬프트 복호화/처리 — Executor조차 원문을 볼 수 없음
- **Payment Guarantee**: NUSDC 에스크로 + 온체인 정산
- **Compliance**: ExecutionComplianceRecord로 모든 작업의 감사 추적 가능
- **Trustless Settlement**: 양측 모두 상대방을 신뢰할 필요 없음

**설계 원칙:**
- "Executor는 Validator가 아니다" — Tier는 Compliance Eligibility Signal이지, 보상/할당 메커니즘이 아님
- Tier별 수수료/보상/job quota 차등 금지
- Executor 자동 배정 (Weighted Random) — 사용자 결정 부담 제거

---

## 구현 상태 (2026-01-30)

| Phase | Status | 설명 |
|-------|--------|------|
| Phase A: MVP | ✅ | 에스크로 + Lambda Direct Mode E2E |
| Phase B: ExecutorRegistry | ✅ | Executor 등록/선택 |
| Phase C: TEE Integration | ✅ | Nitro Enclave + Local LLM + vsock + RSA-OAEP + Real NSM Attestation |
| Phase D-4: Staking | ✅ | Staking/Slashing 메커니즘 (MIN_STAKE 1,000 NASUN) |
| Phase D-5: Attestation Verification | ✅ | COSE_Sign1 서명 + X.509 인증서 체인 검증 |
| **Phase E-1: Executor Tier** | ✅ | TierRegistry (4-level), decay_reputation, Frontend tier 배지 |
| **Phase E-2: Attestation Registry** | ✅ | PCR baseline 온체인 등록 + Host 검증 연동 |
| **Phase E-3: Compliance (ECR)** | ✅ | ExecutionComplianceRecord + executor_tier 스냅샷 + 자동 생성 |
| **Phase F-1: Executor 자동 배정** | ✅ | Weighted Random 배정, TEE 모델 teeType 필터링 |
| **Phase F-3: Automated ECR** | ✅ | 정산 시 ComplianceRecord 자동 생성 (submitProofWithCompliance PTB) |
| **Phase F-4: Frontend Attestation UI** | ✅ | AttestationDisplay, PCR Verified 표시, Audit Trail |
| **Phase F-5: Executor Registration Check** | ✅ | Host 시작 시 EXECUTOR_PRIVATE_KEY ↔ on-chain 주소 검증 (불일치 시 fatal exit) |
| **Phase F-6: Auto-cancel on Failure** | ✅ | /execute 실패 시 cancel_request TX로 에스크로 즉시 해제 |
| **Phase F-7: Chat Encryption with Password** | ✅ | PBKDF2(address+password) 키 파생, 디스크 레벨 공격 방어 |

---

## Architecture

### E2E Pipeline

```
Frontend → [RSA-OAEP 암호화] → Host (EC2) → [vsock] → Enclave (Nitro TEE)
                                                            ↓
                                                    [RSA 복호화 + LLM 추론]
                                                            ↓
                                              결과 반환 + Attestation + 온체인 정산
```

### On-Chain Layer

```
┌─────────────────────────────────────────────────────────────────┐
│                    Nasun Devnet (Chain ID: 12bf3808)             │
│                                                                 │
│  ┌──────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
│  │  baram.move  │  │ baram_executor   │  │  compliance.move │  │
│  │  (Escrow)    │  │ (Registry+Stake  │  │  (ECR + Audit)   │  │
│  │              │  │  +Tier)          │  │                  │  │
│  └──────────────┘  └──────────────────┘  └──────────────────┘  │
│                                                                 │
│  ┌──────────────────┐  ┌──────────────────┐                    │
│  │  attestation     │  │  devnet_tokens   │                    │
│  │  (PCR Baseline)  │  │  (NUSDC, NBTC)   │                    │
│  └──────────────────┘  └──────────────────┘                    │
└─────────────────────────────────────────────────────────────────┘
```

### Inference Modes

| Mode | Provider | Privacy | 상태 |
|------|----------|---------|------|
| **Local LLM** | TEE (Llama 3.2 3B) | Complete | ✅ Production |
| **Groq Cloud** | Groq API | None | ✅ Active (llama-3.1-8b, llama-3.3-70b, mistral-saba-24b) |
| **OpenAI** | OpenAI API | None | ⚠️ Quota 초과 (gpt-4o-mini) |

---

## Tier System (Phase E-1)

> "Stake determines eligibility, not guaranteed job dominance."

### Tier 정의

| Tier | 표시명 | 최소 Stake (NASUN) | 최소 Reputation | 산정 공식 |
|------|--------|-------------------|----------------|----------|
| 0 | Open | 0 | 0 | - |
| 1 | Bronze | 1,000 | 300 | `min(stake_tier, rep_tier)` |
| 2 | Silver | 5,000 | 500 | `min(stake_tier, rep_tier)` |
| 3 | Gold | 10,000 | 700 | `min(stake_tier, rep_tier)` |

- Stake만으로 Gold 불가, Reputation만으로도 Gold 불가 — **양쪽 모두 충족** 필요
- `effectiveScore = sqrt(staked_amount / 1e9) * (reputation / 1000)` — UI 정렬 전용, 비결정적

### Activity Decay

| 조건 | 동작 |
|------|------|
| `last_active_at` > 7일 | Frontend "Dormant" 배지, 정렬 하락 |
| `last_active_at` > 30일 | Admin `decay_reputation()` 호출 가능 (고정 -50, 최소 100) |

> Gold이면서 Dormant인 상태 가능: "높은 자격이나 현재 비활성"

---

## Smart Contracts

### baram.move (Escrow + Settlement)

| 함수 | 호출자 | 설명 |
|------|--------|------|
| `create_request` | User | NUSDC 에스크로 + 요청 생성 |
| `cancel_request` | User | 타임아웃 전 취소 + 환불 |
| `claim_timeout_refund` | User | 타임아웃 후 환불 |
| `submit_proof` | Executor | 결과 해시 제출 + 지급 |

### executor.move (Registry + Management)

| 함수 | 호출자 | 설명 |
|------|--------|------|
| `register_executor` | Admin | Executor 등록 |
| `update_executor_stats` | Admin | 작업 통계 + reputation 업데이트 |
| `decay_reputation` | Admin | 30일 비활성 executor reputation 감소 (고정 -50) |
| `link_stake` / `update_stake_status` | Admin | 스테이킹 연동 |

### executor_staking.move (Staking + Slashing)

| 함수 | 호출자 | 설명 |
|------|--------|------|
| `create_stake` | Executor | 스테이크 생성 + 초기 스테이킹 |
| `add_stake` | Executor | 추가 스테이킹 |
| `start_unbonding` | Executor | 언본딩 시작 (7일 대기) |
| `withdraw` | Executor | 출금 |
| `slash_for_timeout` | Admin | 타임아웃 슬래싱 (5%) |
| `slash_for_attestation_failure` | Admin | Attestation 실패 (10%) |
| `slash_for_fraud` | Admin | 사기 행위 (100%) |

### executor_tier.move (Tier Registry)

| 함수 | 호출자 | 설명 |
|------|--------|------|
| `create_tier_registry` | Admin | TierRegistry 초기화 (1회) |
| `update_tier` | Admin | Executor tier 재계산 |
| `batch_update_tiers` | Admin | 다수 Executor 일괄 업데이트 |
| `get_tier` | View | 특정 Executor tier 조회 |
| `calculate_tier` | Pure | stake + reputation → tier 계산 |

### compliance.move (Execution Compliance Record)

| 함수 | 호출자 | 설명 |
|------|--------|------|
| `create_record` | Admin/Executor | ECR 생성 (request_id, executor, model, tier, tee_type 등) |
| `update_status` | Admin | ECR 상태 업데이트 |
| `get_record` / `get_executor_records` | View | ECR 조회 |

### attestation_registry.move (PCR Baseline)

| 함수 | 호출자 | 설명 |
|------|--------|------|
| `register_baseline` | Admin | PCR baseline 등록 |
| `activate_baseline` | Admin | baseline 활성화 |
| `revoke_baseline` | Admin | baseline 폐기 |
| `verify_pcrs` | View | PCR 값 검증 |

---

## Deployed Contracts (Nasun Devnet V6)

> **Chain ID**: `12bf3808` (V6, 2026-01-27 리셋)

### Baram Contract

| 항목 | 주소 |
|------|------|
| Package ID | `0xfbe120e1847ca3ce7968bc7d85504a202639666755d581cfe642df3e57b2bc2f` |
| BaramRegistry | `0x52427e24315a444e9aa07ecb93df5a3392e1cb5d5bec8aba90c4c9eecaf77d3f` |
| UpgradeCap | `0xa9a6ee0412639af01e630ce23d38b246a88bdfd3ee8db5e3634ce45fa1eefe62` |

### Executor Registry + Staking + Tier (Phase E-1)

> **Note**: 두 개의 ExecutorRegistry가 존재함 (아래 Known Issues 참조)

**devnet-ids Registry** (Host settlement용):

| 항목 | 주소 |
|------|------|
| Package ID | `0xac09c1d6540e29454ee98bc18a5fa8f29b1c343153c8edf7dd92edd296f2d1ff` |
| ExecutorRegistry | `0xcb694425ce9b3d3024b069755b4152708976d5cd28295d2631f74e12363c009c` |
| AdminCap | `0xd4e4576a072f7aba56100b40cb4663539532fcc8cfd2b2802ff1f52490b89089` |
| UpgradeCap | `0x43b301a9056440281da42c41340ed0e0ae47bdf885e92dbbd315df55bb7a53ce` |
| StakingConfig | `0x6256077ab777e10061960e5d9243d8d4c71bf76531d3fff52c4257697f48830c` |
| StakingRegistry | `0xf3a62a7f26f0deecbec14ae26b8c620df9e07bcc3a4a11e1632b27b37332f228` |
| StakingAdminCap | `0x9ce33344d01578a8e121016af13caa11e773073d4e37e739b0c494a8ad9e5a35` |
| TierRegistry | `0x21c2344fc2d86c173fb8f8826493e96a93edd7155f3142b4be81be7775cee23c` |

**Frontend Registry** (UI에서 Executor 조회용):

| 항목 | 주소 |
|------|------|
| Package ID | `0xbc29ac0374a30203fe45f6d16965b117638f6816c209320c365961ccea2040d5` |
| ExecutorRegistry | `0xeaac73903c49e3583085e2889cf2770b68bab9c06e239a6304ca12aa82b2d60b` |
| AdminCap | `0x0953696c5e412f6e6af77e2aae381e06afd4d738b6c26e8dc522d48f00412cd7` |

### Attestation Registry (Phase E-2)

| 항목 | 주소 |
|------|------|
| Package ID | `0xc7ede9327e5179ed17f16eb2aa4efeee2e8b8c3dba7d34f3c1dcf3a5daad7ed0` |
| AttestationRegistry | `0xf05cffcd59ac97f3f4220dc956f1f0edc2b78e5c82e0ca19b62daacaa1e4f403` |
| AdminCap | `0x3bedf33f6c35bd2f4e32822e94f8b2f14ab5b5b4c117e6beed02a74f2e1a1e27` |
| UpgradeCap | `0x84602bc64e766da6637e765984e51fedbd0672f772a4f71ed893832f0ec56e23` |
| Active PCR0 (v3) | `3ee63e5c4001f182db6f5a1f0ebdd07154880a9e58c25697e65d085c7ce9e522891595d3de69abada655ebe09fd18285` |

### Compliance Registry (Phase E-3)

| 항목 | 주소 |
|------|------|
| Package ID | `0x2c0e9e907bb33392b980e06b2758cf5ca9d7cd8e50f8f29b6ace2adbc65228b9` |
| ComplianceRegistry | `0x345048f83dd3566da939164bd784abfd47c9c0a754341064737f5554546d4773` |
| AdminCap | `0x69ff8f26c0e6116907f75bcd29bff8e6d1d7cd0f75fa25e5dc308afd02223586` |
| UpgradeCap | `0xdfb25919d387fdfa154b4e640c78c90feb66aa3a7dc8644b5c5acee98f776395` |

### Unified Tokens (devnet_tokens)

| 항목 | 주소 |
|------|------|
| Package ID | `0x10748ed4f5063ca4a564fdfecc289954d14efa1a209e7292dcc18d65b2cb4017` |
| TokenFaucet | `0x04aa41442a9b812d29bb578aa82358d2b9e678240814368e32d82efa79669e14` |
| ClaimRecord | `0x8b9e854509c950d01ccd37190ba967e2de2197908f5c164f7cc193714faac4a8` |

---

## Directory Structure

```
apps/baram/
├── frontend/                    # React 19 + Vite 7 (포트 5177)
│   └── src/
│       ├── features/request/    # 요청 생성 UI + hooks
│       ├── components/
│       │   ├── chat/            # MessageList, AssistantMessage (Audit Trail)
│       │   ├── input/           # ChatInput, InputFooter
│       │   ├── badges/          # TierBadge, DormantBadge
│       │   ├── sidebar/         # Settings
│       │   └── theme/           # Dark/Light 테마
│       ├── config/              # network.ts (tier 상수, MODEL_PRICING)
│       └── utils/crypto.ts      # RSA-OAEP 암호화
│
├── contracts/                   # baram.move (에스크로 + 정산)
│
├── contracts-executor/          # Executor 패키지
│   └── sources/
│       ├── executor.move        # Registry + reputation + decay
│       ├── executor_staking.move # Staking/Slashing
│       └── executor_tier.move   # TierRegistry (Phase E-1)
│
├── contracts-attestation/       # Attestation 패키지 (Phase E-2)
│   └── sources/
│       └── attestation_registry.move  # PCR baseline 등록/검증
│
├── contracts-compliance/        # Compliance 패키지 (Phase E-3)
│   └── sources/
│       └── compliance.move      # ExecutionComplianceRecord
│
├── executor-nitro/              # TEE Executor (AWS Nitro)
│   ├── src/
│   │   ├── host/                # Host HTTP 서버 + Attestation 검증 + Settlement
│   │   ├── enclave/             # Enclave (crypto, inference, local-llm, attestation)
│   │   └── shared/              # protocol.ts, vsock.ts
│   ├── scripts/                 # Spot 인스턴스 관리 스크립트
│   ├── docker/                  # Nitro EIF Dockerfile
│   └── models/                  # LLaMA 모델 (.gitignore)
│
├── cdk/                         # AWS CDK (Lambda Executor)
│   └── lambda-src/executor/     # Lambda handler (Groq/OpenAI cloud models)
│
└── docs/                        # 문서
    ├── BARAM_IMPLEMENTATION_PLAN.md  # 이 문서
    └── SPOT_INSTANCE_GUIDE.md       # Spot instance 운영 가이드
```

---

## TEE Infrastructure

### Spot Instance 관리

> **개발 종료 후 반드시 `terminate-spot.sh` 실행!**
> 상세 운영 가이드: [SPOT_INSTANCE_GUIDE.md](SPOT_INSTANCE_GUIDE.md)

```bash
cd apps/baram/executor-nitro

./scripts/launch-spot.sh           # Custom AMI, 3-5분 소요
./scripts/update-executor.sh <IP>  # 두 ExecutorRegistry 모두 업데이트
# ... 개발 ...
./scripts/terminate-spot.sh        # 반드시 종료!
```

| 항목 | 값 |
|------|-----|
| Instance Type | r6i.xlarge (4 vCPU, 32GB) |
| Market | Spot (~$0.05/hr) |
| AMI | `ami-0488cb25dd63317af` |
| Enclave Memory | 14GB (Local LLM) |
| 월 예상 비용 | ~$6.50 (4hr/day, 20days) |

---

## Known Issues (2026-01-30)

### Dual ExecutorRegistry

V6 체인 리셋 시 프론트엔드 `.env`가 `devnet-ids.json`과 다른 ExecutorRegistry를 가리키게 됨.
`update-executor.sh`가 두 레지스트리 모두 업데이트하도록 수정되었으나, 근본적으로 단일 레지스트리로 통합 필요.

### OpenAI API Quota

`gpt-4o-mini` 모델이 OpenAI API quota 초과 (429)로 사용 불가. 크레딧 충전 필요.

### Groq Model Deprecation

`mixtral-8x7b-32768`이 Groq에서 서비스 종료됨. `mistral-saba-24b`로 교체 완료 (2026-01-30).

### Chat History Migration (DB v2)

Chat encryption key derivation이 `PBKDF2(address)` → `PBKDF2(address+password)`로 변경됨 (2026-01-30).
IndexedDB version 1→2 업그레이드 시 기존 채팅 히스토리가 자동 삭제됨 (이전 키로 복호화 불가).

---

## 다음 단계

> **현재 상태**: Phase F까지 핵심 기능 완료, TEE 인스턴스 OFF

### 잔여 과제

| 항목 | 설명 | 우선순위 |
|------|------|----------|
| Dual Registry 통합 | Frontend/devnet-ids 레지스트리 단일화 | 높음 |
| OpenAI 크레딧 충전 | gpt-4o-mini 사용 재개 | 중간 |
| HTTPS/도메인 설정 | Production TEE endpoint (현재 HTTP) | 중간 |
| Admin 의존도 제거 (F-2) | `update_executor_stats()` 내 cross-module tier 자동 업데이트 | 낮음 |

### Roadmap

#### Near-term (Phase F 완료)

| 목표 | 상태 | 설명 |
|------|------|------|
| **F-1: Executor 자동 배정** | ✅ | Weighted Random, eligible set filter (Bronze+), re-roll on failure |
| **F-3: Automated ECR** | ✅ | 정산 시 ComplianceRecord 자동 생성 (submitProofWithCompliance) |
| **F-4: Frontend Attestation UI** | ✅ | AttestationDisplay, PCR Verified, Audit Trail (ECRReceipt) |
| **F-5: Executor Registration Check** | ✅ | Host 시작 시 키 검증, 불일치 시 fatal exit |
| **F-6: Auto-cancel on Failure** | ✅ | /execute 실패 시 에스크로 즉시 해제 (cancel_request TX) |
| **F-7: Chat Encryption with Password** | ✅ | PBKDF2(address+password) 키 파생, DB v2 마이그레이션 |
| F-2: Admin 의존도 제거 | 계획 | cross-module tier 자동 업데이트 |
| F-8: HTTPS/도메인 설정 | 계획 | Production TEE endpoint |

#### Mid-term (Phase G: Model Marketplace)

| 목표 | 설명 |
|------|------|
| ModelRegistry 컨트랙트 | 모델 등록/관리 온체인 |
| Model Provider 온보딩 | 외부 모델 제공자 참여 구조 |
| 수익 분배 | Model Creator + Executor + Protocol |
| 더 큰 모델 지원 | 7B, 13B (r6i.2xlarge+) |

#### Long-term (Phase H: Production)

| 목표 | 설명 |
|------|------|
| Validator 통합 | Nasun Validator 노드에 Enclave 배포 |
| 분산 Executor 네트워크 | 다수 Executor 운영 + 자동 라우팅 |
| Reserved Instance 전환 | 비용 최적화 |
| 보안 감사 | Attestation, Key Management, 컨트랙트 감사 |

---

## E2E Test Results (2026-01-30)

### TEE Attestation Verification

| 테스트 | 결과 |
|--------|------|
| COSE_Sign1 서명 검증 | ✅ Signature verified successfully |
| X.509 인증서 체인 검증 | ✅ Certificate chain verified successfully |
| PCR baseline 온체인 검증 | ✅ PCR Verified: Yes (baseline v3) |
| 프론트엔드 Audit Trail 표시 | ✅ PCR Verified: Yes, Tier: Bronze |

### On-chain Tier Verification

| 테스트 | Stake | Reputation | Expected Tier | Result |
|--------|-------|------------|---------------|--------|
| Open | 0 | 500 | 0 (Open) | ✅ `min(0,2)=0` |
| Bronze | 1,000 | 300 | 1 (Bronze) | ✅ `min(1,1)=1` |
| Silver | 5,000 | 500 | 2 (Silver) | ✅ `min(2,2)=2` |
| Gold | 10,000 | 700 | 3 (Gold) | ✅ `min(3,3)=3` |
| Asymmetric | 10,000 | 300 | 1 (Bronze) | ✅ `min(3,1)=1` |

### Compliance Record

- ECR 자동 생성 (submitProofWithCompliance PTB): ✅ 성공
- `executor_tier=1` 스냅샷: ✅ 확인
- `ComplianceRecordCreated` 이벤트: ✅ 확인

### Cloud Models (Lambda)

| 모델 | Provider | 상태 |
|------|----------|------|
| llama-3.1-8b-instant | Groq | ✅ 정상 |
| llama-3.3-70b-versatile | Groq | ✅ 정상 |
| mistral-saba-24b | Groq | ✅ 정상 (mixtral-8x7b 대체) |
| gpt-4o-mini | OpenAI | ❌ 429 Quota 초과 |
| llama-3.2-3b-local | TEE | ✅ 정상 |

### Frontend Build

- TypeScript 컴파일: ✅ 통과
- Vite 빌드: ✅ 통과
