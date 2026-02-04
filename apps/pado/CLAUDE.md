# CLAUDE.md (apps/pado)

> 공통 규칙(언어 설정, UI 언어 규칙)은 루트 [CLAUDE.md](../../CLAUDE.md) 참조

---

## Vision: Unified Onchain Finance

**Pado**는 Nasun Network 위에서 동작하는 **비수탁형(non-custodial) 통합 금융 애플리케이션**입니다.

> *"Unified, non-custodial spot, derivatives, lending, staking, prediction markets, and payments through a single smart account on the Nasun Network."*

### 핵심 철학

| 원칙 | 설명 |
|------|------|
| **Single Smart Account** | 모든 금융 활동(거래, 대출, 스테이킹, 결제)을 하나의 계정으로 통합 관리 |
| **Unified Margin System** | 포트폴리오 레벨의 통합 마진 - 자산이 모든 상품에 걸쳐 담보로 기능 |
| **Non-Custodial Control** | 사용자가 자산에 대한 완전한 통제권 유지, 개인키 노출 없음 |
| **Object-Based Architecture** | Nasun의 객체 기반 상태 모델로 복잡한 금융 상호작용을 온체인에서 네이티브하게 모델링 |
| **CEX-Grade UX, DEX-Level Transparency** | 중앙화 거래소 수준의 사용자 경험 + 온체인 검증 가능성 |

---

## Product Roadmap

### 완료된 단계

| Phase | 상태 | 제품 | 설명 |
|-------|------|------|------|
| Phase 0 | ✅ 완료 | Infrastructure | Nasun Devnet V6 (Sui mainnet v1.63.0 fork, 2026-01-27 리셋) |
| Phase 1 | ✅ 완료 | Spot DEX Core | DeepBook V3 CLOB 배포 + 테스트 토큰 |
| Phase 2 | ✅ 완료 | Trading UI MVP | 오더북, 주문폼, 잔고관리 |
| Phase 3 | ✅ 완료 | Trading UX | 가격 클릭 연동, 주문 상태 피드백 |
| Phase 4 | ✅ 완료 | Multi-Pool | NASUN/NUSDC 풀 추가, MarketSelector |
| Phase 5 | ✅ 완료 | Native Token | NASUN 입금/출금 지원 (가스비 예약) |
| Phase 6 | ✅ 완료 | Trading UX Pro | 고급 주문 유형, 슬리피지 설정, 가격 제안 |
| Phase 7 | ✅ 완료 | Portfolio Dashboard | 포트폴리오 대시보드, P&L 표시 |
| Phase 8 | ✅ 완료 | Mobile & Theme | 모바일 반응형, 다크/라이트 테마 |
| Phase 9 | ✅ 완료 | Smart Account v2 | zkLogin 인증, 시드리스 온보딩 (2026-01-03) |
| Phase 11 | ✅ 완료 | Perpetuals | 무기한 선물 거래 + 청산 엔진 (11.1-11.4 완료) |
| Phase 14 | ✅ 완료 | Prediction Markets | 예측 시장 + 시드 유동성 |
| Phase 15 | ✅ 완료 | Payments | 즉시 결제 및 전송 |
| Phase 16 | ✅ 완료 | Unified Margin v1 | Multi-collateral, Risk Engine, Liquidation (2026-01-10) |
| Phase 17 | ✅ 완료 | Lottery | 주간 로또 (2026-01-09 배포) |

### 진행 중 및 예정

| Phase | 상태 | 제품 | 설명 |
|-------|------|------|------|
| Phase 10 | 📋 계획 | Cross-Chain Vaults | BTC, ETH 등 외부 자산 Vault 통합 |
| Phase 12 | 📋 계획 | Lending & Borrowing | 통합 대출 프로토콜 (컨트랙트 구현 완료, UI 스텁 존재) |
| Phase 13 | 📋 계획 | Staking | NAS 토큰 스테이킹 (UI 스텁 존재) |

---

## Core Architecture

### 1. Account Model: Smart Account

Pado는 Nasun의 네이티브 계정 추상화를 활용합니다:

```
┌─────────────────────────────────────────────────────────────┐
│                    Nasun Smart Account                       │
├─────────────────────────────────────────────────────────────┤
│  Authentication                                              │
│  ├── zkLogin (ZK proof + Google OAuth)                      │
│  ├── Passkey (Device credentials) [Planned]                 │
│  └── Embedded Wallet (Current primary)                      │
├─────────────────────────────────────────────────────────────┤
│  Single Account → All Products                               │
│  ├── Spot Trading (DeepBook V3 CLOB)                        │
│  ├── Perpetual Futures (20x leverage)                       │
│  ├── Prediction Markets (Binary YES/NO)                     │
│  ├── Lottery (Weekly draw)                                  │
│  ├── Lending/Borrowing [Planned]                            │
│  ├── Staking [Planned]                                      │
│  └── Payments (QR code transfer)                            │
└─────────────────────────────────────────────────────────────┘
```

### 2. Object-Based Financial Architecture

Nasun의 객체 지향 상태 모델로 모든 자산과 포지션을 동적, 조합 가능한 객체로 표현:

| 객체 유형 | 설명 |
|-----------|------|
| **Collateral Objects** | idle ↔ margin ↔ lending 상태 간 전환 |
| **Position Objects** | 청산, 오라클, 결제 로직 내장 |
| **Market Objects** | 크로스-프로덕트 조합성, 원자적 연산 지원 |

### 3. Unified Margin & Risk Engine (v1 완료)

```
┌─────────────────────────────────────────────────────────────┐
│                   Unified Risk Engine v1                     │
├─────────────────────────────────────────────────────────────┤
│  Multi-Collateral Margin (NUSDC + NBTC)                     │
│  ├── NUSDC: 100% 담보 인정 (Haircut 0%)                    │
│  ├── NBTC: 90% 담보 인정 (Haircut 10%)                     │
│  └── Oracle 가격 기반 실시간 담보 가치 평가                 │
├─────────────────────────────────────────────────────────────┤
│  Risk Engine v1                                             │
│  ├── 4-Tier Threshold: IM(10%), Warning(8%), MM(5%), FC(3%)│
│  ├── AccountPositions: 포지션 추적 + PnL 계산              │
│  └── Liquidation: 5% 보너스, 50% 최대 청산 비율            │
├─────────────────────────────────────────────────────────────┤
│  Benefits                                                    │
│  ├── 자본 사일로 제거                                       │
│  ├── 조합 가능한 수익률                                     │
│  └── 향상된 자본 효율성                                     │
└─────────────────────────────────────────────────────────────┘
```

---

## Technical Specifications

### Network Configuration

| Spec | Value |
|------|-------|
| Network | Nasun Devnet |
| Chain ID | `272218f1` (2026-02-04 V7 리셋) |
| RPC Endpoint | https://rpc.devnet.nasun.io |
| Faucet | https://faucet.devnet.nasun.io |
| Base Technology | DeepBook V3 CLOB |

### Deployed Contracts (V6, 2026-01-27 리셋)

> 전체 컨트랙트 주소는 `packages/devnet-config/devnet-ids.json` 참조

**DeepBook V3**:
| 항목 | 값 |
|------|-----|
| Package | `0xaad9b8cfa778a3d4f2e28c6e07073d9627a85a2e7d6dfc33136f527450606253` |
| Registry | `0x2c386b2a2b8b5756ec316a309208d937b6907d97fbacfaa87fd514894aded384` |
| AdminCap | `0x413ace0602b7f0ec502d53c84aadd41763e1d79b35bfd382ef3ae9c0e7689262` |

**Unified Tokens (devnet_tokens)**:
| 항목 | 값 |
|------|-----|
| Package | `0x10748ed4f5063ca4a564fdfecc289954d14efa1a209e7292dcc18d65b2cb4017` |
| TokenFaucet | `0x04aa41442a9b812d29bb578aa82358d2b9e678240814368e32d82efa79669e14` |
| NBTC Type | `{Package}::nbtc::NBTC` |
| NUSDC Type | `{Package}::nusdc::NUSDC` |

**Prediction Market**:
| 항목 | 값 |
|------|-----|
| Package | `0xbc4bcead337817d14dcfeef48474866f6b5fb3f655bb7f2822539ae6982696dd` |
| GlobalState | `0xcbff8cda5d8bd9b81358b159b09ff57fb2b159d57ddeb46b9e714e7290825553` |
| AdminCap | `0x34881d8e68f9d90da2865877b782ea27f25195a25ed73655ced2188aa1d3938a` |

**Lottery**:
| 항목 | 값 |
|------|-----|
| Package | `0x3b54a4e29caf4de9582766af8a9f54327161a5ac21cb8cfc6e99fa458117be80` |
| LotteryRegistry | `0x0a64e225326746ff7c1ff7bb0b130cd0df922cc00101aedbfa442550e7995794` |
| AdminCap | `0x8329a17bed9e4b98aeb502b1ecca5ee9d73b7ca1dd8a60a85e09dfd7f61f0cec` |

**Governance**:
| 항목 | 값 |
|------|-----|
| Package | `0x02daf1f825b3eaae3b2f0718e7cbab884dc58d1b740c594f505004607b04e516` |
| Dashboard | `0x3398b1931bc8c418b0e0e1d9c1e04537bfc82c3f85d4dc22e11c97469baee7ae` |
| AdminCap | `0xd96d14baf4422909e6721c5533d981f0a481b947989c95502d3a45f89f607a04` |

**DevOracle, Unified Margin v1, Perpetuals DEX**:
> V6 재배포 대기. 재배포 후 `packages/devnet-config/devnet-ids.json` 업데이트 필요.
> `devnet-ids.json`의 `oracle`, `pools` 필드가 현재 비어있음.

---

## Tech Stack

| 항목 | 기술 | 버전 |
|------|------|------|
| 빌드 도구 | Vite | 7.3.0 |
| 프레임워크 | React | 19.2.0 |
| 언어 | TypeScript | ~5.9.3 |
| 스타일링 | Tailwind CSS | 3.4.19 |
| 상태 관리 | Zustand | 5.0.9 |
| 데이터 페칭 | @tanstack/react-query | 5.90.12 |
| Sui SDK | @mysten/sui | 1.45.2 |
| 차트 | lightweight-charts | 5.1.0 |
| QR 코드 | qrcode.react | 4.2.0 |
| 라우팅 | react-router-dom | 7.11.0 |
| 아이콘 | react-icons | 5.5.0 |
| Wallet | @nasun/wallet, @nasun/wallet-ui | workspace |
| Config | @nasun/devnet-config | workspace |

---

## Project Structure

```
apps/pado/
├── CLAUDE.md                        # 이 파일
├── .env.development                 # 개발 환경 변수 (V6)
├── .env.staging                     # 스테이징 환경 변수
├── .env.local                       # 로컬 오버라이드 (gitignored)
├── contracts/                       # pado_tokens: NBTC, NUSDC, Faucet
├── contracts-prediction/            # pado_prediction: Prediction Market
├── contracts-oracle/                # pado_oracle: DevOracle (가격 피드)
├── contracts-lending/               # pado_lending: Lending Pool (Phase 12)
├── contracts-lottery/               # pado_lottery: Weekly Lottery
├── contracts-margin/                # unified_margin: Margin + Risk Engine + Liquidation
├── contracts-perp/                  # pado_perp: Perpetuals + Funding + Liquidation
├── contracts-nsa/                   # nasun_smart_account: Multi-signer + Recovery
├── deepbookv3/                      # DeepBook V3 CLOB (Rust indexer + Move contracts)
├── bots/                            # 자동화 봇 (price-updater, liquidation-keeper)
├── scripts/                         # 유틸리티 스크립트 (create-perp-market)
├── docs/                            # 내부 문서
└── frontend/                        # React App
    └── src/
        ├── main.tsx                 # 엔트리: Provider 계층 설정
        ├── App.tsx                  # 레이아웃: Header + Routes
        ├── features/                # 기능 모듈 (아래 상세)
        ├── components/              # 공통 UI (Button, Input, Spinner, Toast, Header)
        ├── pages/                   # 페이지 컴포넌트
        ├── routes/                  # AppRoutes.tsx - 라우팅 설정
        ├── providers/               # ThemeProvider (다크/라이트 모드)
        ├── hooks/                   # 공통 hooks (useOraclePrice)
        ├── lib/                     # 핵심 라이브러리
        ├── config/                  # network.ts (네트워크/토큰/풀 설정)
        ├── utils/                   # envValidation.ts (환경변수 검증)
        └── assets/                  # 정적 리소스
```

---

## Frontend Routes

| 라우트 | 페이지 | 기능 |
|--------|--------|------|
| `/` | HomePage | 대시보드 (연결 시 포트폴리오, 미연결 시 온보딩) |
| `/markets/spot` | TradePage | Spot 거래 (Simple/Pro 모드, 오더북, 차트) |
| `/markets/perp` | PerpTradePage | 무기한 선물 거래 |
| `/wallet` | WalletPage | 송금/수신/거래내역/설정 + UnifiedBalanceCard |
| `/predict` | PredictPage | 예측 시장 목록 |
| `/predict/:marketId` | PredictMarketPage | 개별 시장 상세 (YES/NO 오더북) |
| `/lottery` | LotteryPage | 현재 라운드 + 티켓 구매 |
| `/lottery/:roundId` | LotteryRoundPage | 라운드 상세 + 내 티켓 |
| `/earn` | EarnPage | 스테이킹 + 렌딩 (UI 스텁) |
| `/admin` | AdminPage | 통합 관리자 (Prediction + Lottery 탭) |
| `/callback` | AuthCallbackPage | zkLogin OAuth 콜백 |

---

## Frontend Feature Modules

### trading/ - Spot DEX (DeepBook V3 CLOB)

오더북 기반 현물 거래. Simple/Pro 모드 지원.

**Components**: MarketSelector, PriceChart (MA/RSI/MACD), Orderbook, OrderForm, SimpleOrderForm, MarketInfoBar, BalanceManagerCard, OpenOrders, TradeHistory, TradingBalanceBar, PoolInfo, PriceSuggestions, SlippageSettings, QuickAmountButtons, InsufficientBalancePrompt, OrderConfirmModal, BottomTabPanel

**Containers**: TradingPanel, MarketPanel, BalancePanel

**Context**: MarketContext (현재 풀 선택), OrderFormContext (주문 상태, 원클릭 트레이딩)

**Hooks**: useTradeMode, useOrderbook, useOpenOrders, useOrderActions, useFaucet, useAutoDeposit, useBalanceManagerBalance, useTradeEvents

### perp/ - Perpetual Futures (Phase 11)

레버리지 최대 20x, 8시간 펀딩률, 청산 엔진.

**Components**: PerpOrderForm, PerpPositionList, LeverageSlider (1-20x), LiquidationWarning, PerpMarketInfo

**Hooks**: usePerpOrder, usePerpPositions, usePerpMarket, useOraclePrice

**Context**: PerpMarketContext

**Lib**: perp-client.ts (온체인 컨트랙트 인터랙션)

### prediction/ - Prediction Markets

바이너리 YES/NO 예측 시장. NUSDC 담보, 오더북 기반.

**Components**: MarketCard, MarketHeader, OutcomeOrderForm, OutcomeOrderbook, PositionList, CreateMarketForm, AdminResolveModal, PredictionAdminPanel

**Hooks**: useMarkets, useMarket, useMarketOrderbook, usePredictionTrade, usePredictionPositions, usePredictionAdmin

**Lib**: prediction-market.ts (확률 계산)

### lottery/ - Weekly Lottery

5개 숫자 선택 (1-32), Sui Random 기반 추첨, 멀티티어 상금.

- 티켓 가격: 1 NUSDC
- 주소당 최대 100장
- 상금: Jackpot 60% (5매치), 2nd 25% (4매치), 3rd 15% (3매치)
- 풀 분배: 70% 당첨자, 20% 이월, 10% 재무

**Components**: TicketPurchaseForm, LotteryRoundCard, MyTicketList, WinningNumbers, LotteryCountdown, LotteryAdminPanel

**Hooks**: useLotteries, useLotteryRound, useMyTickets, useLotteryActions, useLotteryAdmin, useLotteryKeeper

**Lib**: lottery-client.ts (번호 매칭, 상금 계산)

### portfolio/ - Asset Overview & History

순자산 대시보드, 거래/전송 내역.

**Components**: AssetOverview, TokenBalanceList, ActivityTabs, RecentTrades, TransferHistory, TradeStats

**Hooks**: useTotalValue, useTradeHistory, useTransferHistory

### dashboard/ - Homepage Components

온보딩 및 퀵 액세스 위젯.

**Components**: WelcomeBanner, QuickActions, HotMarketsCard, PredictionHighlight, NetWorthCard

### earn/ - Staking & Lending (Phase 12-13, UI 스텁)

이자 수익 활동. 컨트랙트는 구현됨, UI는 스텁 상태.

**Components**: StakingSection, LendingSection, DepositForm, PoolStats, PositionList

**Hooks**: useLendingPool, useLendingPositions, useLendingActions

**Lib**: lending-client.ts

### core/ - Foundation Modules

Unified Margin, Smart Account, Oracle 통합 데이터 레이어.

**unified-margin/**: useMarginAccount, useUnifiedMargin, useSmartAccount, useRiskEngine, UnifiedBalanceCard, SmartAccountPanel, MarginAccountCard

**usePrices.ts**: 모든 토큰의 통합 가격 소스 (Oracle + simulated fallback)

### payments/ - Fast Transfer

QR 코드 기반 결제 수신.

**Components**: PaymentQRCode

### admin/ - Admin Dashboard

Prediction + Lottery 관리 통합 패널. AdminCap 기반 접근 제어.

**Hooks**: useAdminAccess (isPredictionAdmin, isLotteryAdmin)

---

## Frontend Libraries (lib/)

| 파일 | 설명 |
|------|------|
| `sui-client.ts` | SuiClient 싱글턴, faucet 요청, 잔액 조회, 포맷팅 |
| `deepbook.ts` | Level 2 오더북 조회, 주문 타입 변환 |
| `oracle-client.ts` | DevOracle 온체인 가격 조회 (BTC/USD, ETH/USD, NAS/USD) |
| `event-service.ts` | 이벤트 구독 (WebSocket → Polling → Simulation 자동 폴백) |
| `prices.ts` | 통합 가격 소스 (10초 캐시 TTL, oracle + simulated fallback) |
| `risk-engine.ts` | 마진 검증 (10% 버퍼), 부족분 계산 |
| `unified-margin.ts` | MarginAccount 저장/조회, 멀티 담보 추적 |
| `indicators/` | 기술적 지표: SMA, EMA, RSI, MACD, 모의 데이터 생성 |

---

## Smart Contracts

### contracts/ (pado_tokens)

NBTC, NUSDC 테스트 토큰 + Faucet.

| 모듈 | 설명 |
|------|------|
| `nbtc.move` | NBTC 토큰 (8 decimals, 21M max supply) |
| `nusdc.move` | NUSDC 스테이블코인 (6 decimals) |
| `faucet.move` | 토큰 Faucet (NBTC: 1/claim, NUSDC: 100K/claim, 24h 쿨다운) |

### contracts-prediction/ (pado_prediction)

바이너리 YES/NO 예측 시장.

| 모듈 | 설명 |
|------|------|
| `prediction_market.move` | NUSDC 담보 오더북, 관리자 기반 시장 해결, 가격 basis points (0-10000) |

### contracts-oracle/ (pado_oracle)

Admin 제어 가격 피드 (Devnet 전용, 메인넷에서 Pyth/Switchboard 교체 예정).

| 모듈 | 설명 |
|------|------|
| `dev_oracle.move` | 3개 심볼 (BTC=1, ETH=2, NASUN=3), 8 decimals, staleness 검증 |

### contracts-lottery/ (pado_lottery)

주간 로또 시스템.

| 모듈 | 설명 |
|------|------|
| `lottery.move` | 5개 숫자 (1-32), Sui Random 추첨, 3-tier 상금, 라운드 상태 머신 (OPEN→CLOSED→DRAWN→SETTLED) |

### contracts-margin/ (unified_margin)

통합 마진 시스템.

| 모듈 | 버전 | 설명 |
|------|------|------|
| `unified_margin.move` | v0.6 | 멀티 담보 마진 계정 (NUSDC 0% + NBTC 10% haircut), Owned MarginAccount |
| `risk_engine.move` | v1.0 | 4-tier 위험 관리 (IM 10%, Warning 8%, MM 5%, FC 3%) |
| `account_positions.move` | v0.1 | 포지션 레지스트리 (Spot 최대 50, Prediction NFT 최대 100) |
| `liquidation.move` | v1.0 | 부분 청산 (최대 50%), 5% 보너스, 최소 1 NUSDC |

### contracts-perp/ (pado_perp)

무기한 선물 거래.

| 모듈 | 버전 | 설명 |
|------|------|------|
| `perpetual.move` | v1.0 | 20x 레버리지, IM 5%, MM 2.5%, maker 2bps / taker 5bps |
| `funding.move` | v1.0 | 8시간 펀딩률 (최대 1.25%/8h), Oracle staleness 2분 |
| `liquidation.move` | v1.0 | 포지션 청산, 5% 보너스, 잔액→보험기금 |

### contracts-lending/ (pado_lending)

대출 프로토콜 (Phase 12).

| 모듈 | 설명 |
|------|------|
| `lending_pool.move` | NUSDC 풀, 금리 모델 (base 2%, multiplier 20%, kink 80%), reserve factor 10% |

### contracts-nsa/ (nasun_smart_account)

Nasun Smart Account (Multi-signer + Social Recovery).

| 모듈 | 설명 |
|------|------|
| `smart_account.move` | 멀티 시그너 (최대 5명, 가중치 기반), Guardian 기반 계정 복구, Nonce 보호, 동적 자산 저장 |
| `recovery.move` | 소셜 리커버리: 48시간 타임락, 사전 승인된 recovery_owner만 가능 |

> 참고: V7 리셋 후 재배포 필요.

### deepbookv3/

DeepBook V3 CLOB 엔진 (Rust + Move).

```
deepbookv3/
├── crates/
│   ├── indexer/          # 온체인 이벤트 인덱서
│   ├── schema/           # DB 스키마
│   └── server/           # REST API 서버
├── packages/
│   ├── deepbook/         # 코어 CLOB 엔진
│   ├── deepbook_margin/  # 마진 트레이딩
│   ├── token/            # 토큰 유틸
│   └── margin_liquidation/ # 청산 로직
└── scripts/              # TX 유틸, 설정, 트랜잭션 템플릿
```

---

## Bots (자동화)

| 봇 | 스크립트 | 설명 |
|----|----------|------|
| Price Updater | `bots/price-updater.ts` | CoinGecko/Binance에서 BTC/ETH/NASUN 가격 폴링 → DevOracle 업데이트 (30초 간격) |
| Liquidation Keeper | `bots/liquidation-keeper.ts` | 무기한 선물 포지션 모니터링 → MM(2.5%) 이하 시 청산 트리거 (10초 간격) |

```bash
# 실행
cd apps/pado
pnpm --filter @nasun/pado run price-updater          # 지속 실행
pnpm --filter @nasun/pado run price-updater:once      # 1회 실행
pnpm --filter @nasun/pado run liquidation-keeper       # 지속 실행
pnpm --filter @nasun/pado run liquidation-keeper:once  # 1회 실행
```

---

## Scripts

| 스크립트 | 설명 |
|----------|------|
| `scripts/create-perp-market.ts` | BTC-PERP 무기한 선물 시장 생성 (PTB 패턴, Sui CLI 연동) |

---

## Environment Variables

### 필수 (Network)

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `VITE_RPC_URL` | `https://rpc.devnet.nasun.io` | RPC 엔드포인트 |
| `VITE_FAUCET_URL` | `https://faucet.devnet.nasun.io` | Faucet URL |
| `VITE_CHAIN_ID` | `272218f1` | 체인 ID |

### 필수 (DeepBook V3)

| 변수 | 설명 |
|------|------|
| `VITE_DEEPBOOK_PACKAGE` | DeepBook V3 패키지 주소 |
| `VITE_DEEPBOOK_REGISTRY` | DeepBook 레지스트리 |
| `VITE_DEEPBOOK_ADMIN_CAP` | DeepBook AdminCap |
| `VITE_DEEP_TOKEN` | DEEP 토큰 패키지 |

### 필수 (Tokens)

| 변수 | 설명 |
|------|------|
| `VITE_TOKENS_PACKAGE` | 토큰 패키지 (NBTC, NUSDC) |
| `VITE_NBTC_TYPE` | NBTC 타입 (`{pkg}::nbtc::NBTC`) |
| `VITE_NUSDC_TYPE` | NUSDC 타입 (`{pkg}::nusdc::NUSDC`) |
| `VITE_FAUCET_PACKAGE` | Faucet 패키지 |
| `VITE_TOKEN_FAUCET` | TokenFaucet 오브젝트 |
| `VITE_CLAIM_RECORD` | ClaimRecord 오브젝트 |

### 선택 (Pools)

| 변수 | 설명 |
|------|------|
| `VITE_POOL_NBTC_NUSDC` | NBTC/NUSDC 풀 (TODO: 생성 후 설정) |
| `VITE_POOL_NASUN_NUSDC` | NASUN/NUSDC 풀 (TODO: 생성 후 설정) |

### 선택 (Prediction Market)

| 변수 | 설명 |
|------|------|
| `VITE_PREDICTION_PACKAGE` | Prediction 패키지 |
| `VITE_PREDICTION_GLOBAL_STATE` | GlobalState 오브젝트 |
| `VITE_PREDICTION_ADMIN_CAP` | AdminCap |
| `VITE_PREDICTION_RESOLVER_ADDRESS` | Resolver 주소 |

### 선택 (Oracle)

| 변수 | 설명 |
|------|------|
| `VITE_ORACLE_PACKAGE_ID` | DevOracle 패키지 (V6 재배포 대기) |
| `VITE_ORACLE_REGISTRY_ID` | OracleRegistry |
| `VITE_ORACLE_ADMIN_CAP_ID` | Oracle AdminCap |

### 선택 (zkLogin)

| 변수 | 설명 |
|------|------|
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth Client ID |
| `VITE_ZKLOGIN_SALT_API_URL` | Salt API (AWS Lambda) |
| `VITE_ZKLOGIN_PROVER_URL` | ZK Prover (기본: Mysten Labs) |

---

## Development Commands

```bash
# 모노레포 루트에서
pnpm dev:pado          # 개발 서버 (포트 5176)
pnpm build:pado        # 프로덕션 빌드

# Move 컨트랙트 빌드/배포
cd apps/pado/contracts-margin
nasun move build
nasun client publish --gas-budget 100000000

# 봇 실행
cd apps/pado
pnpm --filter @nasun/pado run price-updater
pnpm --filter @nasun/pado run liquidation-keeper
```

---

## Internal Documentation

| 파일 | 설명 |
|------|------|
| [docs/LOTTERY.md](docs/LOTTERY.md) | Lottery 시스템 설계 및 메커니즘 |
| [docs/PADO_IMPLEMENTATION_PLAN.md](docs/PADO_IMPLEMENTATION_PLAN.md) | 전략적 구현 로드맵 |
| [docs/PADO_NEXT_STEPS.md](docs/PADO_NEXT_STEPS.md) | 다음 기능 우선순위 |
| [docs/PADO_UI_ROADMAP.md](docs/PADO_UI_ROADMAP.md) | 프론트엔드 기능 로드맵 |
| [docs/TRADE-UI-BENCHMARK-IMPROVEMENT-PLAN.md](docs/TRADE-UI-BENCHMARK-IMPROVEMENT-PLAN.md) | 트레이딩 UI 성능 최적화 |

---

## Architecture Patterns

**상태 관리**:
- React Context: 글로벌 상태 (Theme, Market, OrderForm, PerpMarket)
- Zustand: 지갑 상태 (`@nasun/wallet`)
- TanStack Query: 서버 상태 캐싱

**데이터 페칭**:
- EventService: WebSocket → Polling → Simulation 자동 폴백
- `devInspectTransactionBlock`: 읽기 전용 온체인 쿼리
- Dynamic field object: 온체인 상태 조회

**스마트컨트랙트 디자인 패턴**:
- **Owned Objects**: 사용자별 상태 (MarginAccount, AccountPositions, SmartAccount)
- **Shared Objects**: 프로토콜 상태 (MarginRegistry, OracleRegistry, Markets)
- **Capability Pattern**: AdminCap으로 권한 제어
- **Permissionless**: 청산/라운드 종료는 누구나 호출 가능

**UI 패턴**:
- Simple/Pro 모드 (TradePage): 모바일 친화 2컬럼 vs 프로 3컬럼
- Toast 알림 + Error Boundary
- 원클릭 트레이딩 (확인 모달 스킵)
- Tailwind CSS 커스텀 테마 변수 (theme-bg-primary, theme-text-primary 등)

---

## Known Issues & Pending Work

1. **환경 변수 불일치**: `.env.development`의 일부 주소가 `devnet-ids.json`과 다름 (tokens, prediction 패키지)
2. **V7 리셋 후 전체 재배포 필요**: 모든 컨트랙트가 V7 체인에 재배포되어야 함
3. **Staging Chain ID 차이**: staging은 별도 체인, development은 `272218f1` 사용
