# CLAUDE.md (apps/pado)

> Last Updated: 2026-02-14
> 공통 규칙(언어 설정, UI 언어 규칙)은 루트 [CLAUDE.md](../../CLAUDE.md) 참조

---

## Vision: Unified Onchain Finance

**Pado**는 Nasun Network 위에서 동작하는 **자기수탁형(self-custodial) 통합 금융 애플리케이션**입니다.

> *"Unified, self-custodial spot, derivatives, lending, staking, prediction markets, and payments through a single smart account on the Nasun Network."*

### 핵심 철학

| 원칙 | 설명 |
|------|------|
| **Single Smart Account** | 모든 금융 활동(거래, 대출, 스테이킹, 결제)을 하나의 계정으로 통합 관리 |
| **Unified Margin System** | 포트폴리오 레벨의 통합 마진 - 자산이 모든 상품에 걸쳐 담보로 기능 |
| **Self-Custodial Control** | 사용자가 자산에 대한 완전한 통제권 유지, 개인키 노출 없음 |
| **Object-Based Architecture** | Nasun의 객체 기반 상태 모델로 복잡한 금융 상호작용을 온체인에서 네이티브하게 모델링 |
| **CEX-Grade UX, DEX-Level Transparency** | 중앙화 거래소 수준의 사용자 경험 + 온체인 검증 가능성 |

---

## Product Roadmap

### 완료된 단계

| Phase | 상태 | 제품 | 설명 |
|-------|------|------|------|
| Phase 0 | ✅ 완료 | Infrastructure | Nasun Devnet V7 (Sui mainnet fork, 2026-02-04 리셋) |
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
| Phase 18 | ✅ 완료 | Prototype Polish | 트레이딩 UX 개선, 키보드 단축키, 수수료 프리뷰, 온보딩 투어 |
| Phase 19 | ✅ 완료 | Social Layer | Global Chat, Leaderboard, Trader Profiles, Competitions, PnL Share, Badges, Market Narrator |
| Phase 20 | ✅ 완료 | LP Bot | Grid Market Making, Arbitrage, Auto-faucet Refill |
| Phase 21 | ✅ 완료 | V7 Contract Redeployment | 모든 컨트랙트 V7 재배포 (2026-02-04) |

### 진행 중 및 예정

| Phase | 상태 | 제품 | 설명 |
|-------|------|------|------|
| Phase 10 | 📋 계획 | Cross-Chain Vaults | BTC, ETH 등 외부 자산 Vault 통합 |
| Phase 12 | 🟡 부분 | Lending & Borrowing | 컨트랙트 V7 배포 완료, UI 스텁 존재, 풀 연동 필요 |
| Phase 13 | 📋 계획 | Staking | NAS 토큰 스테이킹 (UI 스텁만 존재) |

---

## Feature Completeness (2026-02-14)

| Feature | 상태 | 완성도 | 비고 |
|---------|------|--------|------|
| Spot DEX | ✅ | 100% | 4개 풀, CLOB 오더북, Simple/Pro 모드 |
| Perpetuals | ✅ | 100% | 20x 레버리지, 펀딩률, 청산 |
| Prediction Markets | ✅ | 100% | YES/NO 바이너리, 오더북, 관리자 해결 |
| Lottery | ✅ | 100% | 주간 추첨, 3-tier 상금, Sui Random |
| Portfolio | ✅ | 100% | P&L 차트, 리스크 메트릭, CSV 내보내기 |
| Leaderboard | ✅ | 100% | 볼륨/PnL 순위, 트레이더 프로필 |
| Social/Chat | ✅ | 100% | 실시간 채팅, PnL 공유, Market Narrator |
| Competitions | ✅ | 100% | 시간제한 대회, 전용 리더보드 |
| Admin Panel | ✅ | 100% | Prediction + Lottery 통합 관리 |
| Payments | ✅ | 100% | QR 코드 전송 |
| Theme | ✅ | 100% | 다크/라이트 토글 |
| Responsive | ✅ | 100% | 모바일 우선 설계 |
| PWA | ✅ | 100% | 오프라인 지원, 설치 가능 (vite-plugin-pwa) |
| zkLogin | ✅ | 100% | Google OAuth 시드리스 온보딩 |
| Lending | 🟡 | 40% | 컨트랙트 V7 배포, UI 스텁 존재 |
| Staking | 🟡 | 10% | UI 스텁만 존재 |

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
│  ├── Lending/Borrowing [Partial - contracts deployed]       │
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
│  ├── NBTC: 95% 담보 인정 (Haircut 5%, admin 변경 가능)     │
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

### Trading Pairs (4 Pools)

| Pool | Base | Quote | Tick Size | Lot Size | Maker Fee | Taker Fee |
|------|------|-------|-----------|----------|-----------|-----------|
| NBTC/NUSDC | NBTC (8d) | NUSDC (6d) | 100,000 ($0.10) | 1,000 (0.00001 BTC) | 5 bps | 10 bps |
| NASUN/NUSDC | NASUN (9d) | NUSDC (6d) | 10,000 ($0.01) | 1e9 (1.0 NASUN) | 5 bps | 10 bps |
| NETH/NUSDC | NETH (8d) | NUSDC (6d) | 100,000 ($0.10) | 1,000 (0.00001 ETH) | 5 bps | 10 bps |
| NSOL/NUSDC | NSOL (9d) | NUSDC (6d) | 10,000 ($0.01) | 1e9 (1.0 SOL) | 5 bps | 10 bps |

### Deployed Contracts (V7, 2026-02-04 리셋)

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
| Package | `0xd0e01761b2f822df9cd412af99d75d35c477d805b1636981acd15c4a5c0ab772` |
| TokenFaucet | `0x04aa41442a9b812d29bb578aa82358d2b9e678240814368e32d82efa79669e14` |
| NBTC Type | `{Package}::nbtc::NBTC` |
| NUSDC Type | `{Package}::nusdc::NUSDC` |

**Prediction Market**:
| 항목 | 값 |
|------|-----|
| Package | `0x98765cc3765324148db9815da8bce85e6ca895e94eed910b6cc9bec55cc22895` |

**Lottery**:
| 항목 | 값 |
|------|-----|
| Package | `0xd56f405af7127a15e30a5104ec91574a7483699e5ac1d74383ed5478aee43900` |

**DevOracle (pado_oracle)**:
| 항목 | 값 |
|------|-----|
| Package | `0x8a0acb40e5546a01e276a367e583df32b134306ebce6118cc01d9e164edf4c1c` |

**Unified Margin (unified_margin)**:
| 항목 | 값 |
|------|-----|
| Package | `0x5bdbf3aaa5999674bea412f2dd7dce417a188343f7213cb7105d9c1eaacce31d` |

**Perpetuals DEX (pado_perp)**:
| 항목 | 값 |
|------|-----|
| Package | `0x6821a73cfc3cd45dc6318db379c2c88f0acb61ec6a26060f4de8cbe4718d3658` |

**Lending (pado_lending)**:
| 항목 | 값 |
|------|-----|
| Package | `0xdd1e36881a1d47ad4f0f331b6a949948f308ded71c1d46802f23e258ca1ebafe` |

**Nasun Smart Account (nasun_smart_account)**:
| 항목 | 값 |
|------|-----|
| Package | `0x097e96d5e0c09915b6ba2ed744fe2d4ee0bd21df1d453e6528d4d82c96c1c44b` |

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
| 아바타 | boring-avatars | 2.0.4 |
| 니모닉 | @scure/bip39 | 2.0.1 |
| PWA | vite-plugin-pwa | 1.2.0 |
| 테스트 | vitest | 4.0.18 |
| Wallet | @nasun/wallet, @nasun/wallet-ui | workspace |
| Config | @nasun/devnet-config | workspace |

---

## Project Structure

```
apps/pado/
├── CLAUDE.md                        # 이 파일
├── .env.development                 # 개발 환경 변수 (V7)
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
├── bots/                            # 자동화 봇 (LP Bot, Price Updater, Liquidation Keeper, TP/SL Keeper)
├── chat-server/                     # WebSocket + HTTP 서버 (Chat, Leaderboard, Competitions, Market Narrator)
├── scripts/                         # 유틸리티 스크립트 (create-perp-market)
├── docs/                            # 내부 문서
└── frontend/                        # React App
    └── src/
        ├── main.tsx                 # 엔트리: Provider 계층 설정
        ├── App.tsx                  # 레이아웃: Header + Routes
        ├── features/                # 기능 모듈 (아래 상세)
        ├── components/              # 공통 UI (Button, Input, Spinner, Toast, Skeleton, Header)
        ├── pages/                   # 페이지 컴포넌트 (16개)
        ├── routes/                  # AppRoutes.tsx - Lazy loading + Suspense
        ├── providers/               # ThemeProvider (다크/라이트 모드)
        ├── hooks/                   # 공통 hooks (useAdaptiveInterval, useSubmitGuard, useTransactionSync)
        ├── lib/                     # 핵심 라이브러리 (아래 상세)
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
| `/portfolio` | PortfolioPage | 자산 개요, P&L 차트, 거래/전송 내역, 리스크 메트릭 |
| `/admin` | AdminPage | 통합 관리자 (Prediction + Lottery 탭) |
| `/leaderboard` | LeaderboardPage | 트레이딩 볼륨/PnL 순위 |
| `/leaderboard/trader/:address` | TraderProfilePage | 트레이더 상세 (통계, 체결 이력, 뱃지) |
| `/competitions` | CompetitionsPage | 트레이딩 대회 목록 |
| `/competitions/:id` | CompetitionDetailPage | 대회 상세 + 리더보드 |
| `/callback` | AuthCallbackPage | zkLogin OAuth 콜백 |

**Navigation Structure (Menu v3)**:
- Desktop: Trade (Spot, Perp) | Predict | Lottery | Earn | Social (Leaderboard, Competitions) | Portfolio
- Mobile: Home | Trade | Predict | Social | More (Lottery, Earn, Perp, Portfolio, Wallet)

---

## Frontend Feature Modules

### trading/ - Spot DEX (DeepBook V3 CLOB)

오더북 기반 현물 거래. 4개 풀 지원 (NBTC, NETH, NSOL, NASUN / NUSDC). Simple/Pro 모드.

**Components**: MarketSelector, PriceChart (SMA/EMA/RSI/MACD/BB/ATR), Orderbook, OrderForm, SimpleOrderForm, SwapOrderForm, ScaleOrderForm, MarketInfoBar, BalanceManagerCard, OpenOrders, TradeHistory, TradingBalanceBar, PoolInfo, PriceSuggestions, SlippageSettings, QuickAmountButtons, TPSLInputs, InsufficientBalancePrompt, OrderConfirmModal, BottomTabPanel, DrawingToolbar (Trend/Fibonacci/Horizontal lines), NotificationSettings, KeyboardShortcutsPanel, OnboardingTour, MobileTradeLayoutV2, FavoriteStrip, DepthChart

**Containers**: TradingPanel, MarketPanel, BalancePanel

**Context**: MarketContext (현재 풀 선택), OrderFormContext (주문 상태, 원클릭 트레이딩)

**Hooks**: useTradeMode, useOrderbook, useOpenOrders, useOrderActions, useFaucet, useAutoDeposit, useBalanceManagerBalance, useTradeEvents, useMyTrades, useFavoriteMarkets, useOrderFillNotifier, usePriceAlertMonitor, useTPSLMonitor, useKeyboardShortcuts, useOnboardingTour, useTransactionExecutor, useTradeCap, useOrderHistory

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

**Components**: TicketPurchaseForm, LotteryRoundCard, MyTicketList, WinningNumbers, LotteryCountdown, LotteryAdminPanel (CreateRoundForm, RoundCard, StatusBadge)

**Hooks**: useLotteries, useLotteryRound, useMyTickets, useLotteryActions, useLotteryAdmin, useLotteryKeeper

**Lib**: lottery-client.ts (번호 매칭, 상금 계산)

### portfolio/ - Asset Overview & History

순자산 대시보드, P&L 시계열, 리스크 메트릭, CSV 내보내기.

**Components**: AssetOverview, TokenBalanceList, PnlChart (실현/미실현 P&L 분리), AllocationDonut (토큰 배분 파이), ActivityTabs, RecentTrades, TransferHistory, TradeStats (Sharpe Ratio, Profit Factor, Max Drawdown, Sortino Ratio, Win Rate)

**Hooks**: useTotalValue, useTradeHistory, useTransferHistory, usePnlTimeSeries, useCostBasis

### dashboard/ - Homepage Components

온보딩 및 퀵 액세스 위젯.

**Components**: WelcomeBanner, QuickActions, HotMarketsCard, PredictionHighlight, NetWorthCard

### earn/ - Staking & Lending (Phase 12-13, UI 스텁)

이자 수익 활동. Lending 컨트랙트는 V7 배포 완료, UI는 스텁 상태.

**Components**: StakingSection, LendingSection, DepositForm, PoolStats, PositionList

**Hooks**: useLendingPool, useLendingPositions, useLendingActions

**Lib**: lending-client.ts

### core/ - Foundation Modules

Unified Margin, Smart Account, Oracle 통합 데이터 레이어.

**unified-margin/**: useMarginAccount, useUnifiedMargin, useUnifiedBalance, useSmartAccount, useRiskEngine, UnifiedBalanceCard, SmartAccountPanel, MarginAccountCard

**usePrices.ts**: 모든 토큰의 통합 가격 소스 (Oracle + Binance fallback, 10초 캐시 TTL)

### payments/ - Fast Transfer

QR 코드 기반 결제 수신.

**Components**: PaymentQRCode

### social/ - Global Chat + Share (Phase 19)

실시간 채팅 (WebSocket), 닉네임 설정, PnL 공유, 트레이딩 페이지 연동.

**Components**: ChatPanel, ChatMessage (일반/시스템/BOT/거래공유 스타일링), ChatInput, ChatToggleButton, FloatingChatPopup, MobileChatDrawer, SetNicknameModal, ShareCardModal (Canvas 기반 이미지 생성), ShareTradeButton, SharePnlButton, SharePortfolioButton

**Hooks**: useChat, useChatPanel, useFloatingPanel, useChatTextSize

### badges/ - Achievement System

트레이딩 성과 기반 뱃지 시스템.

**Components**: BadgeDisplay (그리드), BadgeNotification

### leaderboard/ - Trading Volume Rankings (Phase 19)

DeepBook OrderFilled 이벤트 기반 트레이딩 볼륨/PnL 순위.

**Components**: LeaderboardTable, TraderRow, RankBadge, PeriodSelector, MyRankCard, TraderProfileHeader, TraderFillsTable, BadgeDisplay

**Hooks**: useLeaderboard, useTraderStats, useTraderFills, useFollowedTraders, useTraderClassification

### competitions/ - Trading Competitions (Phase 19)

시간 제한 트레이딩 대회, 전용 리더보드.

**Components**: CompetitionCard, CompetitionBanner, CompetitionLeaderboard, CompetitionCountdown

**Hooks**: useCompetitions, useCompetition

### news/ - News Carousel

뉴스 카드 슬라이더.

**Components**: NewsCarousel, NewsCard

**Hooks**: useNewsFeed

### admin/ - Admin Dashboard

Prediction + Lottery 관리 통합 패널. AdminCap 기반 접근 제어.

**Hooks**: useAdminAccess (isPredictionAdmin, isLotteryAdmin)

---

## Frontend Libraries (lib/)

| 파일 | 설명 |
|------|------|
| `sui-client.ts` | SuiClient 싱글턴, faucet 요청, 잔액 조회, 포맷팅 |
| `deepbook.ts` | Level 2 오더북 조회, 주문 타입 변환, maker/taker 수수료 로직 |
| `oracle-client.ts` | DevOracle 온체인 가격 조회 (BTC/USD, ETH/USD, NAS/USD) |
| `event-service.ts` | 이벤트 구독 (WebSocket → Polling → Simulation 자동 폴백) |
| `prices.ts` | 통합 가격 소스 (10초 캐시 TTL, Oracle + Binance fallback) |
| `risk-engine.ts` | 마진 검증 (10% 버퍼), 부족분 계산 |
| `unified-margin.ts` | MarginAccount 저장/조회, 멀티 담보 추적 |
| `chat-service.ts` | WebSocket 채팅 클라이언트 (연결, 메시지 전송, 닉네임) |
| `csv-export.ts` | 거래 내역 CSV 내보내기 |
| `notification-preferences.ts` | 알림 설정 (소리/브라우저) localStorage 저장 |
| `browser-notify.ts` | Browser Notification API 래퍼 |
| `sounds.ts` | 거래 성공/체결 효과음 |
| `constants.ts` | 전역 상수 |
| `logger.ts` | 로깅 유틸리티 |
| `tx-helpers.ts` | 트랜잭션 헬퍼 유틸리티 |
| `indicators/` | 기술적 지표: SMA, EMA, RSI, MACD, BB (Bollinger Bands), ATR, Stochastic |
| `tradingview/` | TradingView Lightweight Charts 래퍼 + Datafeed 어댑터 |

---

## Smart Contracts

### contracts/ (pado_tokens)

NBTC, NUSDC 테스트 토큰 + Faucet.

| 모듈 | 설명 |
|------|------|
| `nbtc.move` | NBTC 토큰 (8 decimals, 21M max supply) |
| `nusdc.move` | NUSDC 스테이블코인 (6 decimals, 무제한 발행) |
| `faucet.move` | 토큰 Faucet (NBTC: 1/claim, NUSDC: 100K/claim, 24h 쿨다운) |

### contracts-prediction/ (pado_prediction)

바이너리 YES/NO 예측 시장.

| 모듈 | 설명 |
|------|------|
| `prediction_market.move` | NUSDC 담보 오더북, 관리자 기반 시장 해결, 가격 basis points (0-10000), CTF-like 토큰 모델 (mint/trade/resolve/redeem) |

### contracts-oracle/ (pado_oracle)

Admin 제어 가격 피드 (Devnet 전용, 메인넷에서 Pyth/Switchboard 교체 예정).

| 모듈 | 설명 |
|------|------|
| `dev_oracle.move` | 3개 심볼 (BTC=1, ETH=2, NASUN=3), 8 decimals, staleness 검증, batch_update 지원 |

### contracts-lottery/ (pado_lottery)

주간 로또 시스템.

| 모듈 | 설명 |
|------|------|
| `lottery.move` | 5개 숫자 (1-32), Sui Random 추첨, 3-tier 상금, 라운드 상태 머신 (OPEN→CLOSED→DRAWN→SETTLED) |

### contracts-margin/ (unified_margin)

통합 마진 시스템.

| 모듈 | 버전 | 설명 |
|------|------|------|
| `unified_margin.move` | v0.6 | 멀티 담보 마진 계정 (NUSDC 0% + NBTC 5% haircut, admin 변경 가능), Owned MarginAccount |
| `risk_engine.move` | v1.0 | 4-tier 위험 관리 (IM 10%, Warning 8%, MM 5%, FC 3%), Oracle 가격 기반 |
| `account_positions.move` | v0.1 | 포지션 레지스트리 (Spot 최대 50, Prediction NFT 최대 100), Owned object |
| `liquidation.move` | v1.0 | 부분 청산 (최대 50%), 5% 보너스, 최소 1 NUSDC, Permissionless |

### contracts-perp/ (pado_perp)

무기한 선물 거래.

| 모듈 | 버전 | 설명 |
|------|------|------|
| `perpetual.move` | v1.1 | 20x 레버리지, IM 5%, MM 2.5%, maker 2bps / taker 5bps, max OI 캡, 보험기금 |
| `funding.move` | v1.0 | 8시간 펀딩률 (최대 1.25%/8h), Oracle staleness 2분, EWMA 기반 |
| `liquidation.move` | v1.1 | 포지션 청산, 5% 보너스, Oracle 가격 검증 (조작 방지), 잔액→보험기금 |

### contracts-lending/ (pado_lending)

대출 프로토콜 (Phase 12).

| 모듈 | 설명 |
|------|------|
| `lending_pool.move` | NUSDC 풀, 금리 모델 (base 2%, multiplier 20%, jump 100%, kink 80%), reserve factor 10%, 인덱스 기반 이자 계산 |

### contracts-nsa/ (nasun_smart_account)

Nasun Smart Account (Multi-signer + Social Recovery).

| 모듈 | 설명 |
|------|------|
| `smart_account.move` | 멀티 시그너 (최대 5명, 가중치 기반), 2-phase 시그너 추가, Guardian 기반 계정 복구, Nonce 보호, 동적 자산 저장 (Bag) |
| `recovery.move` | 소셜 리커버리: 48시간 타임락, 사전 승인된 recovery_owner만 가능, 멀티 Guardian 승인 |

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
| LP Bot | `bots/lp-bot.ts` | Grid market making (Binance 가격 기준), 30 bid + 30 ask (설정 가능), 멀티마켓 (NBTC/NETH/NSOL), inventory skew, arbitrage, auto-recovery circuit breaker, auto faucet refill (10초 간격) |
| Price Updater | `bots/price-updater.ts` | Binance/CoinGecko에서 BTC/ETH/NASUN 가격 폴링 → DevOracle batch_update (30초 간격) |
| Liquidation Keeper | `bots/liquidation-keeper.ts` | 무기한 선물 포지션 모니터링 → MM(2.5%) 이하 시 청산 트리거, 5% 보너스 수집 (10초 간격) |
| TP/SL Keeper | `bots/tpsl-keeper.ts` | Take-profit/Stop-loss 주문 모니터링 → 가격 도달 시 포지션 자동 청산 (HTTP + WS, 포트 4001) |

**지원 라이브러리** (`bots/lib/`):
- `config.ts` - 멀티마켓 풀/주문/스프레드 설정 (NBTC, NETH, NSOL), 컨트랙트 주소
- `balance-manager.ts` - 가스, Base/Quote 토큰 잔액 추적
- `order-manager.ts` - 주문 생성/취소 (atomic)
- `strategy.ts` - 호가 계산 (inventory skew 포함)
- `faucet.ts` - 자동 faucet 리필 (V1 + V2)
- `tpsl-store.ts` - TP/SL 상태 저장
- `tpsl-executor.ts` - TP/SL 실행 로직

### 로컬 실행

```bash
cd apps/pado/bots
LP_MARKET=NBTC pnpm lp-bot                            # NBTC 마켓 지속 실행
pnpm lp-bot:once                                      # 1회 실행
pnpm lp-bot:all                                       # 3개 마켓 동시 실행
pnpm price-updater                                    # Oracle 가격 업데이트
pnpm liquidation-keeper                               # 청산 모니터링
```

### 프로덕션 배포 (PM2)

5개 프로세스가 PM2 `ecosystem.config.cjs`로 관리됨: `lp-bot-nbtc`, `lp-bot-neth`, `lp-bot-nsol`, `price-updater`, `tpsl-keeper`.

**환경 분리**: Staging과 Production은 **별도의 LP_PRIVATE_KEY**를 사용하여 BalanceManager 온체인 객체 충돌 방지.

| 환경 | 서버 | LP 지갑 주소 | LP Alias |
|------|------|-------------|----------|
| Staging | `ec2-15-165-19-180...` (ubuntu) | `0x69377697...432952cd` | `musing-euclase` |
| Production | `43.200.67.52` (ec2-user) | `0xe1c4c90b...6dfb3d90` | `hopeful-malachite` |

**필수 `.env` (서버)**: `LP_PRIVATE_KEY`, `ORACLE_ADMIN_KEY`, `KEEPER_PRIVATE_KEY`, `TPSL_API_KEY`

**PM2 + .env 메커니즘**: PM2는 `.env`를 자동으로 읽지 않음. 비밀 키는 `.env`에 저장하고, 배포 스크립트(`deploy-pado-bots.sh`)가 `set -a && source .env` 후 PM2를 시작하여 셸 환경변수로 주입. 비밀이 아닌 설정(컨트랙트 주소, RPC URL)은 `ecosystem.config.cjs`의 `env:` 블록에 명시.

```bash
# 배포 (모노레포 루트에서)
pnpm deploy:pado:bots:staging     # Staging 배포
pnpm deploy:pado:bots:prod        # Production 배포

# 운영
./scripts/deploy-pado-bots.sh --staging --status     # PM2 상태
./scripts/deploy-pado-bots.sh --production --logs    # PM2 로그
```

> 상세 문서: [bots/README.md](bots/README.md)

---

## Chat Server (`apps/pado/chat-server/`)

WebSocket + HTTP 서버. Global Chat, Leaderboard Indexer, Competition API, Market Narrator 통합.

| 기능 | 설명 |
|------|------|
| Global Chat | WebSocket 실시간 채팅, signature-based 인증, 닉네임, SQLite 저장 (90일 보관) |
| Leaderboard Indexer | DeepBook OrderFilled 이벤트 폴링 → SQLite 집계, P&L 추적 |
| Competition API | Admin CRUD, 시간 제한 대회, Bearer token 인증 |
| Market Narrator | 하이브리드 봇 (규칙 기반 즉시 알림 + 선택적 AI 2시간 요약) |
| Aggregator | 실시간 시장 메트릭 (가격 추적, 볼륨 계산) |

### Market Narrator Bot

```
OrderFilled events (5s poll)
       |
  indexer.ts ──onTradeFill()──> market-narrator.ts ──broadcastSystemMessage()──> Chat
                                      |
                                 price-tracker.ts
                                 (EWMA baseline, volume window,
                                  consecutive trade detection)
```

| Alert Type | Trigger | Cooldown |
|------------|---------|----------|
| `price_move` | >= 3% from EWMA baseline | 5 min |
| `volume_spike` | 5min vol >= 3x previous | 10 min |
| `momentum` | 5+ consecutive same-direction | 3 min |

AI 요약: `ANTHROPIC_API_KEY` 설정 시 2시간 주기 Claude Haiku 요약 (~$0.04/일)

### Chat Server 소스 구조

```
chat-server/src/
├── server.ts              # WebSocket + REST 서버, broadcastSystemMessage()
├── store.ts               # SQLite 채팅 DB (messages, nicknames)
├── rooms.ts               # Room 정의 (room 0 = global, per-pool rooms)
├── auth.ts                # Challenge-response 지갑 인증
├── types.ts               # Config, message types
├── indexer.ts             # DeepBook OrderFilled 이벤트 폴링
├── aggregator.ts          # 리더보드 통계 집계
├── leaderboard-store.ts   # SQLite 리더보드 DB
├── leaderboard-types.ts   # Types (TradeFillData 포함)
├── price-tracker.ts       # 풀별 상태 추적 + 알림 (EWMA, 볼륨 윈도우)
└── market-narrator.ts     # 봇 오케스트레이터 (규칙 기반 + AI)
```

**REST API**:
| 엔드포인트 | 설명 |
|-----------|------|
| `GET /api/leaderboard?period=24h\|7d\|30d\|all&mode=volume\|pnl` | 기간별 순위 |
| `GET /api/leaderboard/trader/:address` | 트레이더 개인 통계 |
| `GET /api/leaderboard/trader/:address/fills` | 트레이더 체결 이력 |
| `GET /api/competitions` | 대회 목록 |
| `GET /api/competitions/:id` | 대회 상세 |
| `POST /api/competitions` | 대회 생성 (admin) |
| `PUT /api/competitions/:id` | 대회 수정 (admin) |

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

### 필수 (Tokens V1)

| 변수 | 설명 |
|------|------|
| `VITE_TOKENS_PACKAGE` | 토큰 패키지 (NBTC, NUSDC) |
| `VITE_NBTC_TYPE` | NBTC 타입 (`{pkg}::nbtc::NBTC`) |
| `VITE_NUSDC_TYPE` | NUSDC 타입 (`{pkg}::nusdc::NUSDC`) |
| `VITE_FAUCET_PACKAGE` | Faucet 패키지 |
| `VITE_TOKEN_FAUCET` | TokenFaucet 오브젝트 |

### 필수 (Tokens V2 — NETH, NSOL)

| 변수 | 설명 |
|------|------|
| `VITE_TOKENS_V2_PACKAGE` | V2 토큰 패키지 |
| `VITE_NETH_TYPE` | NETH 타입 |
| `VITE_NSOL_TYPE` | NSOL 타입 |
| `VITE_TOKEN_FAUCET_V2` | NSOL Faucet |
| `VITE_CLAIM_RECORD_V2` | NSOL ClaimRecord |
| `VITE_NETH_FAUCET_V2` | NETH Faucet |
| `VITE_NETH_CLAIM_RECORD_V2` | NETH ClaimRecord |

### 선택 (Pools)

| 변수 | 설명 |
|------|------|
| `VITE_POOL_NBTC_NUSDC` | NBTC/NUSDC 풀 |
| `VITE_POOL_NASUN_NUSDC` | NASUN/NUSDC 풀 |
| `VITE_POOL_NETH_NUSDC` | NETH/NUSDC 풀 |
| `VITE_POOL_NSOL_NUSDC` | NSOL/NUSDC 풀 |

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
| `VITE_ORACLE_PACKAGE_ID` | DevOracle 패키지 |
| `VITE_ORACLE_REGISTRY_ID` | OracleRegistry |
| `VITE_ORACLE_ADMIN_CAP_ID` | Oracle AdminCap |

### 선택 (zkLogin)

| 변수 | 설명 |
|------|------|
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth Client ID |
| `VITE_ZKLOGIN_SALT_API_URL` | Salt API (AWS Lambda) |
| `VITE_ZKLOGIN_PROVER_URL` | ZK Prover (기본: Mysten Labs) |

### 선택 (Chat / Social)

| 변수 | 설명 |
|------|------|
| `VITE_CHAT_WS_URL` | Chat WebSocket URL |
| `VITE_CHAT_HTTP_URL` | Chat HTTP API URL |

### Feature Flags

| 변수 | 설명 |
|------|------|
| `VITE_USE_TRADINGVIEW` | TradingView 차트 활성화 (`true`/`false`) |

---

## Development Commands

```bash
# 모노레포 루트에서
pnpm dev:pado              # 개발 서버 (포트 5176)
pnpm dev:pado:with-bot     # 개발 서버 + LP Bot + Chat Server
pnpm build:pado            # 프로덕션 빌드

# Move 컨트랙트 빌드/배포
cd apps/pado/contracts-margin
nasun move build
nasun client publish --gas-budget 100000000

# 봇 실행
cd apps/pado
pnpm --filter @nasun/pado run price-updater
pnpm --filter @nasun/pado run liquidation-keeper
pnpm lp-bot

# Chat Server
cd apps/pado/chat-server && npx tsc --noEmit   # 타입 체크

# 프론트엔드 빌드
cd apps/pado/frontend && npx vite build

# 테스트
cd apps/pado/frontend && pnpm test
cd apps/pado/frontend && pnpm test:coverage
```

---

## Internal Documentation

| 파일 | 설명 |
|------|------|
| [docs/PADO_IMPLEMENTATION_PLAN.md](docs/PADO_IMPLEMENTATION_PLAN.md) | 전략적 구현 로드맵 |
| [docs/PADO_NEXT_STEPS.md](docs/PADO_NEXT_STEPS.md) | 다음 기능 우선순위 |
| [docs/COMPETITIVE_ANALYSIS.md](docs/COMPETITIVE_ANALYSIS.md) | 경쟁 분석 및 개선 로드맵 |
| [docs/SOCIAL_LAYER_DISCUSSION.md](docs/SOCIAL_LAYER_DISCUSSION.md) | Social Layer 전략 분석 |
| [docs/SESSION_HANDOFF_SOCIAL_LAYER.md](docs/SESSION_HANDOFF_SOCIAL_LAYER.md) | Social Layer 세션 핸드오프 |
| [docs/LOTTERY.md](docs/LOTTERY.md) | Lottery 시스템 설계 및 메커니즘 |
| [docs/MANUAL_E2E_CHECKLIST.md](docs/MANUAL_E2E_CHECKLIST.md) | 수동 E2E 테스트 체크리스트 (EN) |
| [docs/MANUAL_E2E_CHECKLIST_KR.md](docs/MANUAL_E2E_CHECKLIST_KR.md) | 수동 E2E 테스트 체크리스트 (KR) |
| [docs/DEBUG_HARDCODED_NBTC.md](docs/DEBUG_HARDCODED_NBTC.md) | Auto-deposit 하드코딩 NBTC 버그 리포트 |
| [bots/README.md](bots/README.md) | 봇 문서 (LP Bot, Price Updater, Liquidation Keeper) |
| [contracts-prediction/README.md](contracts-prediction/README.md) | Prediction Market 컨트랙트 개요 |

---

## Architecture Patterns

**상태 관리**:
- React Context: 글로벌 상태 (Theme, Market, OrderForm, PerpMarket, Toast, ChatPanel)
- Zustand: 지갑 상태 (`@nasun/wallet`)
- TanStack Query: 서버 상태 캐싱 (stale time 5초, window focus refetch 비활성화)
- localStorage: 즐겨찾기, 알림 설정, 가격 알림, TP/SL, 차트 도구, 투어 상태

**데이터 페칭**:
- EventService: WebSocket → Polling → Simulation 자동 폴백
- `devInspectTransactionBlock`: 읽기 전용 온체인 쿼리
- Dynamic field object: 온체인 상태 조회
- Adaptive polling interval: 탭 포커스 기반 동적 간격

**스마트컨트랙트 디자인 패턴**:
- **Owned Objects**: 사용자별 상태 (MarginAccount, AccountPositions, SmartAccount, PerpPosition, Ticket, DepositPosition)
- **Shared Objects**: 프로토콜 상태 (MarginRegistry, OracleRegistry, Markets, LotteryRound, LendingPool)
- **Capability Pattern**: AdminCap으로 권한 제어
- **Permissionless**: 청산/라운드 종료/펀딩 정산은 누구나 호출 가능

**UI 패턴**:
- Simple/Pro 모드 (TradePage): 모바일 친화 2컬럼 vs 프로 3컬럼
- Toast 알림 + Error Boundary
- 원클릭 트레이딩 (확인 모달 스킵)
- Lazy loading (route-based code splitting + Suspense)
- PWA 지원 (Workbox runtime caching, 오프라인 동작)
- Tailwind CSS 커스텀 테마 변수 (CSS custom properties로 다크/라이트 전환)
- 커스텀 애니메이션 (flash-buy, flash-sell, pulse-up, pulse-down)
- 브라우저 알림 + 효과음 (체결 시)

---

## Known Issues & Pending Work

1. **환경 변수 불일치**: `.env.development`의 일부 주소가 `devnet-ids.json`과 다를 수 있음 (V7 리셋 후 부분 업데이트)
2. **Staging Chain ID 차이**: staging은 별도 체인, development은 `272218f1` 사용
3. **Lending UI 활성화 대기**: 컨트랙트 V7 배포 완료, 풀 생성 + .env 연동 + 풀 UI 구현 필요
4. **Auto-deposit NBTC 하드코딩**: 비-NBTC 마켓에서 auto-deposit 코드가 "NBTC"를 하드코딩 ([DEBUG_HARDCODED_NBTC.md](docs/DEBUG_HARDCODED_NBTC.md) 참조)
5. **Market Narrator 풀 이름 하드코딩**: `formatAlert`에서 "NBTC" 하드코딩, 다른 풀 추가 시 수정 필요

---

## Nasun Indexer Infrastructure (공유 인프라)

Pado에서 온체인 집계 데이터(주소별 잔액, TX 통계, 활성 주소 수 등)가 필요한 경우,
**Nasun Indexer API**를 활용할 수 있습니다.

- **API Base URL**: `https://explorer.nasun.io/api/v1`
- **인프라 상세**: 루트 [CLAUDE.md](../../CLAUDE.md)의 "Nasun Indexer Infrastructure" 섹션 참조
- **코드 위치**: `apps/network-explorer/api-server/`
- **현재 엔드포인트**: health, top-accounts, daily-transactions, active-addresses, network-summary
- **확장**: Pado 전용 집계(예: DEX 거래량, TVL)가 필요하면 API 서버에 새 라우트 추가 가능
