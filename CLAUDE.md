# CLAUDE.md (Monorepo Root)

## Claude Persona & Operating Principles

You are operating as a senior-level software engineer and protocol architect
supporting this monorepo under the following constraints and priorities.

### Language Rules
- Responses and reasoning: Korean
- Code comments: English
- UI text: English only (buttons, labels, placeholders, error messages)
  - Exception: nasun-website supports EN/KR i18n
- Date/time format: `date.toLocaleString('en-US')`

### Engineering Principles
- Read before write: always read files before modifying
- No over-engineering: implement only what is requested
- Prefer editing existing files over creating new ones
- Security-first: consider OWASP Top 10 (XSS, injection, etc.)
- Maintain simplicity: minimal complexity to solve the task
- No backwards-compatibility hacks: if unused, delete completely
- Code quality: no unnecessary comments, docstrings, or type annotations to unchanged code

### Tooling Rules (Claude Code)
- Use dedicated tools (Read, Edit, Write, Glob, Grep) instead of raw Bash
- Run independent tool calls in parallel
- Actively use TodoWrite for planning and progress tracking
- Use Task tool with subagent_type=Explore when exploring the codebase

### Git & GitHub Rules
- Do not create commits unless explicitly requested
- Never push without explicit instruction
- Use amend very sparingly and only when conditions are met
- Include co-author line when committing:
  `Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>`

### Communication Style
- Be concise and CLI-friendly
- Do not use emojis unless explicitly requested
- Avoid emotional language or excessive praise
- Do not estimate time or propose schedules

### File Reference Format (VS Code)
- Use markdown links:
  - `[file.ts](path/to/file.ts)`
  - `[file.ts:42](path/to/file.ts#L42)`

### Web3 / Blockchain Context
- Assume deep familiarity with:
  - Sui / Move (object model, capabilities, sponsored tx, zkLogin)
  - Nasun Network (Sui fork with custom devnet - Chain ID: 6681cdfd)
  - Smart contract patterns: shared objects, AdminCap, UpgradeCap
- Prioritize correctness, determinism, and security over UX shortcuts
- Avoid speculative language; distinguish implemented vs planned features clearly
- When working with Move contracts, reference existing patterns in `apps/pado/contracts*/`

---

## Monorepo 개요

**nasun-monorepo**는 Nasun 프로젝트들을 통합 관리하는 pnpm 모노레포입니다.

### 목적

- 여러 Nasun 프로젝트를 하나의 저장소에서 관리
- 공통 패키지(@nasun/wallet, @nasun/tsconfig 등) 재사용
- 일관된 개발 환경과 빌드 설정

### 현재 상태 (2026-01-03)

| 앱                     | 패키지명               | 상태    | 배포 방식        | 설명                   |
| ---------------------- | ---------------------- | ------- | ---------------- | ---------------------- |
| `apps/network-explorer` | @nasun/network-explorer | ✅ 완료 | AWS Amplify      | Nasun Explorer (블록 탐색기) |
| `apps/nasun-website`   | @nasun/nasun-website   | ✅ 완료 | EC2 스크립트     | 공식 웹사이트          |
| `apps/gensol-website`  | @nasun/gensol-website  | ✅ 완료 | EC2 스크립트     | GenSol 웹사이트        |
| `apps/pado`            | @nasun/pado            | ✅ 완료 | -                | Pado 앱                |

## 프로젝트 구조

```
nasun-monorepo/
├── apps/
│   ├── network-explorer/          # @nasun/network-explorer - 블록 탐색기
│   ├── nasun-website/             # @nasun/nasun-website - 공식 웹사이트
│   │   └── frontend/              # Vite React 앱
│   ├── gensol-website/            # @nasun/gensol-website - GenSol 웹사이트
│   │   └── frontend/              # Vite React 앱
│   └── pado/                      # @nasun/pado - Pado 앱
│       └── frontend/              # Vite React 앱
├── packages/
│   ├── wallet/                    # @nasun/wallet - 지갑 핵심 로직 + hooks
│   ├── wallet-ui/                 # @nasun/wallet-ui - React UI 컴포넌트
│   ├── tsconfig/                  # @nasun/tsconfig - 공유 TypeScript 설정
│   └── tailwind-config/           # @nasun/tailwind-config - Nasun 브랜드 색상
├── scripts/                       # 배포 스크립트
├── pnpm-workspace.yaml
├── package.json
└── CLAUDE.md
```

**참고**: `packages/sui-utils/`, `packages/ui/`는 예약된 빈 폴더입니다.

## 앱별 구조 차이

| 앱               | 구조                   | package.json 위치 |
| ---------------- | ---------------------- | ----------------- |
| network-explorer | 단일 레벨              | `apps/network-explorer/package.json` |
| nasun-website    | frontend 서브폴더      | `apps/nasun-website/frontend/package.json` |
| gensol-website   | frontend 서브폴더      | `apps/gensol-website/frontend/package.json` |
| pado             | frontend 서브폴더      | `apps/pado/frontend/package.json` |

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
pnpm dev:network-explorer    # 포트 5175
pnpm dev:nasun-website       # 포트 5174
pnpm dev:gensol-website      # 포트 5173
pnpm dev:pado                # 포트 5176

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
```

## 개발 환경 팁 (Junie/CLI)

- **터미널 페이징 비활성화**: Junie가 명령어를 실행할 때 `(END)` 상태로 멈추는 것을 방지하기 위해 AWS CLI와 Git의 페이저를 비활성화했습니다.
  - AWS CLI: `aws configure set cli_pager ""`
  - Git: `git config core.pager "cat"`
- **포트 충돌**: OAuth 2.0 인증(`setup-oauth2-auto.ts`) 시 5174 포트가 필요하므로, `nasun-website` 개발 서버를 일시 정지해야 할 수 있습니다.

## 배포 방식

| 앱               | 배포 방식        | 트리거        | 대상 URL                          |
| ---------------- | ---------------- | ------------- | --------------------------------- |
| network-explorer | AWS Amplify      | git push main | https://explorer.devnet.nasun.io  |
| nasun-website    | EC2 스크립트     | 수동 실행     | https://nasun.io                  |
| gensol-website   | EC2 스크립트     | 수동 실행     | https://gensol.nasun.io           |
| pado             | -                | -             | -                                 |

## 기술 스택

| 항목        | 버전     |
| ----------- | -------- |
| React       | 19.x     |
| Vite        | 7.x      |
| TypeScript  | 5.9.x    |
| TailwindCSS | 3.4.x    |
| pnpm        | 9.x      |
| Node.js     | 20+      |

## 네트워크 정보

| Spec           | Value                            |
| -------------- | -------------------------------- |
| Target Network | Nasun Devnet                     |
| RPC Endpoint   | https://rpc.devnet.nasun.io      |
| Faucet         | https://faucet.devnet.nasun.io   |
| Explorer       | https://explorer.devnet.nasun.io |
| Chain ID       | `6681cdfd`                       |
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

| 프로젝트     | 설명          | 비고                 |
| ------------ | ------------- | -------------------- |
| nasun-devnet | 블록체인 노드 | 별도 유지 (Rust)     |

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

| 디렉토리 | 설명 |
|----------|------|
| `apps/pado/contracts/` | NBTC, NUSDC 토큰 + Faucet |
| `apps/pado/contracts-prediction/` | 예측 시장 컨트랙트 |
| `apps/pado/contracts-oracle/` | DevOracle 가격 피드 |
| `apps/pado/contracts-lending/` | 렌딩 컨트랙트 (예정) |

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

### 배포된 컨트랙트 (Devnet) - 2026-01-04 업데이트

#### DevOracle (가격 피드)

| 컨트랙트 | ID | 비고 |
|----------|------------|------|
| pado_oracle | `0x10ffe5c6...` | Admin Oracle 패키지 |
| OracleRegistry (shared) | `0x02394487...` | 가격 데이터 저장 |
| AdminCap | `0x35552a09...` | 가격 업데이트 권한 |

**심볼 ID**: BTCUSD=1, ETHUSD=2, NASUSD=3 (8 decimals)

#### Pado Tokens (NBTC, NUSDC, Faucet)

| 컨트랙트 | ID | 비고 |
|----------|------------|------|
| pado_tokens | `0x508ba1bd...` | NBTC/NUSDC + Faucet |
| TokenFaucet (shared) | `0x5930a542...` | 토큰 민팅 |
| ClaimRecord (shared) | `0xd5ea726f...` | 24시간 쿨다운 |

#### Prediction Market

| 컨트랙트 | ID | 비고 |
|----------|------------|------|
| prediction | `0x8928903e...` | 예측 시장 패키지 |
| GlobalState (shared) | `0x29d79342...` | 예측 시장 상태 |
| AdminCap | `0x38a29029...` | 관리자 권한 |

#### Unified Margin (NEW)

| 컨트랙트 | ID | 비고 |
|----------|------------|------|
| unified_margin | `0x2886424f...` | Unified Margin 패키지 |
| MarginRegistry (shared) | `0x57979cb0...` | 전역 레지스트리 |
| UpgradeCap | `0x4781e6fd...` | 업그레이드 권한 |

#### Governance (Nasun Website) - 2026-01-08 업데이트

| 컨트랙트 | ID | 비고 |
|----------|------------|------|
| governance (v1) | `0xcd753b00...` | 초기 패키지 (deprecated) |
| governance (v2) | `0x77153fb2...` | Certificate 기반 투표 (deprecated) |
| governance (v3) | `0x01ceae826f1ce6a13407eaa290fd0f99ca02230f1253f312246a57f9edf94ff0` | **현재 패키지** (Domain Separation) |
| VotingPowerOracle (shared) | `0x656632e390118ddf2c41fc59f14ddbbdfdd2115b8a08e4db48e8232846f43199` | Ed25519 서명 검증 |
| CertificateRegistry (shared) | `0x5edbaf20f817ee3a9a94528babff2d2218364d4ec9a60af486a35228ad8a421f` | 중복 발급 방지 |
| Dashboard (shared) | `0x422ee880...` | 프로포절 대시보드 |
| DelegationRegistry | `0x23f4c7b5...` | 투표 위임 레지스트리 |
| AdminCap | `0x21a92db9...` | 관리자 권한 |
| UpgradeCap | `0x71d874e0...` | 업그레이드 권한 |

**v3 Security Features:**
- **Domain Separation**: `NASUN_GOVERNANCE_DEVNET_V1` (cross-chain replay 방지)
- **BCS Serialization**: Move와 Lambda 간 직렬화 일치 (106 bytes message)
- **TTL Policy**: Devnet 15분, Mainnet 최대 30분 (proposal 만료 고려)
- **Sponsored Transaction**: 사용자 가스비 없이 투표 가능 (Zero Gas Fee)

**API Endpoint:**
- Production: `https://3n52syk380.execute-api.ap-northeast-2.amazonaws.com/prod`
- Endpoints: `/certificate`, `/sponsor`, `/voting-power`

**Secrets (AWS Secrets Manager):**
- `nasun/governance/oracle` - Oracle Ed25519 keypair (서명 발급)
- `nasun/governance/sponsor` - Sponsor Ed25519 keypair (가스비 지불)

## 향후 계획

1. @nasun/wallet 패키지를 앱들에 통합 (현재 각 앱이 자체 지갑 코드 사용)
2. 다중 토큰 지원 (NUSDC, NBTC)
3. dApp 연결 (Wallet Standard)
