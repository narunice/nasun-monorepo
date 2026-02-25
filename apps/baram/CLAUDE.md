# CLAUDE.md (Baram App)

> 공통 원칙은 [루트 CLAUDE.md](../../CLAUDE.md)를 참조하세요.

---

## Overview

**Baram**은 나선 네트워크의 AI Compliance Settlement Layer다.

| 요소 | 설명 |
|------|------|
| **Privacy** | TEE(AWS Nitro Enclave) 내에서 프롬프트 복호화/처리 |
| **Escrow** | NUSDC 선불 결제, 성공 시 Executor에 자동 지급 |
| **Compliance** | AIExecutionReport(AER)로 모든 작업의 감사 추적 (8카테고리, 31필드) |
| **Trustless** | 온체인 증명으로 신뢰 없는 정산 |

**설계 원칙:**
- "Executor는 Validator가 아니다" -- Tier는 Compliance Eligibility Signal
- "No job allocation by tier" -- Tier를 weight에 포함하지 않음
- Executor 자동 배정 (Weighted Random) -- 사용자 결정 부담 제거
- Tier는 eligible set 필터 (Bronze+ 자격) + 사후 투명성 정보

---

## Sub-Components

| 컴포넌트 | 위치 | 설명 |
|----------|------|------|
| **Frontend** | `frontend/` | React 19 + Vite 7 Dashboard (포트 5177) |
| **Contracts** | `contracts/` | baram.move (에스크로+Budget+BetaAccess) |
| **Contracts-Executor** | `contracts-executor/` | Executor Registry + Staking + Tier |
| **Contracts-AER** | `contracts-aer/` | AIExecutionReport (8카테고리, 31필드) |
| **Contracts-Agent** | `contracts-agent/` | AgentProfile + Registry + Kill Switch |
| **Contracts-Attestation** | `contracts-attestation/` | PCR baseline 등록/검증 |
| **Contracts-Compliance** | `contracts-compliance/` | ECR (FROZEN -- AER로 대체) |
| **Executor-Nitro** | `executor-nitro/` | TEE Executor (AWS Nitro Enclave) |
| **CDK/Lambda** | `cdk/` | Lambda Executor (Groq cloud models) |
| **API Server** | `api-server/` | AER 인덱서 API (Hono.js, PostgreSQL, 포트 3201) |
| **Agent Runner** | `agent-runner/` | 자율 에이전트 실행기 (research/content/analysis 프리셋) |

### Dashboard Routes

| Route | Page | 설명 |
|-------|------|------|
| `/` | DashboardOverview | 요약 통계, Agent 카드, 최근 AER |
| `/agents` | AgentList | Agent 목록 + 등록 |
| `/agents/:id` | AgentDetail | Agent 상세 (5 tabs) + Kill Switch |
| `/budgets` | BudgetsPage | Budget 관리 (CRUD, 필터, 통계) |
| `/aer` | AERTimeline | AER 타임라인 |
| `/chat` | ChatPage | AI 추론 (Standard/Private mode) |

---

## Development Commands

### Frontend (포트 5177)

```bash
pnpm dev:baram                   # 모노레포 루트에서
cd apps/baram/frontend && pnpm dev  # 직접 실행
```

### Move 컨트랙트

```bash
cd apps/baram/contracts-executor
/home/naru/my_apps/nasun-devnet/sui/target/release/sui move build
/home/naru/my_apps/nasun-devnet/sui/target/release/sui client publish --gas-budget 100000000
```

### TEE Spot Instance

> **주의: 개발 종료 후 반드시 `terminate-spot.sh` 실행!**
> 상세 운영 가이드: [docs/SPOT_INSTANCE_GUIDE.md](docs/SPOT_INSTANCE_GUIDE.md)

```bash
cd apps/baram/executor-nitro
./scripts/launch-spot.sh           # Custom AMI, 2-3분 소요
./scripts/update-executor.sh <IP>  # On-chain endpoint 업데이트
./scripts/terminate-spot.sh        # 반드시 종료!
```

---

## Frontend Environment (.env)

```env
VITE_SUI_RPC_URL=https://rpc.devnet.nasun.io
VITE_NETWORK_NAME=Nasun Devnet
VITE_CHAIN_ID=272218f1
VITE_FAUCET_URL=https://faucet.devnet.nasun.io
VITE_NUSDC_TYPE=0x96adf...::nusdc::NUSDC
VITE_TOKENS_PACKAGE_ID=0x96adf...
VITE_TOKEN_FAUCET_ID=0x7cc75...
VITE_BARAM_PACKAGE_ID=...        # falls back to @nasun/devnet-config
VITE_EXECUTOR_PACKAGE_ID=...
VITE_NFT_GATE_ENABLED=false      # Beta Access NFT Gate
```

---

## TEE/Nitro Security

1. **Private Key Never Leaves Enclave** -- RSA 키쌍은 Enclave 시작 시 생성, 종료 시 파괴
2. **vsock Only** -- Host-Enclave 간 vsock만 허용, Enclave 네트워크 접근 불가
3. **No Secret Logging** -- 개인키, 복호화된 프롬프트 로깅 금지
4. **Attestation** -- NSM COSE_Sign1 서명 + X.509 인증서 체인 검증 (Host에서 수행)
5. **Chat Encryption (Dual-Mode)** -- IndexedDB 채팅 히스토리는 AES-256-GCM으로 암호화
   - **비밀번호 지갑**: `PBKDF2(walletAddress + password)` -- 디스크 접근 공격 방어
   - **zkLogin**: `PBKDF2(walletAddress)` -- 기본 난독화 수준 (address는 공개 정보)
6. **Executor Registration Check** -- Host 시작 시 EXECUTOR_PRIVATE_KEY가 온체인 ExecutorRegistry에 등록된 주소와 일치하는지 검증
7. **Idle Timeout** -- 15분 비활동 시 자동 잠금

---

## Cost Management

> **세션 종료 시 반드시 `terminate-spot.sh` 실행!**

| 항목 | Spot 비용 |
|------|----------|
| r6i.xlarge (시간당) | ~$0.05 |
| 월 20일, 4hr/day | ~$4.00 |
| AMI 스토리지 | ~$2.50/월 |
| **월 총 예상** | **~$6.50** |

---

## 참조 문서

- [docs/BARAM_FEATURES.md](docs/BARAM_FEATURES.md) -- 기능 상세 (AER, Budget, Agent, Executor, TEE, SDK, Dashboard)
- [docs/codebase-map.md](docs/codebase-map.md) -- 디렉토리 구조, 파일 레퍼런스
- [docs/contracts.md](docs/contracts.md) -- 컨트랙트 함수 테이블, 배포 주소
- [docs/environment.md](docs/environment.md) -- executor-nitro 환경 변수 상세
- [docs/BARAM_IMPLEMENTATION_PLAN.md](docs/BARAM_IMPLEMENTATION_PLAN.md) -- 구현 로드맵
- [docs/AER_DESIGN.md](docs/AER_DESIGN.md) -- AER 설계 레퍼런스 (ECR→AER 전환 근거)
