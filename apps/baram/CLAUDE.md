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
│       │   ├── empty/           # LandingScreen, WelcomeScreen, NFTGateScreen
│       │   └── theme/           # ThemeProvider, ThemeToggle
│       ├── hooks/               # useNFTGate.ts (BetaAccessNFT 게이팅), useIdleTimeout.ts
│       ├── config/network.ts    # Tier 상수, MODEL_PRICING, TEE_TYPES, EXECUTOR_SELECTION, nftGateEnabled
│       ├── services/            # chatCrypto.ts (AES-256-GCM), chatStorage.ts (IndexedDB)
│       └── utils/crypto.ts      # RSA-OAEP 암호화
│
├── contracts/                   # baram 패키지 (에스크로 + Budget + BetaAccess)
│   └── sources/
│       ├── baram.move           # 에스크로 + 정산
│       ├── budget.move          # Budget delegation (에이전트 예산 위임)
│       └── beta_access.move     # BetaAccessNFT (베타 테스터 게이팅)
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
├── scripts/                     # mint-beta-access.sh (BetaAccessNFT 민팅)
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

### budget.move (Budget Delegation)

> 에이전트에게 제한된 예산을 위임하여 자율적 AI 실행을 가능하게 함.

| 함수 | 호출자 | 설명 |
|------|--------|------|
| `create_budget` | User | Budget 생성 (에이전트 주소, 모델/Executor 화이트리스트, 만료, 최대 건당 금액) |
| `deposit_to_budget` | User (Owner) | Budget에 NUSDC 입금 |
| `withdraw_from_budget` | User (Owner) | Budget에서 NUSDC 출금 |
| `deactivate_budget` | User (Owner) | Budget 비활성화 + 잔액 반환 |
| `update_constraints` | User (Owner) | 모델/Executor 화이트리스트, 최대 건당 금액 업데이트 |
| `spend_from_budget` | Agent | Budget에서 NUSDC 차감 (모델/Executor/금액 제약 검증) |
| `get_balance` / `get_stats` | View | Budget 잔액/통계 조회 |
| `is_model_allowed` / `is_executor_allowed` | View | 화이트리스트 확인 |

### beta_access.move (BetaAccessNFT)

> 베타 테스터에게 NFT를 발급하여 채팅 접근을 게이팅함. 프론트엔드 UX 게이트 (보안 경계 아님).

| 함수 | 호출자 | 설명 |
|------|--------|------|
| `initialize` | UpgradeCap 보유자 | AdminCap + Registry 생성 (업그레이드 후 1회 호출) |
| `mint` | Admin | NFT 민팅 후 recipient에게 전송 (expires_at, remaining_uses 설정) |
| `batch_mint` | Admin | 다수 주소에 일괄 민팅 (MAX_BATCH_SIZE=100) |
| `use_access` | NFT 보유자 | 사용 횟수 차감 (original_uses=0이면 무제한) |
| `is_valid` | View | 만료/사용횟수 확인 |
| `get_remaining_uses` / `get_expires_at` | View | NFT 상태 조회 |
| `get_total_minted` | View | Registry 총 민팅 수 조회 |

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

## Deployed Contracts (Devnet V7)

> **Chain ID**: `272218f1` (V7 리셋, 2026-02-04)
> 전체 주소: `packages/devnet-config/devnet-ids.json` 참조

### Baram Contract (v3 — baram + budget + beta_access)

| 항목 | 주소 |
|------|------|
| Package ID (v3) | `0xaf77e8d92826156b9392c4e3c094d6927fd4397c768e983a8c0bbc9071ea19e6` |
| Original Package ID | `0x970832625c09446677c25ede54821781efa337a548c3919b6cb10e3c0bc8f54f` |
| BaramRegistry | `0x509825058d4a537d3e9dfea39120077c02c1cf68f8b33969689017ae97c8e833` |
| UpgradeCap | `0x5f6406efe648ba842e88c512ccb7704e5fb3e71ab5a961ee53ed101262546291` |
| BetaAccessRegistry | `0xaf2fd2a1ccfd1f41afe51071981047860b81f9cfaa775fc12acadf099577e4f7` |
| BetaAccessAdmin | `0x7daa09decafcfa78b712308a13e8c8204eb89de8434df806df51f4cec076d6c2` |

### Executor Registry + Staking + Tier

| 항목 | 주소 |
|------|------|
| Package ID | `0x45efd887fdaee9d9ad29fb98d4d5c21083769cdc8ce5fb8a5f7d4701e4675ebd` |
| ExecutorRegistry | `0xb5212e4c780544d6bf576e3db7b35118f0380763665bb074229f48d90a7d8656` |
| AdminCap | `0x5e3dca938ff22ec2445a9de84029924b37a5bc5e2fc815c9547c547235d8c522` |
| UpgradeCap | `0x0efe0d05fc4a3fb9e50a101853faebc3dc9e22e7c6aca2b71bb7643bed8c87d0` |
| ProcessedRequests | `0x1d88bb96c90d9bde3a2c10fa4e26f3180e948dae908cb09ef4d6a79e905d7e48` |
| StakingConfig | `0x187d4cc955e0784dde27133ab9d475ecbbd319a25ee7343f2f179c2760fe4a7f` |
| StakingRegistry | `0xcdfc460a93376e7d33d293b2777e1699f31dfc48d85c79e8a503a9f8e792e136` |
| StakingAdminCap | `0x5d9b577611d6d241fcfef011681e688e3ae3709023f518d9158e6d3189c5c554` |
| TierRegistry | `0xda37bee40cdc5e9a6188ddf021fe78d3328ff6384e84dc36014479c07e4300f1` |

### Attestation Registry

| 항목 | 주소 |
|------|------|
| Package ID | `0x6ab728f371455e7db3530794a1c02426f673ec5d2292835bdf365dd248519b9a` |
| AttestationRegistry | `0x120434fe3c76f084b13e9a294bec0c42e95ac408cdeb7327ea5d46e822c3c290` |
| AdminCap | `0xd83e429f303284ae7a0f9e27d31cfa92f3fc186a0736930edf6bdddaab152c9c` |
| UpgradeCap | `0x5b8076bc7f8a8777549ff4772ec8e2f3a8c729fa4ebc1537e2338db839223492` |

### Compliance Registry

| 항목 | 주소 |
|------|------|
| Package ID | `0x601d879d176f5f22f1c3f267bb8895c6b18f1020878ac38a5f88f27ffeed55c3` |
| ComplianceRegistry | `0x884af83cb0b9d5dc1f584a29018e812e777fb36ea99b8b0d96a8645188a4bec0` |
| AdminCap | `0xd0ea98aa3eac954c0edb4218ceab9c9d3c1c8d4f8082efcbdd54ac1347253cbe` |
| UpgradeCap | `0x57af57b0be77ddb9a85fafb7cab68b2387e80785874fa1198cf73d12638804a5` |

### Unified Tokens (devnet_tokens)

| 항목 | 주소 |
|------|------|
| Package ID | `0x96adf476d488ffb588d0bfdb5c422355f065386a2e7124e66746fb7078816731` |
| TokenFaucet | `0x7cc75ad1f00f65589074ba9a8f0ad4922b2be3bfef31c22c66d137bc8dbced92` |
| ClaimRecord | `0x6416304b56cd61238fe552ddb3d07ecc4c12c749fc7038b04d20de3e52953fe1` |

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
VITE_CHAIN_ID=272218f1
VITE_FAUCET_URL=https://faucet.devnet.nasun.io

# Tokens
VITE_NUSDC_TYPE=0x96adf476d488ffb588d0bfdb5c422355f065386a2e7124e66746fb7078816731::nusdc::NUSDC
VITE_TOKENS_PACKAGE_ID=0x96adf476d488ffb588d0bfdb5c422355f065386a2e7124e66746fb7078816731
VITE_TOKEN_FAUCET_ID=0x7cc75ad1f00f65589074ba9a8f0ad4922b2be3bfef31c22c66d137bc8dbced92

# Contracts (falls back to @nasun/devnet-config)
VITE_BARAM_PACKAGE_ID=...
VITE_EXECUTOR_PACKAGE_ID=...
VITE_TIER_REGISTRY_ID=...

# Beta Access NFT Gate (set to 'true' to enable)
VITE_NFT_GATE_ENABLED=false
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
| [budget.move](contracts/sources/budget.move) | Budget delegation (에이전트 예산 위임) |
| [beta_access.move](contracts/sources/beta_access.move) | BetaAccessNFT (베타 게이팅) |
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
| [useNFTGate.ts](frontend/src/hooks/useNFTGate.ts) | BetaAccessNFT 게이팅 hook |
| [NFTGateScreen.tsx](frontend/src/components/empty/NFTGateScreen.tsx) | NFT 게이트 화면 |
| [mint-beta-access.sh](scripts/mint-beta-access.sh) | BetaAccessNFT 민팅 스크립트 |
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
| **F-10** | **@nasun/baram-sdk (Node.js SDK, v0.1.0)** | **✅ 완료** |
| **F-11** | **Budget Delegation (에이전트 예산 위임, budget.move)** | **✅ 완료** |
| **F-12** | **BetaAccessNFT Gate (베타 테스터 NFT 게이팅, beta_access.move)** | **✅ 완료** |
| G | Model Marketplace | 계획 |
| H | Production (Validator 통합, 분산 Executor) | 계획 |

자세한 구현 상태는 [BARAM_IMPLEMENTATION_PLAN.md](docs/BARAM_IMPLEMENTATION_PLAN.md) 참조.
