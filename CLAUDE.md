# CLAUDE.md

이 파일은 Claude Code가 nasun-monorepo에서 작업할 때 필요한 지침을 제공합니다.

## 언어 설정

**모든 응답과 사고는 한국어로 진행합니다.**
**코드 파일 내 주석은 영어로 작성합니다.**

## UI 언어 규칙

**중요: 모든 앱의 UI 텍스트는 반드시 영어로 작성해야 합니다.**

- 버튼, 레이블, 플레이스홀더, 에러 메시지 등 사용자에게 표시되는 모든 텍스트는 영어로 작성
- 코드 주석과 문서(CLAUDE.md 등)는 한국어 허용
- 날짜/시간은 영어 형식 사용: `date.toLocaleString('en-US')`

**다국어 지원: 현재는 Nasun Website만 영어/한국어를 지원합니다. 다른 앱들은 영어만 지원하고 있습니다.**

## Monorepo 개요

**nasun-monorepo**는 Nasun 프로젝트들을 통합 관리하는 pnpm 모노레포입니다.

### 목적

- 여러 Nasun 프로젝트를 하나의 저장소에서 관리
- 공통 패키지(@nasun/wallet, @nasun/tsconfig 등) 재사용
- 일관된 개발 환경과 빌드 설정

### 현재 상태 (2025-12-27)

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

### 배포된 컨트랙트 (Devnet)

| 컨트랙트 | Package ID | 환경변수 |
|----------|------------|----------|
| pado (tokens) | `0xfdd1e75f...` | `VITE_TOKENS_PACKAGE` |
| prediction | `0xc585b0b9...` | - |
| TokenFaucet (shared) | `0xc9ddd723...` | `VITE_TOKEN_FAUCET` |

## 향후 계획

1. @nasun/wallet 패키지를 앱들에 통합 (현재 각 앱이 자체 지갑 코드 사용)
2. 다중 토큰 지원 (NUSDC, NBTC)
3. dApp 연결 (Wallet Standard)
