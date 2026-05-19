# Package API Reference

## @nasun/wallet

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

---

## @nasun/wallet-ui

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

---

## @nasun/devnet-config

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

---

## @nasun/baram-sdk

Baram AER(AI Execution Report) 분석 및 조회를 위한 Node.js SDK. **유일하게 npm published 패키지** (v0.3.0, MIT). 다른 모든 워크스페이스 패키지는 `private: true`.

**주요 기능:**

- AER 조회: `getAERByRequestId()`, `getAERsByOwner()`, `getAERsByExecutor()`
- 분석: `getAERAnalytics()` (기간별 집계, 모델/카테고리별 통계)
- 체인 순회: `traverseAERChain()` (parent_report_id 기반 실행 체인 추적)
- Budget 분석: `getBudgetUtilization()` (예산 사용률)
- Dual-mode: 인덱서 API 우선, RPC fallback

**사용법:**

```typescript
import { AERClient } from '@nasun/baram-sdk';

const client = new AERClient({
  rpcUrl: 'https://rpc.devnet.nasun.io',
  indexerUrl: 'https://explorer.nasun.io/api/v1', // optional
});

const reports = await client.getAERsByOwner(ownerAddress);
const analytics = await client.getAERAnalytics({ period: '7d' });
```

**빌드:** ESM/CJS dual build via tsup.

---

## @nasun/profile-core

사용자 프로필(identity, X/Telegram/Google 연결, NFT health, wallet linkage 등) 핵심 로직. 프레임워크 비의존(순수 TS).

**주요 영역:**

- Profile fetch/normalize (DynamoDB `UserProfiles` 기반)
- Identity resolution (identityId ↔ walletAddress ↔ social handle)
- Linked accounts (X / Google / Telegram / MetaMask)
- NFT ownership 조회 (Genesis Pass 등)

**빌드:** `dist/index.js` 번들. 다른 패키지(`@nasun/profile-react`)와 앱(`apps/nasun-website`, `apps/gostop`)이 의존.

> **Why a separate package**: chat-server, frontend, scripts가 모두 동일한 identity 모델을 공유해야 하지만 React를 안 쓰는 환경(chat-server는 Hono, scripts는 Node CLI)도 있어서 React 의존성을 분리. EVM link 영향 범위는 매우 좁다 — `linkedAccounts.metamask`는 leaderboard/score/points와 무관하며 현재 실질 활용은 Genesis Pass NFT ownership 확인 뿐 (reference_evm_link_scope.md). 함부로 범위를 넓히지 말 것.

---

## @nasun/profile-react

`@nasun/profile-react` — `@nasun/profile-core` 위에 얹은 React hooks 레이어. Zustand로 client-side 캐싱.

**주요 exports:**

- `useProfile()` - 현재 사용자 프로필 + 로딩 상태
- `useLinkedAccounts()` - 연결된 소셜 계정 목록
- `ProfileProvider` - context 주입 (앱 root에 한 번)

**사용처:** `apps/nasun-website/frontend`, `apps/gostop/frontend`, 향후 `apps/uju/`.

---

## devnet-tokens / devnet-tokens-v2 / devnet-tokens-v2-neth

Move 스마트컨트랙트 패키지들 (TypeScript 패키지 아님, `Move.toml` + `sources/`).

| 패키지 | 용도 |
|--------|------|
| `devnet-tokens` | v1. NBTC, NUSDC 초기 토큰 (published-at: `0x1c9357...362e7`) |
| `devnet-tokens-v2` | v2. coin type 통합/정리 후 재배포 (TOKEN_CONSOLIDATION_PLAN.md) |
| `devnet-tokens-v2-neth` | v2의 ETH-pegged 변형 (NETH) |

배포 주소는 `packages/devnet-config/devnet-ids.json`에서 중앙 관리. Devnet 리셋 시 `pnpm devnet:sync`로 동기화.

> **Why three versions**: v1은 초기 prototype 토큰 구조. v2는 거래쌍 단순화 위해 coin type을 한 곳에서 통합. v2-neth는 Pado의 ETH 마켓 도입 시 별도 NETH가 필요해 추가. v1을 삭제하지 않은 이유는 이미 배포된 컨트랙트가 v1 published-at을 참조하기 때문 — Move 모듈명/published-at은 사실상 invariant.

---

## @nasun/tsconfig

공유 TypeScript 설정:

- `base.json` - 기본 설정
- `react.json` - React 앱용
- `node.json` - Node.js용

---

## @nasun/tailwind-config

Nasun 브랜드 색상 팔레트:

- `nasun-c3` - 성공, 긍정 (청록)
- `nasun-c4` - 기본 인터랙티브 (파랑)
- `nasun-c5` - 보조 인터랙티브 (진파랑)
- `nasun-c6` - 다크 컨테이너 (네이비)

---

## 폰트 시스템 (2026-01-10)

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
