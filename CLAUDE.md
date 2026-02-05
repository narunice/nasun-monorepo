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

Nasun is a **bootstrapped web3 project built by a 2-person team with zero external funding**. All products (Pado, Baram, GenSol/Spectra) will launch as **prototypes**, not finished consumer products. The goal is to demonstrate a compelling vision with credible execution, build a community around it, and fund further development through NFT sales and eventually VC investment.

**Key implications for all development work:**

- **Prototype mindset**: Ship working, polished prototypes -- not feature-complete products. Prioritize the features that demonstrate vision and execution capability.
- **Community is the product**: In web3, community forms around vision and early participation, not finished products. Features that enable community gathering (social layer, leaderboards, shared experiences) are as important as core functionality.
- **Fundraising sequence**: Vision + Prototype → Community → NFT Sales → VC Investment. Every development decision should be evaluated against whether it helps this sequence progress.
- **Resource constraint**: Two people, no funding. Ruthless scoping is mandatory. Every feature must justify its inclusion in the prototype.
- **Execution as proof**: The fact that a 2-person team built a working L1 blockchain, DEX, prediction market, lottery, AI settlement layer, and shooter game is itself the strongest pitch. Code quality and working demos matter more than feature breadth.
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

### 현재 상태 (2026-02-05)

| 앱                             | 패키지명                | 상태      | 배포 방식    | 설명                                                  |
| ------------------------------ | ----------------------- | --------- | ------------ | ----------------------------------------------------- |
| `apps/baram`                   | @nasun/baram            | ✅ 완료   | AWS CDK      | AI Settlement Layer (TEE + Escrow)                    |
| `apps/network-explorer`        | @nasun/network-explorer | ✅ 완료   | EC2 스크립트 | Nasun Explorer (블록 탐색기)                          |
| `apps/nasun-website`           | @nasun/nasun-website    | ✅ 완료   | EC2 스크립트 | 공식 웹사이트 (Leaderboard V3, Governance, NFT Event) |
| `apps/gensol-website`          | @nasun/gensol-website   | ✅ 완료   | EC2 스크립트 | GenSol 웹사이트                                       |
| `apps/pado`                    | @nasun/pado             | ✅ 완료   | EC2 스크립트 | Pado 앱 (DEX + Prediction + Lottery + LP Bot)         |
| `apps/x-leaderboard-v2-legacy` | @nasun/x-leaderboard    | ⏸️ Legacy | -            | Legacy Leaderboard V2 (Extracted)                     |

---

## Nasun Explorer (network-explorer)

### 개요

Nasun Devnet 블록 탐색기. EC2 + nginx로 배포됩니다.

- **URL**: https://explorer.nasun.io/devnet
- **버전**: v0.7.x
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
| `/callback`             | AuthCallback.tsx | zkLogin OAuth 콜백                           |

### 주요 기능

- **실시간 모니터링**: 네트워크 상태 5-10초 자동 갱신
- **스마트 검색**: TX/Object/Address 자동 감지
- **NFT 지원**: Display<T> 표준 + IPFS 게이트웨이 변환
- **모바일 반응형**: 햄버거 메뉴, 반응형 주소 표시
- **지갑 통합**: @nasun/wallet-ui 연동 (생성/전송/Faucet)
- **zkLogin**: Google OAuth 지원

### 환경 변수

```env
VITE_SUI_RPC_URL=https://rpc.devnet.nasun.io
VITE_NETWORK_NAME=Nasun Devnet
VITE_CHAIN_ID=272218f1
VITE_FAUCET_URL=https://faucet.devnet.nasun.io
VITE_GOOGLE_CLIENT_ID=<optional>
```

### 내부 문서

- [EXPLORER_ROADMAP.md](apps/network-explorer/docs/EXPLORER_ROADMAP.md) - 로드맵 및 버전 히스토리
- [UI_STYLING_GUIDE.md](apps/network-explorer/docs/UI_STYLING_GUIDE.md) - UI 스타일링 가이드

## 프로젝트 구조

```
nasun-monorepo/
├── apps/
│   ├── baram/                     # @nasun/baram - AI Settlement Layer
│   │   ├── frontend/              # Vite React 앱
│   │   ├── contracts/             # baram.move (에스크로)
│   │   ├── contracts-executor/    # executor.move (Executor 등록)
│   │   ├── executor-nitro/        # TEE Executor (AWS Nitro)
│   │   └── cdk/                   # AWS CDK 인프라
│   ├── network-explorer/          # @nasun/network-explorer - 블록 탐색기
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
| baram            | frontend 서브폴더 | `apps/baram/frontend/package.json`          |
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
| baram            | AWS CDK      | 수동 실행 | Lambda API                       |
| network-explorer | EC2 스크립트 | 수동 실행 | https://explorer.nasun.io/devnet |
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
| `apps/baram/contracts/`           | Baram 에스크로 + 정산                |
| `apps/baram/contracts-executor/`  | Executor 등록 시스템                 |
| `apps/pado/contracts/`            | NBTC, NUSDC 토큰 + Faucet            |
| `apps/pado/contracts-prediction/` | 예측 시장 컨트랙트                   |
| `apps/pado/contracts-oracle/`     | DevOracle 가격 피드                  |
| `apps/pado/contracts-lending/`    | 렌딩 컨트랙트                        |
| `apps/pado/contracts-lottery/`    | Lottery 컨트랙트 (Sui Random)        |
| `apps/pado/contracts-margin/`     | Unified Margin v1 (Multi-collateral) |
| `apps/pado/contracts-perp/`       | Perpetuals DEX                       |
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

### 배포된 컨트랙트 (Devnet V6)

> **Chain ID**: `272218f1` (V7 리셋, 2026-02-04)
>
> 전체 컨트랙트 주소는 `packages/devnet-config/devnet-ids.json` 참조

**배포 완료된 컨트랙트:**

| 카테고리   | 컨트랙트                            | 상태           |
| ---------- | ----------------------------------- | -------------- |
| Tokens     | devnet_tokens (NBTC, NUSDC, Faucet) | ✅ V6          |
| Prediction | prediction (GlobalState)            | ✅ V6          |
| Lottery    | lottery (LotteryRegistry)           | ✅ V6          |
| Governance | governance (Dashboard)              | ✅ V6          |
| DeepBook   | DeepBook V3 (CLOB)                  | ✅ V6          |
| Baram      | baram (BaramRegistry)               | ✅ V6          |
| Baram      | executor (ExecutorRegistry)         | ✅ V6          |
| Oracle     | pado_oracle                         | V6 재배포 대기 |
| Margin     | unified_margin                      | V6 재배포 대기 |
| Perpetuals | pado_perp                           | V6 재배포 대기 |

## 향후 계획

1. @nasun/wallet 패키지를 앱들에 통합 (현재 각 앱이 자체 지갑 코드 사용)
2. 다중 토큰 지원 (NUSDC, NBTC)
3. dApp 연결 (Wallet Standard)
