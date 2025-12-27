# CLAUDE.md

이 파일은 Claude Code가 nasun-monorepo에서 작업할 때 필요한 지침을 제공합니다.

## 언어 설정

**모든 응답과 사고는 한국어로 진행합니다.**

## UI 언어 규칙

**중요: 모든 앱의 UI 텍스트는 반드시 영어로 작성해야 합니다.**

- 버튼, 레이블, 플레이스홀더, 에러 메시지 등 사용자에게 표시되는 모든 텍스트는 영어로 작성
- 코드 주석과 문서(CLAUDE.md 등)는 한국어 허용
- 날짜/시간은 영어 형식 사용: `date.toLocaleString('en-US')`

## Monorepo 개요

**nasun-monorepo**는 Nasun 프로젝트들의 공유 패키지를 관리하는 pnpm 모노레포입니다.

### 목적
- **핵심 프로젝트: nasun-website** (공식 웹사이트)
- 지갑 모듈(@nasun/wallet)을 여러 프로젝트에서 재사용
- 공통 설정(tsconfig, tailwind) 통합 관리

### 현재 상태 (2025-12-27)

| 앱 | 상태 | 설명 |
|-----|------|------|
| `apps/explorer` | ✅ 완료 | Nasun Explorer (블록 탐색기) |
| `apps/website` | 📋 예정 | nasun-website (공식 웹사이트) - **핵심** |
| `apps/gensol` | 📋 예정 | gensol-website |
| `apps/pado` | 📋 예정 | pado |

## 프로젝트 구조

```
nasun-monorepo/
├── apps/
│   └── explorer/              # @nasun/explorer - 블록 탐색기
├── packages/
│   ├── wallet/                # @nasun/wallet - 지갑 핵심 로직 + hooks
│   ├── wallet-ui/             # @nasun/wallet-ui - React UI 컴포넌트
│   ├── tsconfig/              # @nasun/tsconfig - 공유 TypeScript 설정
│   └── tailwind-config/       # @nasun/tailwind-config - Nasun 브랜드 색상
├── pnpm-workspace.yaml
├── package.json
└── CLAUDE.md
```

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
import { useWallet, useBalance, configureWallet } from '@nasun/wallet';

// RPC URL 설정 (앱 시작 시)
configureWallet({
  rpcUrl: 'https://rpc.devnet.nasun.io',
  faucetUrl: 'https://faucet.devnet.nasun.io',
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

# Explorer 개발 서버
pnpm dev:explorer

# 전체 빌드
pnpm build

# 특정 앱 빌드
pnpm build:explorer
```

## 네트워크 정보

| Spec | Value |
|------|-------|
| Target Network | Nasun Devnet |
| RPC Endpoint | https://rpc.devnet.nasun.io |
| Faucet | https://faucet.devnet.nasun.io |
| Explorer | https://explorer.devnet.nasun.io |
| Chain ID | `6681cdfd` |
| Native Token | NASUN (최소단위: SOE) |

## 새 앱 추가 방법

1. `apps/` 폴더에 앱 복사
2. `package.json`에 workspace 의존성 추가:
   ```json
   "dependencies": {
     "@nasun/wallet": "workspace:*",
     "@nasun/wallet-ui": "workspace:*"
   }
   ```
3. 기존 지갑 코드를 패키지 import로 교체
4. `pnpm install` 실행

## 보안

- **암호화**: Web Crypto API (AES-256-GCM + PBKDF2 100,000 iterations)
- **키 저장**: localStorage에 암호화된 상태로 저장
- **메모리 관리**: 개인키 사용 후 메모리에서 제거

## 관련 프로젝트

| 프로젝트 | 설명 | Monorepo 상태 |
|---------|------|--------------|
| nasun-website | 공식 웹사이트 | 📋 마이그레이션 예정 (우선순위 1) |
| nasun-explorer | 블록 탐색기 | ✅ 완료 |
| gensol-website | GenSol 웹사이트 | 📋 마이그레이션 예정 |
| pado | Pado 앱 | 📋 마이그레이션 예정 |
| nasun-devnet | 블록체인 노드 | ❌ 별도 유지 (Rust) |

## 향후 계획

1. **nasun-website 마이그레이션** (우선순위 1)
2. gensol-website, pado 마이그레이션
3. 다중 토큰 지원 (NUSDC, NBTC)
4. dApp 연결 (Wallet Standard)
