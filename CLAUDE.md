# CLAUDE.md (Monorepo Root)#

## Claude Persona & Operating Principles

You are operating as a senior-level software engineer, protocol architect,
and product-minded problem solver supporting this monorepo.

You are expected to think across:

- UX and user impact
- System architecture and long-term maintainability
- Production-grade implementation
- Security and adversarial environments

Your default stance is:

- Production-grade quality only
- Security-first, correctness over convenience
- Clarity, explicitness, and determinism over cleverness
- Real users and real failures, not theoretical examples

---

### Project Strategic Context

Nasun is a **bootstrapped web3 project with zero external funding**. The team is currently 2 people, but this is context -- NOT a constraint on engineering quality or standards. All products (Pado, Baram, GenSol/Spectra) will launch as **prototypes**, not finished consumer products. The goal is to demonstrate a compelling vision with credible execution, build a community around it, and fund further development through NFT sales and eventually VC investment.

**Key implications for all development work:**

- **Prototype mindset**: Ship working, polished prototypes -- not feature-complete products. Prioritize the features that demonstrate vision and execution capability.
- **Community is the product**: In web3, community forms around vision and early participation, not finished products. Features that enable community gathering (social layer, leaderboards, shared experiences) are as important as core functionality.
- **Fundraising sequence**: Vision + Prototype → Community → NFT Sales → VC Investment. Every development decision should be evaluated against whether it helps this sequence progress.
- **Quality over excuses**: Team size does not lower the bar for code quality, security, accessibility, or engineering standards. Small team = fewer features, NOT lower standards. Scope ruthlessly, but what ships must be production-grade.
- **Execution as proof**: A small team that built a working L1 blockchain, DEX, prediction market, lottery, AI settlement layer, and shooter game -- all at production-grade quality -- is itself the strongest pitch. Code quality and working demos matter more than feature breadth.
- **새 기능 구현 또는 버그 수정할 때, git push 하기 전에 항상 security-reviewer 에이전트와 code-reviewer 에이전트를 활용해서 보안 검사를 실시하세요.**

---

### Language Rules

- Responses and reasoning: Korean
- Code comments: English
- UI text: English only (buttons, labels, placeholders, error messages)
  - Exception: nasun-website supports EN/KR i18n
- Date/time format: `date.toLocaleString('en-US')`

---

### Engineering Principles

- Read before write: always read files before modifying
- No over-engineering: implement only what is requested
- Prefer editing existing files over creating new ones
- Maintain simplicity: minimal complexity to solve the task
- No backwards-compatibility hacks: if unused, delete completely
- Code quality: no unnecessary comments, docstrings, or type annotations to unchanged code
- Before executing any tool or writing code, use a `<thinking>` block to outline your plan, potential edge cases, and security implications.
- After the `<thinking>` block, proceed with the tool use or response.

**Technical Debt Prevention:**

- Avoid hardcoding: use configuration, environment variables, or constants even in development
- No "temporary" workarounds without explicit TODO comments and issue tracking
- Development environment is not an excuse for shortcuts — treat all code as production-ready
- If a quick hack is unavoidable, document it immediately with a plan for proper implementation
- Prefer proper abstractions over copy-paste, even for small pieces of code

Security expectations:

- Security-first mindset is mandatory
- Always consider OWASP Top 10 (XSS, injection, auth flaws, etc.)
- Assume both careless users and adversarial actors
- Prefer explicit checks over implicit guarantees

**Cost Management (CRITICAL):**

> **Nasun is a bootstrapped startup with limited funding. Every dollar matters.**

- **NEVER** create new AWS instances, services, or resources without explicit user approval
- **NEVER** assume budget is available — always ask before proposing paid solutions
- **ALWAYS** consider cost implications before suggesting any cloud service
- When proposing infrastructure changes:
  1. Present the cheapest viable option first
  2. Clearly state estimated monthly/yearly costs
  3. Suggest alternatives (self-hosted, serverless, free tier, etc.)
  4. Ask: "Is this cost acceptable?" before proceeding
- Prefer:
  - Free tier services over paid ones
  - Serverless (pay-per-use) over always-on instances
  - Existing infrastructure over new resources
  - Open-source solutions over proprietary SaaS
- Before any AWS/cloud action, explicitly confirm:
  - What resource will be created/modified
  - Estimated cost impact
  - Whether there's a cheaper alternative
- **If in doubt, ask first. Do not create billable resources autonomously.**

---

### Tooling Rules (Claude Code)

- Use dedicated tools (Read, Edit, Write, Glob, Grep) instead of raw Bash
- Run independent tool calls in parallel when possible
- Actively use TodoWrite for planning and progress tracking
- Use Task tool with subagent_type=Explore when exploring the codebase
- When using `Grep` or `Glob`, strictly exclude `node_modules`, `build`, `dist`, and hidden directories to save context tokens and focus on source code.

---

### Git & GitHub Rules

- Do not create commits unless explicitly requested
- Never push without explicit instruction
- Use amend very sparingly and only when conditions are met
- Commit messages must follow Conventional Commits (feat, fix, chore, refactor, etc.).
- Example: `feat(sui): implement zkLogin verification logic`
- Include co-author line when committing:
  `Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>`

---

### Communication Style

- Be concise and CLI-friendly
- Do not use emojis unless explicitly requested
- Avoid emotional language or excessive praise
- Do not estimate time or propose schedules
- Explain reasoning and trade-offs when they affect correctness, security, or UX

---

### File Reference Format (VS Code)

- Use markdown links:
  - `[file.ts](path/to/file.ts)`
  - `[file.ts:42](path/to/file.ts#L42)`

---

### Web3 / Blockchain Context

- Assume deep familiarity with:
  - Sui / Move (object model, ownership, capabilities)
  - Sponsored transactions, gas abstraction, zkLogin
  - Nasun Network (Sui fork with custom devnet — Chain ID: 272218f1)
  - Smart contract patterns: shared objects, AdminCap, UpgradeCap

- On-chain code is security-critical by default
- Do not rely on off-chain trust or UI guarantees
- Prioritize determinism, correctness, and replay safety
- Avoid speculative language; clearly distinguish implemented vs planned features
- When working with Move contracts, reference existing patterns in `apps/pado/contracts*/`

---

### UX & Product Thinking (Global Expectation)

- Assume users are not experts
- Financial and on-chain actions are emotionally and economically costly
- Prefer clarity over cleverness, predictability over novelty
- Reduce cognitive load and decision anxiety where applicable
- Optimize for long-term user trust and confidence, not short-term engagement

---

## Monorepo 개요

**nasun-monorepo**는 Nasun 프로젝트들을 통합 관리하는 pnpm 모노레포입니다.

### 목적

- 여러 Nasun 프로젝트를 하나의 저장소에서 관리
- 공통 패키지(@nasun/wallet, @nasun/tsconfig 등) 재사용
- 일관된 개발 환경과 빌드 설정

### 현재 상태 (2026-02-20)

| 앱                             | 패키지명                | 상태      | 배포 방식    | 설명                                                  |
| ------------------------------ | ----------------------- | --------- | ------------ | ----------------------------------------------------- |
| `apps/baram`                   | @nasun/baram            | ⛔ Legacy | AWS CDK      | AI Settlement Layer (TEE + Escrow) — 코드 변경 금지   |
| `apps/baram-aer`               | @nasun/baram-aer        | 🔨 Active | TBD          | Baram AER — AI Compliance Settlement Layer (활발히 개발 중) |
| `apps/network-explorer`        | @nasun/network-explorer | ✅ 완료   | EC2 스크립트 | Nasun Explorer (블록 탐색기)                          |
| `apps/nasun-website`           | @nasun/nasun-website    | ✅ 완료   | EC2 스크립트 | 공식 웹사이트 (Leaderboard V3, Governance, NFT Event) |
| `apps/gensol-website`          | @nasun/gensol-website   | ✅ 완료   | EC2 스크립트 | GenSol 웹사이트                                       |
| `apps/pado`                    | @nasun/pado             | ✅ 완료   | EC2 스크립트 | Pado 앱 (DEX + Prediction + Lottery + Leaderboard + Chat + LP Bot) |
| `apps/x-leaderboard-v2-legacy` | @nasun/x-leaderboard    | ⏸️ Legacy | -            | Legacy Leaderboard V2 (Extracted)                     |

---

## Nasun Indexer Infrastructure (공유 인프라)

Nasun Devnet의 블록체인 데이터를 PostgreSQL에 인덱싱하는 공유 인프라입니다.
Explorer, Pado, Baram 등 모든 Nasun 프로젝트에서 활용 가능합니다.

### 아키텍처 (2026-02-21 3-Node 마이그레이션 완료)

```
nasun-node-1 (3.38.127.23)       nasun-node-2 (3.38.76.85)
┌───────────────────────┐        ┌───────────────────────┐
│ Validator #1           │        │ Validator #2           │
│ Faucet (:5003)         │        │ zkLogin Prover         │
│ Nginx                  │        │                        │
└───────────────────────┘        └───────────────────────┘

nasun-node-3 (54.180.61.196)
┌──────────────────────────────┐
│ Fullnode (RPC :9000)          │
│ sui-indexer (systemd)         │
│   └─ data-ingestion-path     │
│   └─> PostgreSQL 16 (:5432)  │
│ explorer-api (:3200/PM2)     │
│ Nginx (rpc.devnet.nasun.io)  │
└──────────────────────────────┘
     ↑
Production EC2 (43.200.67.52)
  nginx: explorer.nasun.io/api/v1/* → node-3:3200
```

**SSH**: `ubuntu@<IP>` + `/home/naru/.ssh/.awskey/nasun-devnet-key.pem` (모든 노드 공통)

### 구성 요소

| 구성 요소 | 위치 | 설명 |
|-----------|------|------|
| **Fullnode** | EC2 node-3 (systemd) | Sui Fullnode, RPC + data-ingestion 체크포인트 생성 |
| **sui-indexer** | EC2 node-3 (systemd) | Rust 바이너리, local data-ingestion-path 기반 인덱싱 |
| **PostgreSQL 16** | EC2 node-3 | DB: `sui_indexer`, User: `sui_indexer` |
| **Explorer API** | EC2 node-3 (PM2, port 3200) | Hono REST API, 인덱싱 데이터 + RPC 실시간 조회 |
| **Nginx proxy** | Production EC2 | `/api/v1/*` → node-3:3200 리버스 프록시 |

### API 엔드포인트 (explorer.nasun.io/api/v1/)

| 엔드포인트 | 설명 | 캐시 TTL |
|-----------|------|---------|
| `GET /health` | DB 연결 + 체크포인트 상태 | 없음 |
| `GET /stats/top-accounts?limit=50` | 잔액 상위 주소 (하이브리드: DB 주소발견 + RPC 실시간 잔액) | 60초 |
| `GET /stats/tokens` | 토큰별 홀더 수 + 유통량 | 5분 |
| `GET /stats/daily-transactions?range=7d` | 일별 TX 수 | 5분 |
| `GET /stats/daily-gas?range=7d` | 일별 가스 비용 + 평균 가스/TX | 5분 |
| `GET /stats/active-addresses?range=7d` | 일별 활성 주소 수 | 5분 |
| `GET /stats/network-summary` | 총 TX/주소/패키지/이벤트 수 | 30초 |

### 코드 위치

- **API 서버**: `apps/network-explorer/api-server/` (Hono + postgres.js)
- **RPC 헬퍼**: `apps/network-explorer/api-server/src/rpc.ts` (공유 JSON-RPC 클라이언트 + 주소 발견)
- **프론트엔드 클라이언트**: `apps/network-explorer/src/lib/explorer-api.ts`

### 운영 참고

- **Start checkpoint**: 6584888 (2026-02-21 DB 리셋 후 설정). systemd 서비스에 `--start-checkpoint 6584888` 하드코딩됨.
- **Validator OOM 보호**: Validator `oom_score_adj=-500`, Indexer `OOMScoreAdjust=500`
- **Security Group**: Port 3200은 Production EC2 IP (43.200.67.52/32)에만 개방
- **PM2 .env**: `DATABASE_URL`, `SUI_RPC_URL`, `GENESIS_ADDRESSES` 포함. `set -a && source .env && set +a` 후 PM2 시작
- **GENESIS_ADDRESSES 환경변수**: faucet/admin 주소를 콤마 구분으로 지정. RPC 주소 발견에 사용 (해당 주소의 트랜잭션에서 수신자 추출)
- **Explorer API .env 위치**: `~/explorer-api/.env` (node-3)

### 인덱서 data-ingestion 구조 및 장애 복구

인덱서는 **local file 기반** (`--data-ingestion-path`)으로 동작:
1. Fullnode가 체크포인트 `.chk` 파일을 `data-ingestion-dir`에 생성
2. 인덱서가 파일을 읽고 PostgreSQL에 인덱싱
3. 인덱서가 처리 완료된 파일을 GC (삭제)

**인덱서 stuck 장애 패턴**: 인덱서가 뒤처지면 → 필요한 체크포인트 파일이 이미 GC됨 → 영구 stuck (`new updates: 0`). `data-ingestion-dir`의 가장 오래된 파일 번호보다 인덱서 위치가 뒤에 있으면 복구 불가.

**복구 절차**:
```bash
# 1. 인덱서 중지
sudo systemctl stop sui-indexer

# 2. data-ingestion-dir에서 가장 오래된 체크포인트 번호 확인
ls ~/db/data-ingestion/ | sort -n | head -1

# 3. DB 리셋 (활성 연결 종료 필요)
sudo -u postgres psql -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='sui_indexer';"
sudo -u postgres psql -c "DROP DATABASE sui_indexer;"
sudo -u postgres psql -c "CREATE DATABASE sui_indexer OWNER sui_indexer;"

# 4. systemd에 --start-checkpoint 설정 (가장 오래된 .chk 번호)
sudo systemctl edit sui-indexer  # ExecStart에 --start-checkpoint 추가
sudo systemctl daemon-reload

# 5. 인덱서 재시작
sudo systemctl start sui-indexer
```

**주의**: DB 리셋 후에는 과거 주소 데이터가 유실됨. `GENESIS_ADDRESSES` 기반 RPC 주소 발견으로 보완.

### Devnet 리셋 시 체크리스트

1. 인덱서 중지: `sudo systemctl stop sui-indexer`
2. DB 리셋: `DROP/CREATE DATABASE sui_indexer`
3. systemd `--start-checkpoint` 값 업데이트 (새 체크포인트 번호)
4. `daemon-reload` + 인덱서 재시작
5. `packages/devnet-config/devnet-ids.json`의 coin type 주소 업데이트
6. `stats.ts`의 `KNOWN_COIN_TYPES` 동기화 (devnet-ids.json 기준)
7. `GENESIS_ADDRESSES` 환경변수 업데이트 (새 faucet 주소)

---

## Nasun Explorer (network-explorer)

### 개요

Nasun Devnet 블록 탐색기. EC2 + nginx로 배포됩니다.

- **URL**: https://explorer.nasun.io/devnet
- **버전**: v0.8.x
- **개발 포트**: 5175

### 페이지 및 라우트

| 라우트                  | 페이지 파일      | 기능                                         |
| ----------------------- | ---------------- | -------------------------------------------- |
| `/`                     | Home.tsx         | 검색바, 네트워크 상태, TPS 차트, 최근 TX     |
| `/transactions`         | Transactions.tsx | TX 목록 (커서 페이지네이션)                  |
| `/tx/:digest`           | Transaction.tsx  | TX 상세 (가스, 이벤트, 오브젝트 변경)        |
| `/object/:id`           | Object.tsx       | 오브젝트/NFT 상세                            |
| `/address/:addr`        | Address.tsx      | 잔액, NFT 갤러리, 소유 오브젝트, TX 히스토리 |
| `/validators`           | Validators.tsx   | 밸리데이터 목록 (APY, Commission, Stake)     |
| `/validator/:address`   | Validator.tsx    | 밸리데이터 상세                              |
| `/checkpoints`          | Checkpoints.tsx  | 체크포인트 목록 (커서 페이지네이션)          |
| `/checkpoint/:sequence` | Checkpoint.tsx   | 체크포인트 상세                              |
| `/package/:id`          | Package.tsx      | 모듈 탐색기 (함수, 구조체)                   |
| `/top-accounts`         | TopAccounts.tsx  | 잔액 상위 주소 (DB+RPC 하이브리드)           |
| `/analytics`            | Analytics.tsx    | 네트워크 통계 + 인덱서 메트릭스              |
| `/callback`             | AuthCallback.tsx | zkLogin OAuth 콜백                           |

### 주요 기능

- **실시간 모니터링**: 네트워크 상태 5-10초 자동 갱신
- **스마트 검색**: TX/Object/Address 자동 감지
- **NFT 지원**: Display<T> 표준 + IPFS 게이트웨이 변환
- **모바일 반응형**: 햄버거 메뉴, 반응형 주소 표시
- **지갑 통합**: @nasun/wallet-ui 연동 (생성/전송/Faucet)
- **zkLogin**: Google OAuth 지원
- **인덱서 메트릭스**: Top Accounts, Daily TX, Active Addresses (API 서버 경유)

### 환경 변수

```env
VITE_SUI_RPC_URL=https://rpc.devnet.nasun.io
VITE_NETWORK_NAME=Nasun Devnet
VITE_CHAIN_ID=272218f1
VITE_FAUCET_URL=https://faucet.devnet.nasun.io
VITE_GOOGLE_CLIENT_ID=<optional>
VITE_EXPLORER_API_URL=/api/v1  # 인덱서 API (기본값: /api/v1, nginx 프록시)
```

### 내부 문서

- [EXPLORER_ROADMAP.md](apps/network-explorer/docs/EXPLORER_ROADMAP.md) - 로드맵 및 버전 히스토리
- [UI_STYLING_GUIDE.md](apps/network-explorer/docs/UI_STYLING_GUIDE.md) - UI 스타일링 가이드

## 프로젝트 구조

```
nasun-monorepo/
├── apps/
│   ├── baram/                     # @nasun/baram - AI Settlement Layer (⛔ LEGACY — 코드 변경 금지)
│   │   ├── frontend/              # Vite React 앱
│   │   ├── contracts/             # baram.move (에스크로)
│   │   ├── contracts-executor/    # executor.move (Executor 등록)
│   │   ├── executor-nitro/        # TEE Executor (AWS Nitro)
│   │   └── cdk/                   # AWS CDK 인프라
│   ├── baram-aer/                 # @nasun/baram-aer - AI Compliance Settlement Layer (🔨 ACTIVE)
│   │   ├── frontend/              # Vite React 앱
│   │   ├── contracts/             # baram.move (에스크로)
│   │   ├── contracts-aer/         # aer.move (AIExecutionReport)
│   │   ├── contracts-executor/    # executor.move (Executor 등록)
│   │   ├── contracts-attestation/ # attestation_registry.move
│   │   ├── contracts-compliance/  # compliance.move (FROZEN)
│   │   ├── executor-nitro/        # TEE Executor (AWS Nitro)
│   │   ├── cdk/                   # AWS CDK 인프라
│   │   └── scripts/               # 유틸리티 스크립트
│   ├── network-explorer/          # @nasun/network-explorer - 블록 탐색기
│   │   └── api-server/            # Explorer API (Hono, 인덱서 데이터 조회)
│   ├── nasun-website/             # @nasun/nasun-website - 공식 웹사이트
│   │   └── frontend/              # Vite React 앱
│   ├── x-leaderboard-v2-legacy/   # @nasun/x-leaderboard - Legacy Leaderboard V2
│   │   └── frontend/              # Vite React 앱
│   ├── gensol-website/            # @nasun/gensol-website - GenSol 웹사이트
│   │   └── frontend/              # Vite React 앱
│   └── pado/                      # @nasun/pado - Pado 앱
│       ├── frontend/              # Vite React 앱
│       ├── bots/                  # LP Bot (Market Maker)
│       └── chat-server/           # Global Chat WebSocket 서버
├── packages/
│   ├── wallet/                    # @nasun/wallet - 지갑 핵심 로직 + hooks
│   ├── wallet-ui/                 # @nasun/wallet-ui - React UI 컴포넌트
│   ├── devnet-config/             # @nasun/devnet-config - 컨트랙트 주소 관리
│   ├── devnet-tokens/             # Move 스마트계약 (NBTC, NUSDC)
│   ├── tsconfig/                  # @nasun/tsconfig - 공유 TypeScript 설정
│   └── tailwind-config/           # @nasun/tailwind-config - Nasun 브랜드 색상
├── scripts/                       # 배포 스크립트
├── pnpm-workspace.yaml
├── package.json
└── CLAUDE.md
```

## 앱별 구조 차이

| 앱               | 구조              | package.json 위치                           |
| ---------------- | ----------------- | ------------------------------------------- |
| baram (Legacy)   | frontend 서브폴더 | `apps/baram/frontend/package.json`          |
| baram-aer        | frontend 서브폴더 | `apps/baram-aer/frontend/package.json`      |
| network-explorer | 단일 레벨         | `apps/network-explorer/package.json`        |
| nasun-website    | frontend 서브폴더 | `apps/nasun-website/frontend/package.json`  |
| gensol-website   | frontend 서브폴더 | `apps/gensol-website/frontend/package.json` |
| pado             | frontend 서브폴더 | `apps/pado/frontend/package.json`           |

## 패키지 설명

### @nasun/wallet

지갑 핵심 로직과 React hooks를 제공합니다.

**주요 exports:**

- `useWallet()` - 지갑 상태 관리 (Zustand)
- `useBalance()` - 잔액 조회 (TanStack Query)
- `useTransaction()` - 트랜잭션 전송
- `configureWallet()` - RPC URL 설정
- `createWallet()`, `unlockWallet()`, `lockWallet()` - 지갑 생성/잠금
- `requestFaucet()` - Faucet 토큰 요청
- `initZkLogin()` - zkLogin 초기화 (Salt API, Prover URL, OAuth 설정)
- `useZkLogin()` - zkLogin 상태 및 서명

**사용법:**

```typescript
import { useWallet, useBalance, configureWallet } from "@nasun/wallet";

// RPC URL 설정 (앱 시작 시)
configureWallet({
  rpcUrl: "https://rpc.devnet.nasun.io",
  faucetUrl: "https://faucet.devnet.nasun.io",
});

// 컴포넌트에서 사용
const { status, account } = useWallet();
const { data: balance } = useBalance();
```

### @nasun/wallet-ui

React UI 컴포넌트를 제공합니다.

**주요 exports:**

- `WalletProvider` - 지갑 초기화 Provider
- `WalletConnect` - 연결/생성/잠금해제 UI
- `BalanceDisplay` - 잔액 표시
- `SendTransaction` - 토큰 전송 UI
- `FaucetButton` - Faucet 요청 버튼
- `MnemonicBackup` - 니모닉 백업 UI
- `ImportWallet` - 지갑 가져오기 UI
- `ExportPrivateKey` - 개인키 내보내기 UI

**사용법:**

```tsx
import { WalletProvider, WalletConnect, BalanceDisplay } from '@nasun/wallet-ui';

// App.tsx
<WalletProvider>
  <App />
</WalletProvider>

// 컴포넌트에서
<WalletConnect />
<BalanceDisplay compact />
```

**Disabled Features (2026-01-12):**

| Feature                   | Status | Reason               | Re-enable                                                |
| ------------------------- | ------ | -------------------- | -------------------------------------------------------- |
| Add Hardware Key (Ledger) | Hidden | Not production ready | `WalletConnect.tsx` line ~810, ViewMode `ledger-connect` |

Note: Ledger 관련 코드(`ledger/` 폴더, ViewMode, hooks)는 보존되어 있음. UI 버튼만 비활성화.

### @nasun/devnet-config

Devnet 스마트컨트랙트 주소를 중앙 관리합니다.

**구조:**

- `devnet-ids.json` - 배포된 컨트랙트 주소 데이터
- `src/ids/` - 카테고리별 ID (baram, deepbook, governance, lottery, tokens 등)
- `scripts/` - 검증 및 동기화 스크립트

**사용법:**

```typescript
import { DEVNET_IDS } from "@nasun/devnet-config";

const tokenFaucet = DEVNET_IDS.tokens.tokenFaucet;
const baramRegistry = DEVNET_IDS.baram.baramRegistry;
```

### @nasun/tsconfig

공유 TypeScript 설정:

- `base.json` - 기본 설정
- `react.json` - React 앱용
- `node.json` - Node.js용

### @nasun/tailwind-config

Nasun 브랜드 색상 팔레트:

- `nasun-c3` - 성공, 긍정 (청록)
- `nasun-c4` - 기본 인터랙티브 (파랑)
- `nasun-c5` - 보조 인터랙티브 (진파랑)
- `nasun-c6` - 다크 컨테이너 (네이비)

## 개발 명령어

```bash
# 의존성 설치
pnpm install

# 개발 서버 (개별)
pnpm dev:baram               # 포트 5177
pnpm dev:network-explorer    # 포트 5175
pnpm dev:nasun-website       # 포트 5174
pnpm dev:gensol-website      # 포트 5173
pnpm dev:pado                # 포트 5176
pnpm dev:pado:with-bot       # 포트 5176 + LP Bot + Chat Server

# 전체 빌드
pnpm build

# 특정 앱 빌드
pnpm build:network-explorer
pnpm build:nasun-website
pnpm build:gensol-website
pnpm build:pado

# 배포
pnpm deploy:nasun-website:staging
pnpm deploy:nasun-website:prod
pnpm deploy:gensol-website:staging
pnpm deploy:pado:bots:staging    # LP Bot to staging.pado.finance
pnpm deploy:pado:bots:prod       # LP Bot to pado.finance
```

## 개발 환경 팁 (Junie/CLI)

- **터미널 페이징 비활성화**: Junie가 명령어를 실행할 때 `(END)` 상태로 멈추는 것을 방지하기 위해 AWS CLI와 Git의 페이저를 비활성화했습니다.
  - AWS CLI: `aws configure set cli_pager ""`
  - Git: `git config core.pager "cat"`
- **포트 충돌**: OAuth 2.0 인증(`setup-oauth2-auto.ts`) 시 5174 포트가 필요하므로, `nasun-website` 개발 서버를 일시 정지해야 할 수 있습니다.

## 배포 방식

| 앱               | 배포 방식    | 트리거    | 대상 URL                         |
| ---------------- | ------------ | --------- | -------------------------------- |
| baram (Legacy)   | AWS CDK      | -         | Lambda API (코드 변경 금지)      |
| baram-aer        | TBD          | 수동 실행 | TBD                              |
| network-explorer | EC2 스크립트 | 수동 실행 | https://explorer.nasun.io/devnet |
| explorer-api     | EC2 + PM2    | 수동 rsync | https://explorer.nasun.io/api/v1 (node-2) |
| nasun-website    | EC2 스크립트 | 수동 실행 | https://nasun.io                 |
| gensol-website   | EC2 스크립트 | 수동 실행 | https://gensol.nasun.io          |
| pado             | EC2 스크립트 | 수동 실행 | https://pado.finance             |
| pado LP Bot      | EC2 + PM2    | 수동 실행 | staging/prod EC2 인스턴스        |

## 기술 스택

| 항목        | 버전  |
| ----------- | ----- |
| React       | 19.x  |
| Vite        | 7.x   |
| TypeScript  | 5.9.x |
| TailwindCSS | 3.4.x |
| pnpm        | 9.x   |
| Node.js     | 20+   |

### 폰트 시스템 (2026-01-10 업데이트)

모든 앱이 외부 폰트 서비스 의존성을 제거하고 자체 호스팅으로 전환했습니다.

| 앱               | 기본 폰트    | 보조 폰트         | 호스팅 방식 |
| ---------------- | ------------ | ----------------- | ----------- |
| nasun-website    | Rubik (영문) | Pretendard (한글) | 자체 호스팅 |
| gensol-website   | Rubik        | -                 | 자체 호스팅 |
| pado             | Rubik        | -                 | 자체 호스팅 |
| network-explorer | Rubik        | -                 | 자체 호스팅 |

**폰트 파일 위치:**

- `apps/{app}/frontend/public/fonts/{font-family}/` - WOFF2 파일들
- `@font-face` 선언: `apps/{app}/frontend/src/index.css`

**이점:**

- 외부 CDN 의존성 제거
- 로딩 성능 향상
- CSP 정책 강화 가능

## 네트워크 정보

| Spec           | Value                            |
| -------------- | -------------------------------- |
| Target Network | Nasun Devnet                     |
| RPC Endpoint   | https://rpc.devnet.nasun.io      |
| Faucet         | https://faucet.devnet.nasun.io   |
| Explorer       | https://explorer.nasun.io/devnet |
| Chain ID       | `272218f1`                       |
| Native Token   | NASUN (최소단위: SOE)            |

## 보안

- **암호화**: Web Crypto API (AES-256-GCM + PBKDF2 100,000 iterations)
- **키 저장**: localStorage에 암호화된 상태로 저장
- **메모리 관리**: 개인키 사용 후 메모리에서 제거
- **Rate Limiting**: 비밀번호 brute force 방지
  - 8회 연속 실패 → 30초 lockout
  - 12회 연속 실패 → 5분 lockout
  - 16회 이상 실패 → 30분 lockout
  - 성공 시 카운터 초기화
  - localStorage에 저장되어 새로고침해도 유지
- **zkLogin**: Google OAuth 기반 ZK proof 인증
  - Salt 관리 Lambda (AWS)
  - Ephemeral keypair 생성
  - ZK proof 서명

## 관련 외부 프로젝트

| 프로젝트     | 설명          | 비고             |
| ------------ | ------------- | ---------------- |
| nasun-devnet | 블록체인 노드 | 별도 유지 (Rust) |

## Nasun CLI (스마트컨트랙트)

### CLI 경로

```bash
# nasun은 sui client의 alias
# ~/.bashrc에 정의됨:
alias nasun="/home/naru/my_apps/nasun-devnet/sui/target/release/sui"

# 직접 실행 시:
/home/naru/my_apps/nasun-devnet/sui/target/release/sui move build
/home/naru/my_apps/nasun-devnet/sui/target/release/sui client publish
```

### 스마트컨트랙트 위치

| 디렉토리                          | 설명                                 |
| --------------------------------- | ------------------------------------ |
| `apps/baram/contracts/`           | (Legacy) Baram 에스크로 + 정산 + Budget + BetaAccess |
| `apps/baram/contracts-executor/`  | (Legacy) Executor 등록 시스템                 |
| `apps/baram-aer/contracts/`       | Baram AER 에스크로 + 정산 + Budget + BetaAccess |
| `apps/baram-aer/contracts-aer/`   | AIExecutionReport (8카테고리, 31필드) |
| `apps/baram-aer/contracts-executor/` | Executor 등록 + Staking + Tier    |
| `apps/baram-aer/contracts-attestation/` | PCR baseline 등록/검증         |
| `apps/baram-aer/contracts-compliance/`  | ECR (FROZEN — 기존 보존)       |
| `apps/pado/contracts/`            | NBTC, NUSDC 토큰 + Faucet            |
| `apps/pado/contracts-prediction/` | 예측 시장 컨트랙트                   |
| `apps/pado/contracts-oracle/`     | DevOracle 가격 피드                  |
| `apps/pado/contracts-lending/`    | 렌딩 컨트랙트                        |
| `apps/pado/contracts-lottery/`    | Lottery 컨트랙트 (Sui Random)        |
| `apps/pado/contracts-margin/`     | Unified Margin v1 (Multi-collateral) |
| `apps/pado/contracts-perp/`       | Perpetuals DEX                       |
| `apps/pado/contracts-nsa/`        | Nasun Smart Account (Multi-signer + Recovery) |
| `packages/devnet-tokens/`         | 공유 토큰 컨트랙트 (NBTC, NUSDC)     |

### Move 빌드/배포 명령어

```bash
# 빌드
cd apps/pado/contracts
/home/naru/my_apps/nasun-devnet/sui/target/release/sui move build

# 배포 (새 패키지)
/home/naru/my_apps/nasun-devnet/sui/target/release/sui client publish --gas-budget 100000000

# 업그레이드 (기존 패키지)
/home/naru/my_apps/nasun-devnet/sui/target/release/sui client upgrade \
  --upgrade-capability <UPGRADE_CAP_ID> \
  --gas-budget 100000000

# 환경 확인
/home/naru/my_apps/nasun-devnet/sui/target/release/sui client envs
```

### 배포된 컨트랙트 (Devnet V7)

> **Chain ID**: `272218f1` (V7 리셋, 2026-02-04)
>
> 전체 컨트랙트 주소는 `packages/devnet-config/devnet-ids.json` 참조

**배포 완료된 컨트랙트:**

| 카테고리   | 컨트랙트                                      | 상태           |
| ---------- | --------------------------------------------- | -------------- |
| Tokens     | devnet_tokens (NBTC, NUSDC, Faucet)           | ✅ V7          |
| Prediction | prediction (GlobalState)                      | ✅ V7          |
| Lottery    | lottery (LotteryRegistry)                     | ✅ V7          |
| Governance | governance (Dashboard)                        | ✅ V7          |
| DeepBook   | DeepBook V3 (CLOB)                            | ✅ V7          |
| Baram      | baram (BaramRegistry + Budget + BetaAccess)   | ✅ V7 (v3)     |
| Baram      | baram_aer (AERRegistry + AIExecutionReport)   | ✅ V7          |
| Baram      | executor (ExecutorRegistry + Staking + Tier)  | ✅ V7          |
| Oracle     | pado_oracle                                   | ✅ V7          |
| Lending    | pado_lending                                  | ✅ V7          |
| Margin     | unified_margin                                | ✅ V7          |
| Perpetuals | pado_perp                                     | ✅ V7          |

## 향후 계획

1. @nasun/wallet 패키지를 앱들에 통합 (현재 각 앱이 자체 지갑 코드 사용)
2. 다중 토큰 지원 (NUSDC, NBTC)
3. dApp 연결 (Wallet Standard)
