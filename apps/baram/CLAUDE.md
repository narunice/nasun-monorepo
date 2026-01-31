# CLAUDE.md (Baram App)

> 이 문서는 baram 앱 전용 가이드입니다.
> 공통 원칙은 [루트 CLAUDE.md](../../CLAUDE.md)를 참조하세요.

---

## Overview

**Baram**은 나선 네트워크의 AI Compliance Settlement Layer다.

| 요소 | 설명 |
|------|------|
| **Privacy** | TEE(AWS Nitro Enclave) 내에서 프롬프트 복호화/처리 |
| **Escrow** | NUSDC 선불 결제, 성공 시 Executor에 자동 지급 |
| **Compliance** | ExecutionComplianceRecord로 모든 작업의 감사 추적 |
| **Trustless** | 온체인 증명으로 신뢰 없는 정산 |

**설계 원칙:**
- "Executor는 Validator가 아니다" — Tier는 Compliance Eligibility Signal
- "No job allocation by tier" — Tier를 weight에 포함하지 않음
- Executor 자동 배정 (Weighted Random) — 사용자 결정 부담 제거
- Tier는 eligible set 필터 (Bronze+ 자격) + 사후 투명성 정보

---

## Directory Structure

```
apps/baram/
├── frontend/                    # React 19 + Vite 7 (포트 5177)
│   └── src/
│       ├── features/request/    # 요청 생성 UI + hooks (useExecutors, useCreateRequest, selectExecutorWeightedRandom)
│       ├── components/
│       │   ├── input/           # ChatInput, InputFooter
│       │   ├── badges/          # TierBadge, DormantBadge
│       │   ├── sidebar/         # SidebarSettings
│       │   └── theme/           # ThemeProvider, ThemeToggle
│       ├── config/network.ts    # Tier 상수, MODEL_PRICING, TEE_TYPES, EXECUTOR_SELECTION
│       ├── services/            # chatCrypto.ts (AES-256-GCM), chatStorage.ts (IndexedDB)
│       └── utils/crypto.ts      # RSA-OAEP 암호화
│
├── contracts/                   # baram.move (에스크로 + 정산)
│
├── contracts-executor/          # Executor 패키지
│   └── sources/
│       ├── executor.move        # Registry + reputation + self-service (F-2) + ProcessedRequests
│       ├── executor_staking.move # Staking/Slashing + get_executor view
│       └── executor_tier.move   # TierRegistry (4-level) + refresh_tier_from_state (F-2)
│
├── contracts-attestation/       # Attestation 패키지
│   └── sources/
│       └── attestation_registry.move  # PCR baseline 등록/검증
│
├── contracts-compliance/        # Compliance 패키지
│   └── sources/
│       └── compliance.move      # ExecutionComplianceRecord
│
├── executor-nitro/              # TEE Executor (AWS Nitro)
│   ├── src/host/                # Host HTTP 서버 + Attestation 검증 + Settlement (PTB 4-call)
│   ├── src/enclave/             # Enclave (crypto, inference, local-llm, attestation)
│   ├── src/shared/              # protocol.ts, vsock.ts
│   ├── scripts/                 # Spot 인스턴스 관리 + decay-reputation.ts (cron)
│   ├── docker/                  # Nitro EIF Dockerfile
│   └── models/                  # LLaMA 모델 (.gitignore)
│
├── cdk/                         # AWS CDK 인프라
│   └── lambda-src/executor/     # Lambda executor (Groq/OpenAI cloud models)
└── docs/                        # BARAM_IMPLEMENTATION_PLAN.md, SPOT_INSTANCE_GUIDE.md
```

---

## Development Commands

### Frontend (포트 5177)

```bash
pnpm dev:baram                   # 모노레포 루트에서
cd apps/baram/frontend && pnpm dev  # 직접 실행
```

### Move 컨트랙트

```bash
# 빌드
cd apps/baram/contracts-executor
/home/naru/my_apps/nasun-devnet/sui/target/release/sui move build

# 배포 (새 패키지)
/home/naru/my_apps/nasun-devnet/sui/target/release/sui client publish --gas-budget 100000000

# 업그레이드
/home/naru/my_apps/nasun-devnet/sui/target/release/sui client upgrade \
  --upgrade-capability <UPGRADE_CAP_ID> --gas-budget 100000000
```

### TEE Spot Instance

> **⚠️ 개발 종료 후 반드시 `terminate-spot.sh` 실행!**
> 상세 운영 가이드: [SPOT_INSTANCE_GUIDE.md](docs/SPOT_INSTANCE_GUIDE.md)

```bash
cd apps/baram/executor-nitro
./scripts/launch-spot.sh           # Custom AMI, 2-3분 소요
./scripts/update-executor.sh <IP>  # On-chain endpoint 업데이트 (두 Registry 모두)
# ... 개발 ...
./scripts/terminate-spot.sh        # 반드시 종료!
```

---

## Smart Contracts

### baram.move (Escrow)

| 함수 | 호출자 | 설명 |
|------|--------|------|
| `create_request` | User | NUSDC 에스크로 + 요청 생성 |
| `cancel_request` | User | 타임아웃 전 취소 + 환불 (Frontend auto-cancel on execution failure) |
| `submit_proof` | Executor | 결과 해시 제출 + 지급 |

### executor.move (Registry + Self-Service)

**Admin 함수:**

| 함수 | 호출자 | 설명 |
|------|--------|------|
| `register_executor` | Admin | Executor 등록 |
| `update_executor_stats` | Admin | 통계 + reputation 업데이트 (+10 성공, -20 실패) |
| `decay_reputation` | Admin | 30일 비활성 reputation 감소 (고정 -50, 최소 100) |
| `link_stake` / `update_stake_status` | Admin | 스테이킹 연동 |

**Self-service 함수 (Phase F-2):**

| 함수 | 호출자 | 설명 |
|------|--------|------|
| `record_job_completion` | Executor (self) | 작업 완료 기록 + reputation +10 (request_id dedup via ProcessedRequests) |
| `record_job_failure` | Executor (self) | 작업 실패 기록 + reputation -20 (request_id dedup) |
| `update_own_endpoint` | Executor (self) | endpoint_url + supported_models 자율 변경 |
| `decay_reputation_permissionless` | Anyone | 30일 비활성 reputation 감소 (AdminCap 불필요, Clock 기반) |

### executor_staking.move (Staking/Slashing)

| 상수 | 값 |
|------|-----|
| `MIN_STAKE` | 1,000 NASUN |
| `UNBONDING_PERIOD_MS` | 7일 |
| `SLASH_TIMEOUT_PERCENT` | 5% |
| `SLASH_ATTESTATION_PERCENT` | 10% |
| `SLASH_FRAUD_PERCENT` | 100% |

### executor_tier.move (Tier Registry)

| Tier | 표시명 | Stake | Reputation | 공식 |
|------|--------|-------|------------|------|
| 0 | Open | 0 | 0 | - |
| 1 | Bronze | 1,000 | 300 | `min(stake_tier, rep_tier)` |
| 2 | Silver | 5,000 | 500 | `min(stake_tier, rep_tier)` |
| 3 | Gold | 10,000 | 700 | `min(stake_tier, rep_tier)` |

| 함수 | 호출자 | 설명 |
|------|--------|------|
| `update_tier` | Admin | Executor tier 재계산 |
| `batch_update_tiers` | Admin | 일괄 업데이트 |
| `refresh_tier_from_state` | Anyone | on-chain state에서 tier 재계산 (F-2, AdminCap 불필요) |
| `get_tier` / `calculate_tier` | View/Pure | tier 조회/계산 |

### compliance.move (ECR)

| 함수 | 호출자 | 설명 |
|------|--------|------|
| `create_record` | Admin | ECR 생성 (executor_tier 스냅샷 포함) |
| `update_status` | Admin | ECR 상태 변경 |
| `get_record` | View | ECR 조회 |

### attestation_registry.move (PCR Baseline)

| 함수 | 호출자 | 설명 |
|------|--------|------|
| `register_baseline` | Admin | PCR baseline 등록 |
| `activate_baseline` | Admin | baseline 활성화 |
| `revoke_baseline` | Admin | baseline 폐기 |
| `verify_pcrs` | View | PCR 검증 |

---

## Deployed Contracts (Devnet V6)

> **Chain ID**: `12bf3808` (V6, 2026-01-27 리셋, executor v2 업그레이드 2026-01-31)

### Baram Contract

| 항목 | 주소 |
|------|------|
| Package ID | `0xfbe120e1847ca3ce7968bc7d85504a202639666755d581cfe642df3e57b2bc2f` |
| BaramRegistry | `0x52427e24315a444e9aa07ecb93df5a3392e1cb5d5bec8aba90c4c9eecaf77d3f` |
| UpgradeCap | `0xa9a6ee0412639af01e630ce23d38b246a88bdfd3ee8db5e3634ce45fa1eefe62` |

### Executor Registry + Staking + Tier

> **Note**: 두 개의 ExecutorRegistry가 존재함. `update-executor.sh`는 양쪽 모두 업데이트.

**devnet-ids Registry** (Host settlement용):

| 항목 | 주소 |
|------|------|
| Package ID (v2) | `0x4b0e89faaa8fa0af76d7e1765df14bfbfe2020a6207fd83e82089a0427ed4ddc` |
| Original Package ID | `0xac09c1d6540e29454ee98bc18a5fa8f29b1c343153c8edf7dd92edd296f2d1ff` |
| ExecutorRegistry | `0xcb694425ce9b3d3024b069755b4152708976d5cd28295d2631f74e12363c009c` |
| AdminCap | `0xd4e4576a072f7aba56100b40cb4663539532fcc8cfd2b2802ff1f52490b89089` |
| UpgradeCap | `0x43b301a9056440281da42c41340ed0e0ae47bdf885e92dbbd315df55bb7a53ce` |
| ProcessedRequests | `0xc68e22ca8cc7851695c2a5466cc148221f31a94e02f4a65b1676c33ab8855404` |
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

### Attestation Registry

| 항목 | 주소 |
|------|------|
| Package ID | `0xc7ede9327e5179ed17f16eb2aa4efeee2e8b8c3dba7d34f3c1dcf3a5daad7ed0` |
| AttestationRegistry | `0xf05cffcd59ac97f3f4220dc956f1f0edc2b78e5c82e0ca19b62daacaa1e4f403` |
| AdminCap | `0x3bedf33f6c35bd2f4e32822e94f8b2f14ab5b5b4c117e6beed02a74f2e1a1e27` |
| UpgradeCap | `0x84602bc64e766da6637e765984e51fedbd0672f772a4f71ed893832f0ec56e23` |
| Active PCR0 (v3) | `3ee63e5c4001f182...daad7ed0` |

### Compliance Registry

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

### Lambda Backend (Cloud Models)

| 항목 | 값 |
|------|-----|
| API Endpoint | `https://ncn10xkbfh.execute-api.ap-northeast-2.amazonaws.com/prod` |
| Region | ap-northeast-2 |
| Active Models | llama-3.1-8b-instant, llama-3.3-70b-versatile (Groq) |
| Inactive Models | gpt-4o, gpt-4-turbo (OpenAI quota 초과) |
| Removed Models | mistral-saba-24b (unstable), gpt-4o-mini (removed) |

---

## Environment Variables

### Frontend (.env)

```env
VITE_SUI_RPC_URL=https://rpc.devnet.nasun.io
VITE_NETWORK_NAME=Nasun Devnet
VITE_CHAIN_ID=12bf3808
VITE_FAUCET_URL=https://faucet.devnet.nasun.io

# Tokens
VITE_NUSDC_TYPE=0x10748ed4f5063ca4a564fdfecc289954d14efa1a209e7292dcc18d65b2cb4017::nusdc::NUSDC
VITE_TOKENS_PACKAGE_ID=0x10748ed4f5063ca4a564fdfecc289954d14efa1a209e7292dcc18d65b2cb4017
VITE_TOKEN_FAUCET_ID=0x04aa41442a9b812d29bb578aa82358d2b9e678240814368e32d82efa79669e14

# Contracts (falls back to @nasun/devnet-config)
VITE_BARAM_PACKAGE_ID=...
VITE_EXECUTOR_PACKAGE_ID=...
VITE_TIER_REGISTRY_ID=...
```

### executor-nitro (.env)

> systemd service는 `EnvironmentFile`로 `.env`를 자동 로드함.
> 전체 변수 목록: [.env.example](executor-nitro/.env.example)

```env
USE_VSOCK=true              # vsock (Nitro only)
ENCLAVE_CID=16
HOST_PORT=3000

# Settlement (Sui)
SUI_RPC_URL=https://rpc.devnet.nasun.io
BARAM_PACKAGE_ID=...
EXECUTOR_PRIVATE_KEY=suiprivkey1q...
COMPLIANCE_PACKAGE_ID=...
ATTESTATION_PACKAGE_ID=...
STAKING_REGISTRY_ID=...
TIER_REGISTRY_ID=...

# Phase F-2: Self-service
EXECUTOR_PACKAGE_ID=...        # baram_executor package ID (v2)
PROCESSED_REQUESTS_ID=...      # ProcessedRequests shared object
EXECUTOR_STAKE_ID=...          # ExecutorStake owned object (for tier refresh)
```

---

## TEE/Nitro Security

1. **Private Key Never Leaves Enclave** — RSA 키쌍은 Enclave 시작 시 생성, 종료 시 파괴
2. **vsock Only** — Host-Enclave 간 vsock만 허용, Enclave 네트워크 접근 불가
3. **No Secret Logging** — 개인키, 복호화된 프롬프트 로깅 금지
4. **Attestation** — NSM COSE_Sign1 서명 + X.509 인증서 체인 검증 (Host에서 수행)
5. **Chat Encryption (Dual-Mode)** — IndexedDB 채팅 히스토리는 AES-256-GCM으로 암호화
   - **비밀번호 지갑**: `PBKDF2(walletAddress + password)` → 디스크 접근 공격 방어 (password 없이 복호화 불가)
   - **zkLogin**: `PBKDF2(walletAddress)` → 기본 난독화 수준 (address는 공개 정보)
   - zkLogin 사용자는 Google OAuth에 인증을 위임하며 로컬 비밀을 관리하지 않는 보안 모델을 선택한 것이므로, address-only 키 파생이 해당 모델에 부합
   - 비밀번호 지갑 사용자는 password를 모르면 채팅 복호화 불가
6. **Executor Registration Check** — Host 시작 시 EXECUTOR_PRIVATE_KEY가 온체인 ExecutorRegistry에 등록된 주소와 일치하는지 검증 (불일치 시 즉시 종료)
7. **Idle Timeout** — 15분 비활동 시 자동 잠금 (비밀번호 지갑: lock, zkLogin: disconnect). Baram 앱 레벨에서 DOM 이벤트 기반 idle detection (mousemove, keydown, click, touchstart, scroll)

---

## Cost Management

> **⚠️ 세션 종료 시 반드시 `terminate-spot.sh` 실행!**

| 항목 | Spot 비용 |
|------|----------|
| r6i.xlarge (시간당) | ~$0.05 |
| 월 20일, 4hr/day | ~$4.00 |
| AMI 스토리지 | ~$2.50/월 |
| **월 총 예상** | **~$6.50** |

---

## Key File References

| 파일 | 설명 |
|------|------|
| [baram.move](contracts/sources/baram.move) | 에스크로 + 정산 |
| [executor.move](contracts-executor/sources/executor.move) | Registry + reputation + decay |
| [executor_staking.move](contracts-executor/sources/executor_staking.move) | Staking/Slashing |
| [executor_tier.move](contracts-executor/sources/executor_tier.move) | TierRegistry (Phase E-1) |
| [attestation_registry.move](contracts-attestation/sources/attestation_registry.move) | PCR baseline |
| [compliance.move](contracts-compliance/sources/compliance.move) | ECR |
| [chatCrypto.ts](frontend/src/services/chatCrypto.ts) | AES-256-GCM 암호화 (PBKDF2 키 파생: address + password) |
| [chatStorage.ts](frontend/src/services/chatStorage.ts) | IndexedDB 암호화 저장 (per-wallet database) |
| [transactionBuilder.ts](frontend/src/features/request/services/transactionBuilder.ts) | create_request + cancel_request TX 빌더 |
| [useIdleTimeout.ts](frontend/src/hooks/useIdleTimeout.ts) | 15분 idle timeout hook (DOM 이벤트 기반) |
| [network.ts](frontend/src/config/network.ts) | Tier 상수, MODEL_PRICING, TEE_TYPES |
| [useExecutors.ts](frontend/src/features/request/hooks/useExecutors.ts) | Executor 목록 + tier 데이터 + selectExecutorWeightedRandom |
| [TierBadge.tsx](frontend/src/components/badges/TierBadge.tsx) | Tier/Dormant 배지 컴포넌트 |
| [attestation.ts](executor-nitro/src/enclave/attestation.ts) | NSM Attestation (COSE_Sign1) |
| [server.ts](executor-nitro/src/host/server.ts) | Host HTTP + Attestation 검증 |
| [sui-client.ts](executor-nitro/src/host/sui-client.ts) | On-chain settlement + ECR 생성 + F-2 PTB Call 3/4 |
| [decay-reputation.ts](executor-nitro/scripts/decay-reputation.ts) | Permissionless decay cron 스크립트 |
| [protocol.ts](executor-nitro/src/shared/protocol.ts) | 메시지 프로토콜 (v1.3.0) |
| [ECRReceipt.tsx](frontend/src/features/request/components/ECRReceipt.tsx) | Compliance Record 모달 |
| [SPOT_INSTANCE_GUIDE.md](docs/SPOT_INSTANCE_GUIDE.md) | Spot 인스턴스 운영 가이드 |

---

## Roadmap

| Phase | 기능 | 상태 |
|-------|------|------|
| A-C | MVP + TEE Integration | ✅ 완료 |
| D-4 | Executor Staking/Slashing | ✅ 완료 |
| D-5 | Off-chain Attestation Verification | ✅ 완료 |
| E-1 | Executor Tier (TierRegistry) | ✅ 완료 |
| E-2 | Attestation Registry (PCR baseline) | ✅ 완료 |
| E-3 | Compliance (ECR) | ✅ 완료 |
| **F-1** | **Executor 자동 배정 (Weighted Random)** | **✅ 완료** |
| **F-3** | **Automated ECR (submitProofWithCompliance PTB)** | **✅ 완료** |
| **F-4** | **Frontend Attestation UI (PCR Verified, Audit Trail)** | **✅ 완료** |
| **F-5** | **Executor Registration Check (Host 시작 시 키 검증)** | **✅ 완료** |
| **F-6** | **Auto-cancel on Execution Failure (에스크로 즉시 해제)** | **✅ 완료** |
| **F-7** | **Chat Encryption with Password (디스크 공격 방어)** | **✅ 완료** |
| **F-7.1** | **zkLogin 호환 Dual-Mode 암호화 + Idle Timeout** | **✅ 완료** |
| **F-2** | **Admin 의존도 제거 (Self-service 5함수 + ProcessedRequests dedup)** | **✅ 완료** |
| G | Model Marketplace | 계획 |
| H | Production (Validator 통합, 분산 Executor) | 계획 |

자세한 구현 상태는 [BARAM_IMPLEMENTATION_PLAN.md](docs/BARAM_IMPLEMENTATION_PLAN.md) 참조.
