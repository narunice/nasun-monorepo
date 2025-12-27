# CLAUDE.md

이 파일은 Claude Code가 이 저장소에서 작업할 때 필요한 지침을 제공합니다.

## 언어 설정

**모든 응답과 사고는 한국어로 진행합니다.** 코드 주석, 문서 작성 시에도 한국어를 사용합니다.

**커밋 메시지는 영어로 작성합니다.**

---

## Project Overview

**Pado**는 Nasun Network(Sui 포크) 위에서 동작하는 통합 금융 앱입니다.

| Spec | Value |
|------|-------|
| App Name | Pado |
| Network | Nasun Devnet |
| Chain ID | `6681cdfd` (2025-12-25 V3 리셋) |
| Fork Source | Sui mainnet v1.63.0 |
| Base Technology | DeepBook V3 CLOB |
| Core Philosophy | Smart Account, Unified Margin, Object-based Architecture |

### 핵심 목표

1. **Spot DEX** (Phase 1) - DeepBook V3 기반 CLOB 거래소
2. **Perps** (Phase 2) - 무기한 선물 거래
3. **Prediction Markets** (Phase 3) - 예측 시장
4. **Lending** (Phase 4) - 대출 프로토콜

---

## 현재 상태 (2025-12-26)

### Nasun Devnet 인프라

| 항목 | 상태 | 값 |
|------|------|-----|
| Validators | ✅ 운영중 | 2노드 (3.38.127.23, 3.38.76.85) |
| Fullnode RPC | ✅ 운영중 | http://3.38.127.23:9000 |
| Faucet | ✅ 운영중 | http://3.38.127.23:5003/gas (100 NASUN/요청) |
| Fork Source | ✅ 완료 | Sui mainnet v1.63.0 |
| DeepBook V3 | ✅ 배포 완료 | `0xceaeca5...` |
| Test Tokens | ✅ 배포 완료 | NBTC, NUSDC, NASUN |

### 개발 진행 상황

| Phase | 상태 | 설명 |
|-------|------|------|
| Phase 0 | ✅ 완료 | Nasun Devnet V3 리셋 (Sui mainnet v1.63.0 fork) |
| Phase 1 | ✅ 완료 | DeepBook V3 배포 + 테스트 토큰 + NBTC/NUSDC Pool 생성 |
| Phase 2 | ✅ 완료 | Frontend MVP (오더북, 주문폼, 잔고관리) |
| Phase 3 | ✅ 완료 | Trading UX 개선 (가격 클릭 연동, 주문 상태 피드백) |
| Phase 4 | ✅ 완료 | NASUN/NUSDC 거래 풀 생성 |
| Phase 5 | ✅ 완료 | 멀티 풀 지원 (MarketContext, MarketSelector) |
| Phase 6 | ✅ 완료 | NASUN 입금/출금 지원 (네이티브 토큰 가스비 예약) |
| Phase 7 | 🔜 다음 | Trading UX 고급화 (주문 유형, 슬리피지, 가격 제안) |

---

## DeepBook V3 vs V2

### 왜 V3인가?

| 항목 | V2 | V3 |
|------|----|----|
| 상태 | ❌ deprecated (`abort 1337`) | ✅ 활성 개발중 |
| Flash Loan | ❌ | ✅ |
| Oracle Integration | ❌ | ✅ |
| Governance | ❌ | ✅ |
| Deep Token | ❌ | ✅ |
| 타입 | System Package (`0xdee9`) | User Package (별도 배포) |

### DeepBook V3 소스

| 항목 | 값 |
|------|-----|
| Repository | https://github.com/MystenLabs/deepbookv3 |
| Move 패키지 | `deepbookv3/packages/deepbook` |
| License | Apache 2.0 |
| SDK | `@mysten/deepbookv3-sdk` |

### 배포된 컨트랙트 (2025-12-25)

**DeepBook V3**:
| 항목 | 값 |
|------|-----|
| Package | `0xceaeca5c1a5f31e1282c47000b442289b2aa454f007c1e1e316110414e020757` |
| Registry | `0xf38bd1c809db53656767848a84464ab2a9cdd9283dbb3dd54d82a972c7dab6a4` |
| AdminCap | `0x1010f2ef902c482ffba7c9848d74b209bfcbbef4003f583f5faaadcf4ca883cb` |

**Pado Test Tokens**:
| 항목 | 값 |
|------|-----|
| Package | `0xfdd1e75f22a7680ea3b1e29eed397b0fbf06838273aaec77001dcfc101d09976` |
| NBTC Type | `0xfdd1e75f22a7680ea3b1e29eed397b0fbf06838273aaec77001dcfc101d09976::nbtc::NBTC` |
| NUSDC Type | `0xfdd1e75f22a7680ea3b1e29eed397b0fbf06838273aaec77001dcfc101d09976::nusdc::NUSDC` |
| NBTC TreasuryCap | `0xe45f798115f60b04ae8c7c56202f8b7c218c4ad0e3f24bea840f91e8476d2b01` |
| NUSDC TreasuryCap | `0x038d9ecce1c57ddb61ca2351b39a1dbb52c73b48fb0d454c3ed036f93d425a46` |

**Trading Pools**:

**NBTC/NUSDC Pool** (2025-12-25):
| 항목 | 값 |
|------|-----|
| Pool ID | `0xf1f6ee99616774ab0861348f5e3cf4285cea2fa0a5a7e91cee13f4ec554bcc63` |
| tick_size | 10,000 ($0.01) |
| lot_size | 10,000 (0.0001 BTC) |
| maker_fee | 0.05% |
| taker_fee | 0.1% |

**NASUN/NUSDC Pool** (2025-12-26):
| 항목 | 값 |
|------|-----|
| Pool ID | `0x2662e8818e9f5f7c97362e50c33854c4b8e8af1a0cd0e53b1e9677cd66ee8f61` |
| tick_size | 1,000 ($0.001) |
| lot_size | 10,000,000 (0.01 NASUN) |
| maker_fee | 0.05% |
| taker_fee | 0.1% |

**Token Faucet**:
| 항목 | 값 |
|------|-----|
| Package | `0xfdd1e75f22a7680ea3b1e29eed397b0fbf06838273aaec77001dcfc101d09976` |
| Faucet Object | `0xcc9a3c29c42ac6cfb02a5d9b25be8b1c8f70c6f3ea6e48e0bb9a58e8ef01f36f` |
| 지급량 | 1 NBTC + 100,000 NUSDC per request |

### V3 배포 절차

> **Gemini 제안 반영**: Git Submodule로 관리

```bash
# 1. DeepBook V3를 Submodule로 추가
cd /home/naru/my_apps/nasun-apps/pado
git submodule add https://github.com/MystenLabs/deepbookv3.git deepbookv3

# 2. Move 패키지 빌드
cd deepbookv3/packages/deepbook
sui move build

# 3. Nasun Devnet에 배포
nasun client test-publish . --gas-budget 5000000000 --build-env nasun-devnet --with-unpublished-dependencies --force

# 4. 환경변수에 기록
echo "VITE_DEEPBOOK_PACKAGE=<PackageID>" >> ../../.env.local
```

### V3 SDK 사용법

```typescript
// src/config/network.ts (환경변수 사용)
export const NETWORK_CONFIG = {
  rpcUrl: import.meta.env.VITE_RPC_URL,
  faucetUrl: import.meta.env.VITE_FAUCET_URL,
  chainId: import.meta.env.VITE_CHAIN_ID,
  deepbookPackage: import.meta.env.VITE_DEEPBOOK_PACKAGE,
  nbtcType: import.meta.env.VITE_NBTC_TYPE,
  nusdcType: import.meta.env.VITE_NUSDC_TYPE,
};
```

```typescript
// V3 SDK 사용 예시
import { SuiClient } from '@mysten/sui/client';
import { DeepBookClient } from '@mysten/deepbookv3-sdk';

const suiClient = new SuiClient({
  url: 'http://3.38.127.23:9000'
});

const deepBookClient = new DeepBookClient({
  address: '0xceaeca5c1a5f31e1282c47000b442289b2aa454f007c1e1e316110414e020757',
  client: suiClient,
});

// Pool 생성
const tx = deepBookClient.createPool({
  baseCoinType: '0xfdd1e75f22a7680ea3b1e29eed397b0fbf06838273aaec77001dcfc101d09976::nbtc::NBTC',
  quoteCoinType: '0xfdd1e75f22a7680ea3b1e29eed397b0fbf06838273aaec77001dcfc101d09976::nusdc::NUSDC',
  tickSize: 100_000_000n,  // 8 decimals
  lotSize: 1_000_000n,     // 6 decimals
});
```

---

## 기술 스택 (Frontend)

> nasun-explorer, nasun-website와 동일한 스택 사용

| 항목 | 기술 |
|------|------|
| 빌드 도구 | Vite |
| 프레임워크 | React 18/19 |
| 언어 | TypeScript |
| 스타일링 | Tailwind CSS |
| 상태 관리 | Zustand |
| 라우팅 | react-router-dom |
| 데이터 페칭 | @tanstack/react-query |
| Sui SDK | @mysten/sui |

---

## 프로젝트 구조

```
pado/
├── CLAUDE.md                     # 이 파일
├── README.md                     # 프로젝트 소개
├── doc/
│   └── PADO_IMPLEMENTATION_PLAN.md  # 구현 계획서
├── contracts/                    # Move 스마트 컨트랙트
│   ├── pado/                    # Pado 테스트 토큰 패키지
│   │   └── sources/
│   │       ├── nbtc.move        # 테스트 BTC 토큰
│   │       ├── nusdc.move       # 테스트 USDC 토큰
│   │       └── faucet.move      # Token Faucet
│   └── deepbookv3/              # DeepBook V3 (git submodule)
└── frontend/                    # Frontend (Vite + React)
    └── src/
        ├── config/
        │   └── network.ts       # RPC, Package IDs, Pools
        ├── lib/
        │   ├── sui-client.ts    # Sui 클라이언트
        │   └── deepbook.ts      # DeepBook V3 유틸 (오더북, 잔고 조회)
        ├── wallet/              # 임베디드 지갑 모듈
        │   ├── lib/crypto.ts
        │   ├── lib/keystore.ts
        │   └── hooks/useWallet.ts
        ├── features/
        │   └── trading/         # 거래 기능 모듈
        │       ├── components/
        │       │   ├── OrderForm.tsx        # 주문 폼
        │       │   ├── OrderbookView.tsx    # 오더북 UI
        │       │   ├── OpenOrdersCard.tsx   # 미체결 주문
        │       │   ├── BalanceManagerCard.tsx # 잔고 관리
        │       │   └── MarketSelector.tsx   # 마켓 선택 드롭다운
        │       ├── context/
        │       │   ├── OrderFormContext.tsx # 주문 폼 상태
        │       │   └── MarketContext.tsx    # 현재 선택된 마켓/풀
        │       ├── hooks/
        │       │   ├── useOrderbook.ts      # 오더북 데이터
        │       │   └── useOpenOrders.ts     # 미체결 주문 데이터
        │       ├── transactions.ts          # DeepBook 트랜잭션 빌더
        │       ├── useTrading.ts            # 거래 액션 훅
        │       └── types.ts                 # 타입 정의
        ├── pages/
        │   └── TradePage.tsx    # 메인 거래 페이지
        └── components/          # 공통 UI 컴포넌트
```

---

## 네트워크 설정

### Nasun Devnet 연결

```typescript
// src/config/network.ts
export const NETWORK_CONFIG = {
  rpcUrl: 'http://3.38.127.23:9000',
  faucetUrl: 'http://3.38.127.23:5003/gas',
  chainId: '6681cdfd',

  // DeepBook V3 (배포 후 업데이트)
  DEEPBOOK_V3_PACKAGE: '<DEPLOYED_PACKAGE_ID>',

  // System packages
  SUI_SYSTEM: '0x2',
  SUI_FRAMEWORK: '0x1',
};
```

### Faucet 사용

```bash
# 100 NASUN 요청 (20 NASUN × 5개 코인)
curl -X POST http://3.38.127.23:5003/gas \
  -H "Content-Type: application/json" \
  -d '{"FixedAmountRequest":{"recipient":"<YOUR_ADDRESS>"}}'
```

---

## Smart Account 아키텍처

### 인터페이스 설계

```typescript
// smart-account/types/account.ts
export interface ISmartAccount {
  readonly address: string | null;
  readonly isConnected: boolean;

  connect(): Promise<void>;
  disconnect(): Promise<void>;
  signTransaction(tx: Transaction): Promise<SignedTransaction>;

  // DeepBook V3 BalanceManager 관리
  getBalanceManager(poolId: string): Promise<string | null>;
  createBalanceManager(): Promise<string>;
}

export type AccountType = 'browser' | 'embedded' | 'zklogin' | 'passkey';
```

### 확장 계획

| Adapter | 현재 | 향후 |
|---------|------|------|
| BrowserWalletAdapter | ✅ 구현 예정 | - |
| EmbeddedWalletAdapter | ✅ 구현 예정 | - |
| ZkLoginAdapter | - | Phase 3 |
| PasskeyAdapter | - | Phase 4 |

---

## 멀티 풀 아키텍처 (Phase 5)

### MarketContext

```typescript
// 현재 선택된 마켓/풀을 전역으로 관리
interface MarketContextType {
  currentMarket: MarketKey;     // 'NBTC_NUSDC' | 'NASUN_NUSDC'
  currentPool: PoolConfig;      // 풀 설정 (id, baseToken, quoteToken, tickSize, lotSize)
  setMarket: (market: MarketKey) => void;
  markets: MarketInfo[];        // 사용 가능한 마켓 목록
  getBaseToken: () => TokenConfig;
  getQuoteToken: () => TokenConfig;
}
```

### 동적 토큰 소수점 처리

```typescript
// 토큰별 소수점 자릿수
const TOKEN_DECIMALS = {
  NBTC: 8,      // 0.00000001 BTC
  NASUN: 9,     // 0.000000001 NASUN (SOE 단위)
  NUSDC: 6,     // 0.000001 USDC
};

// 가격/수량 변환 시 currentPool 기준으로 처리
const rawPrice = priceToRaw(price, currentPool.quoteToken.decimals);
const rawQuantity = quantityToRaw(amount, currentPool.baseToken.decimals);
```

### React Query 캐시 키

```typescript
// 마켓별로 별도 캐시 유지
useQuery({
  queryKey: ['orderbook', currentMarket],  // 'NBTC_NUSDC' 또는 'NASUN_NUSDC'
  queryFn: () => getOrderbook(currentPool),
});
```

---

## 관련 프로젝트

| 프로젝트 | 경로 | 설명 |
|---------|------|------|
| nasun-devnet | `/home/naru/my_apps/nasun-devnet` | 블록체인 노드 |
| nasun-explorer | `/home/naru/my_apps/nasun-explorer` | 블록 탐색기 (지갑 모듈 원본) |
| nasun-website | `/home/naru/my_apps/nasun-apps/nasun-website` | 공식 웹사이트 |

---

## 개발 명령어

```bash
# 프론트엔드 개발 서버
pnpm dev

# Move 컨트랙트 빌드
cd contracts && sui move build

# Move 컨트랙트 배포
nasun client publish --gas-budget 100000000 ./contracts

# DeepBook V3 배포
cd deepbook-v3 && nasun client publish --gas-budget 500000000
```

---

## 주요 문서

- [PADO_IMPLEMENTATION_PLAN.md](doc/PADO_IMPLEMENTATION_PLAN.md) - 상세 구현 계획서
- [nasun-devnet CLAUDE.md](/home/naru/my_apps/nasun-devnet/CLAUDE.md) - Devnet 인프라 정보

---

## 주의사항

1. **DeepBook V3 배포 필수**: V3는 시스템 패키지가 아니므로 별도 배포 필요
2. **BalanceManager**: V3에서 AccountCap 대신 BalanceManager 사용
3. **Pool 생성 비용**: 예상 100+ NASUN
4. **SOE 단위**: 1 NASUN = 10^9 SOE (NASUN의 최소 단위)

---

## EC2 SSH 접속

```bash
# Node 1 (Validator + Fullnode + Faucet)
ssh -i ~/.ssh/.awskey/nasun-devnet-key.pem ubuntu@3.38.127.23

# Node 2 (Validator)
ssh -i ~/.ssh/.awskey/nasun-devnet-key.pem ubuntu@3.38.76.85
```
