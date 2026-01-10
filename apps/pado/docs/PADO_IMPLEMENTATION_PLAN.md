# Pado 통합 금융 앱 구축 계획서

**작성일**: 2025-12-25
**최종 업데이트**: 2026-01-10
**비전**: Unified, non-custodial spot, derivatives, lending, staking, prediction markets, and payments through a single smart account on the Nasun Network.

**핵심 철학**: Smart Account, Unified Margin, Object-based Architecture

---

## Vision: Unified Onchain Finance

Pado는 Nasun Network 위에서 동작하는 **비수탁형(non-custodial) 통합 금융 애플리케이션**입니다.

### 핵심 원칙

| 원칙 | 설명 |
|------|------|
| **Single Smart Account** | 모든 금융 활동을 하나의 계정으로 통합 관리 |
| **Unified Margin System** | 포트폴리오 레벨의 통합 마진 |
| **Non-Custodial Control** | 사용자가 자산에 대한 완전한 통제권 유지 |
| **Object-Based Architecture** | Nasun의 객체 기반 상태 모델 활용 |
| **CEX-Grade UX, DEX-Level Transparency** | 중앙화 거래소 수준의 UX + 온체인 투명성 |

---

## 현황 요약 (2026-01-09)

### 인프라 상태

| 항목 | 상태 | 값 |
|------|------|-----|
| Nasun Devnet V3 리셋 | ✅ 완료 | Sui mainnet v1.63.0 fork |
| Chain ID | ✅ 운영중 | `6681cdfd` |
| Validator 합의 | ✅ 운영중 | 2노드 |
| Fullnode RPC | ✅ 운영중 | https://rpc.devnet.nasun.io |
| Faucet | ✅ 운영중 | https://faucet.devnet.nasun.io |
| DeepBook V3 | ✅ 배포 완료 | `0xceaeca5c...` |
| Test Tokens | ✅ 배포 완료 | NBTC, NUSDC, NASUN |
| DevOracle | ✅ 배포 완료 | BTC, ETH, NASUN 가격 피드 |
| Lottery | ✅ 배포 완료 | Multi-Tier (v2) |
| Frontend | ✅ 구현 완료 | Spot DEX + Prediction + Lottery |

### 개발 Phase 현황

| Phase | 제품 | 상태 | 완료일 |
|-------|------|------|--------|
| Phase 0 | Infrastructure | ✅ 완료 | 2025-12-25 |
| Phase 1 | Spot DEX Core | ✅ 완료 | 2025-12-25 |
| Phase 2 | Trading UI MVP | ✅ 완료 | 2025-12-25 |
| Phase 3 | Trading UX | ✅ 완료 | 2025-12-26 |
| Phase 4 | Multi-Pool | ✅ 완료 | 2025-12-26 |
| Phase 5 | Native Token Support | ✅ 완료 | 2025-12-26 |
| Phase 6 | Trading UX Pro | ✅ 완료 | 2025-12-28 |
| Phase 7 | Portfolio Dashboard | ✅ 완료 | 2025-12-28 |
| Phase 8 | Mobile & Theme | ✅ 완료 | 2025-12-28 |
| Phase 9 | zkLogin | ✅ 완료 | 2026-01-03 |
| Phase 14 | Prediction Markets | ✅ 완료 | 2026-01-04 |
| Phase 15 | Payments | ✅ 완료 | 2025-12-28 |
| Phase 16 | Unified Margin v1 | ✅ 완료 | 2026-01-10 |
| Phase 17 | Lottery | ✅ 완료 | 2026-01-09 |
| Phase 11 | Perpetuals DEX | 🚧 진행중 | 2026-01-10 (11.1-11.2) |

### 구현 완료 기능

**스팟 거래 (Spot Trading)**
- ✅ 지정가 주문 (Limit Order) - GTC, IOC, FOK, POST_ONLY
- ✅ 시장가 주문 (Market Order) - 슬리피지 설정
- ✅ 주문 취소 (Cancel Order)
- ✅ 오더북 실시간 표시 (5/10/20 depth)
- ✅ 캔들스틱 차트 (Lightweight Charts)
- ✅ 거래 히스토리

**잔고 관리 (Balance Management)**
- ✅ BalanceManager 생성/관리
- ✅ 토큰 입금/출금 (NBTC, NUSDC, NASUN)
- ✅ 가스비 예약 (NASUN 0.1 예약)
- ✅ 다중 토큰 잔고 조회

**마켓 (Markets)**
- ✅ NBTC/NUSDC 풀
- ✅ NASUN/NUSDC 풀
- ✅ 마켓 선택 드롭다운

**지갑 (Wallet)**
- ✅ @nasun/wallet 패키지 통합
- ✅ @nasun/wallet-ui 컴포넌트 사용
- ✅ Embedded Wallet (AES-256-GCM 암호화)
- ✅ NASUN Faucet + Token Faucet

**UX**
- ✅ 주문 확인 모달
- ✅ Toast 알림 시스템
- ✅ 가격 클릭 → 주문폼 연동
- ✅ 가격 제안 버튼 (Mid, Best Bid/Ask)
- ✅ 슬리피지 설정 UI
- ✅ 에러 메시지 사용자 친화적 변환

**Trading UX Pro (Phase 6)**
- ✅ 실시간 거래 이벤트 (시뮬레이션 포함)
- ✅ 차트 이동평균선 (MA 5/20/60)
- ✅ MA 토글 기능
- ✅ Volume 차트 (거래량 히스토그램)

**Portfolio Dashboard (Phase 7)**
- ✅ 포트폴리오 페이지 (/portfolio)
- ✅ 전체 자산 USD 환산 표시
- ✅ 토큰별 24h P&L 표시
- ✅ 토큰 잔고 리스트
- ✅ 거래 통계 (TradeStats): 총 거래 수, 거래량, 매수/매도 비율
- ✅ 거래 내역 (RecentTrades): 최근 거래 목록 테이블
- ✅ useTradeHistory hook: 사용자 거래 내역 조회

**Payments (Phase 15)**
- ✅ 토큰 전송 페이지 (/send)
- ✅ NASUN, NBTC, NUSDC 전송 지원
- ✅ QR 코드 결제 (/send, Receive 탭)
- ✅ PaymentQRCode 컴포넌트 (qrcode.react)

**Prediction Markets (Phase 14)** - 완료
- ✅ 예측 시장 스마트 컨트랙트 배포
- ✅ 마켓 목록 페이지 (/predict)
- ✅ 마켓 상세 페이지 (/predict/:marketId)
- ✅ YES/NO 토큰 민트 (1 NUSDC = 1 YES + 1 NO)
- ✅ 주문 기능 (Buy/Sell)
- ✅ 오더북 UI (온체인 + 시뮬레이션 하이브리드)
- ✅ 포지션 관리 (Position NFT)
- ✅ P&L 표시 및 청산 (Claim Winnings)
- ✅ 블록체인 동기화 UI 피드백
- ✅ 사용자 친화적 에러 메시지
- ✅ 확률 계산 통일 (오더북 기반 Polymarket 방식)
- ✅ 마켓 생성 (Admin) - CreateMarketForm
- ✅ 마켓 해결 (Admin) - AdminResolveModal
- ✅ 시드 유동성 공급 (4개 마켓)

**Lottery (Phase 17)** - 완료
- ✅ 주간 로또 스마트 컨트랙트 배포 (Sui Random 기반)
- ✅ Multi-Tier 상금 구조 (Jackpot, 2nd, 3rd)
- ✅ 티켓 구매 페이지 (/lottery)
- ✅ 라운드 상세 페이지 (/lottery/:roundId)
- ✅ 번호 선택 UI (1-32, 5개 선택)
- ✅ Quick Pick (자동 번호 생성)
- ✅ 당첨 확인 및 상금 청구
- ✅ 롤오버 메커니즘 (미당첨 시 다음 라운드로 이월)
- ✅ Admin 라운드 관리 (/admin)

**Unified Margin (Phase 16)** - v1 완료
- ✅ MarginAccount 스마트 컨트랙트 배포 (v0.6)
- ✅ MarginRegistry (전역 TVL 추적)
- ✅ Multi-Collateral: NUSDC (0% haircut) + NBTC (10% haircut)
- ✅ Oracle Integration (DevOracle 연동)
- ✅ Risk Engine v1: 4-Tier Threshold (IM 10%, Warning 8%, MM 5%, FC 3%)
- ✅ AccountPositions: 포지션 추적 + 실시간 PnL 계산
- ✅ Liquidation Engine: 5% 보너스, 50% 최대 청산 비율
- ✅ Smart Account UI: HeaderNetValue (Wallet + Trading 통합 표시)

**Perpetuals DEX (Phase 11)** - 진행중 (11.1-11.2 완료)
- ✅ 11.1: perpetual.move - PerpMarket, PerpPosition, 20x 레버리지
- ✅ 11.2: funding.move - 8시간 펀딩 레이트, Oracle staleness protection
- 📋 11.3: Perp Trading UI
- 📋 11.4: Perp Liquidation
- 📋 11.5: Spot-Perp Integration

**Mobile & Theme (Phase 8)**
- ✅ 모바일 반응형 최적화 (Phase 8.1)
  - 햄버거 메뉴 (768px 이하)
  - 그리드 반응형 개선
- ✅ 다크/라이트 테마 (Phase 8.2)
  - ThemeProvider + useTheme hook
  - CSS 변수 기반 테마 시스템
  - 시스템 테마 감지

**zkLogin (Phase 9)**
- ✅ Google 소셜 로그인 (OAuth 2.0)
- ✅ ZK proof 기반 인증
- ✅ 모든 트랜잭션 서명 지원 (거래, 예측 시장, 스테이킹 등)
- ✅ Salt 관리 Lambda (AWS)
- ✅ 모든 앱 통합 (Pado, network-explorer, gensol-website, nasun-website)

**기술 지표 (Technical Indicators)**
- ✅ 이동평균선 (MA 5/20/60)
- ✅ Volume 차트 (거래량 히스토그램)
- ✅ RSI (Relative Strength Index, 14일)
- ✅ MACD (12, 26, 9)

---

## 네트워크 정보

| 항목 | 값 |
|------|-----|
| Network | Nasun Devnet |
| Chain ID | `6681cdfd` |
| Fork Source | Sui mainnet v1.63.0 |
| RPC | https://rpc.devnet.nasun.io |
| Faucet | https://faucet.devnet.nasun.io |
| Total Supply | 10,000,000,000 NASUN |
| 최소 단위 | SOE (1 NASUN = 10^9 SOE) |
| Epoch Duration | 60초 |

---

## 배포된 컨트랙트

### DeepBook V3

| 항목 | 값 |
|------|-----|
| Package | `0xceaeca5c1a5f31e1282c47000b442289b2aa454f007c1e1e316110414e020757` |
| Registry | `0xf38bd1c809db53656767848a84464ab2a9cdd9283dbb3dd54d82a972c7dab6a4` |
| AdminCap | `0x1010f2ef902c482ffba7c9848d74b209bfcbbef4003f583f5faaadcf4ca883cb` |

### Test Tokens

> **Single Source of Truth**: `.env.development`, `.env.staging` 파일 참조

| 항목 | 환경 변수 |
|------|-----|
| Package | `VITE_TOKENS_PACKAGE` |
| NBTC Type | `VITE_NBTC_TYPE` |
| NUSDC Type | `VITE_NUSDC_TYPE` |
| Token Faucet | `VITE_TOKEN_FAUCET` |

현재 배포 주소 (2026-01-03): `0x508ba1bda666f93e72543ebcce14075d08ac089c455fca51592bc1ef1c826489`

### Trading Pools

| Pool | Pool ID | tick_size | lot_size |
|------|---------|-----------|----------|
| NBTC/NUSDC | `0xf1f6ee99616774ab0861348f5e3cf4285cea2fa0a5a7e91cee13f4ec554bcc63` | 10,000 ($0.01) | 10,000 (0.0001 BTC) |
| NASUN/NUSDC | `0x2662e8818e9f5f7c97362e50c33854c4b8e8af1a0cd0e53b1e9677cd66ee8f61` | 1,000 ($0.001) | 10,000,000 (0.01 NASUN) |

### Prediction Market

| 항목 | 값 |
|------|-----|
| Package | `0x8928903e...` |
| GlobalState | `0x29d79342...` |
| AdminCap | `0x38a29029...` |

### DevOracle (가격 피드)

| 항목 | 값 |
|------|-----|
| Package | `0x10ffe5c6fe47e6e046a0692863937d270708f4bf8f74c18aab578c97b862f84c` |
| OracleRegistry | `0x023944875d36fe148facf696cc00b6c4a850074556890e547dcd61f5d8710b9b` |
| AdminCap | `0x355529a091bf18bec82f733434817cde66238e216d7e7eb2ef744fc978427e47` |

심볼 ID: BTCUSD=1, ETHUSD=2, NASUSD=3 (8 decimals)

### Lottery (v2 Multi-Tier)

| 항목 | 값 |
|------|-----|
| Package | `0x8dce08316436ed3fa8c4a183895101ee4a4c4eb8e1dcd19e121b46ee5e256538` |
| LotteryRegistry | `0x56e1875df39be66f3c591678ff75866b6c44637c4b84e4c2767926f738ea7f16` |
| AdminCap | `0xf60cb648dc721bc14b794914518732e809efc7ac471ad1e1213706d209447d68` |

### Unified Margin (v1 완료)

| 항목 | 값 |
|------|-----|
| Package | `0x2886424f...` (contracts-margin) |
| MarginRegistry | `0x57979cb0...` |
| UpgradeCap | `0x4781e6fd...` |
| 모듈 | unified_margin.move (v0.6), risk_engine.move, account_positions.move, liquidation.move |

### Perpetuals DEX (진행중)

| 항목 | 값 |
|------|-----|
| Package | contracts-perp (배포 대기) |
| 모듈 | perpetual.move, funding.move |
| 상태 | 11.1-11.2 완료, 11.3-11.5 예정 |

---

## 기술 스택

| 항목 | 기술 |
|------|------|
| 빌드 도구 | Vite 7 |
| 프레임워크 | React 19 |
| 언어 | TypeScript 5.9 |
| 스타일링 | Tailwind CSS 3.4 |
| 상태 관리 | Context API + Zustand (예약) |
| 데이터 페칭 | @tanstack/react-query |
| Sui SDK | @mysten/sui |
| 차트 | lightweight-charts |
| 지갑 | @nasun/wallet, @nasun/wallet-ui |

---

## 프로젝트 구조

```
apps/pado/
├── CLAUDE.md                       # 프로젝트 지침
├── docs/
│   ├── PADO_IMPLEMENTATION_PLAN.md # 이 파일
│   ├── PADO_NEXT_STEPS.md          # 다음 단계 계획
│   └── PADO_UI_ROADMAP.md          # UI 로드맵
├── contracts/                      # NBTC, NUSDC, Faucet
├── contracts-prediction/           # Prediction Market
├── contracts-oracle/               # DevOracle 가격 피드
├── contracts-lending/              # Lending Pool
├── contracts-lottery/              # Lottery (Sui Random)
├── contracts-margin/               # Unified Margin v1 (NEW)
│   └── sources/
│       ├── unified_margin.move     # Multi-collateral 마진
│       ├── risk_engine.move        # 4-Tier Risk Threshold
│       ├── account_positions.move  # 포지션 추적 + PnL
│       └── liquidation.move        # 청산 엔진
├── contracts-perp/                 # Perpetuals DEX (NEW, 진행중)
│   └── sources/
│       ├── perpetual.move          # PerpMarket, PerpPosition
│       └── funding.move            # 8시간 펀딩 레이트
├── deepbookv3/                     # DeepBook V3 (git submodule)
└── frontend/
    └── src/
        ├── config/network.ts       # 네트워크 설정
        ├── lib/                    # Sui 클라이언트, DeepBook 유틸
        ├── features/               # 기능 모듈 (trading, prediction, lottery 등)
        ├── components/             # 공통 UI
        ├── pages/                  # 페이지 컴포넌트
        └── routes/                 # 라우팅 설정
```

---

## Product Roadmap

### 완료된 Phase (0-5)

| Phase | 제품 | 설명 |
|-------|------|------|
| Phase 0 | Infrastructure | Nasun Devnet V3 (Sui mainnet v1.63.0 fork) |
| Phase 1 | Spot DEX Core | DeepBook V3 배포 + 테스트 토큰 + 풀 생성 |
| Phase 2 | Trading UI MVP | 오더북, 주문폼, 잔고관리 |
| Phase 3 | Trading UX | 가격 클릭 연동, 주문 상태 피드백, 차트 |
| Phase 4 | Multi-Pool | NASUN/NUSDC 풀, MarketSelector |
| Phase 5 | Native Token | NASUN 입금/출금 (가스비 예약) |

### 진행 중 및 예정

| Phase | 제품 | 상태 | 우선순위 |
|-------|------|------|----------|
| Phase 6 | Trading UX Pro | ✅ 완료 | ⭐⭐⭐ |
| Phase 7 | Portfolio Dashboard | ✅ 완료 | ⭐⭐⭐ |
| Phase 8 | Mobile & Theme | ✅ 완료 | ⭐⭐ |
| Phase 9 | Smart Account v2 (zkLogin) | ✅ 완료 | ⭐⭐⭐ |
| Phase 10 | Cross-Chain Vaults | 📋 계획 | ⭐⭐ |
| Phase 11 | Perpetuals | 🚧 진행중 | ⭐⭐⭐ |
| Phase 12 | Lending & Borrowing | 📋 계획 | ⭐⭐⭐ |
| Phase 13 | Staking | 📋 계획 | ⭐⭐ |
| Phase 14 | Prediction Markets | ✅ 완료 | ⭐⭐ |
| Phase 15 | Payments | ✅ 완료 | ⭐ |
| Phase 16 | Unified Margin v1 | ✅ 완료 | ⭐⭐⭐⭐⭐ |
| Phase 17 | Lottery | ✅ 완료 | ⭐⭐ |

---

## DeepBook V3 전략

### V3 선택 이유

| 항목 | V2 | V3 |
|------|----|----|
| 상태 | ❌ deprecated | ✅ 활성 개발중 |
| Flash Loan | ❌ | ✅ |
| Oracle Integration | ❌ | ✅ |
| Governance | ❌ | ✅ |
| SDK 지원 | 레거시 | 최신 |

### BalanceManager와 Unified Margin 확장 전략

**현재 (Phase 5)**:
- BalanceManager를 사용자 지갑이 직접 소유
- Pool별 독립 잔고

**향후 Unified Margin 구현 시**:
- BalanceManager를 Pado Smart Contract(공용 금고)가 소유
- 사용자는 논리적 소유권만 보유
- `ISmartAccount` 인터페이스로 프론트엔드 수정 없이 백엔드 전환 가능

---

## Smart Account 아키텍처

### 현재 구현

```typescript
// Embedded Wallet (현재)
- 패스워드 기반 암호화
- AES-256-GCM + PBKDF2
- localStorage 저장
```

### 향후 확장 (Phase 9)

```typescript
interface ISmartAccount {
  readonly address: string | null;
  readonly isConnected: boolean;

  connect(): Promise<void>;
  disconnect(): Promise<void>;
  signTransaction(tx: Transaction): Promise<SignedTransaction>;

  // DeepBook V3 BalanceManager 관리
  getBalanceManager(poolId: string): Promise<string | null>;
  createBalanceManager(): Promise<string>;
}

type AccountType = 'embedded' | 'zklogin' | 'passkey';
```

| Adapter | 상태 | 설명 |
|---------|------|------|
| EmbeddedWalletAdapter | ✅ 구현됨 | 패스워드 기반 |
| ZkLoginAdapter | 📋 Phase 9 | Google/Apple 소셜 로그인 |
| PasskeyAdapter | 📋 Phase 9 | 생체 인증 |

---

## 환경변수 관리

### .env.local

```bash
# Nasun Devnet 설정
VITE_RPC_URL=https://rpc.devnet.nasun.io
VITE_FAUCET_URL=https://faucet.devnet.nasun.io
VITE_CHAIN_ID=6681cdfd

# DeepBook V3
VITE_DEEPBOOK_PACKAGE=0xceaeca5c1a5f31e1282c47000b442289b2aa454f007c1e1e316110414e020757
VITE_DEEPBOOK_REGISTRY=0xf38bd1c809db53656767848a84464ab2a9cdd9283dbb3dd54d82a972c7dab6a4

# Test Tokens (2026-01-03 배포)
VITE_TOKENS_PACKAGE=0x508ba1bda666f93e72543ebcce14075d08ac089c455fca51592bc1ef1c826489
VITE_NBTC_TYPE=0x508ba1bda666f93e72543ebcce14075d08ac089c455fca51592bc1ef1c826489::nbtc::NBTC
VITE_NUSDC_TYPE=0x508ba1bda666f93e72543ebcce14075d08ac089c455fca51592bc1ef1c826489::nusdc::NUSDC

# Pools
VITE_POOL_NBTC_NUSDC=0xf1f6ee99616774ab0861348f5e3cf4285cea2fa0a5a7e91cee13f4ec554bcc63
VITE_POOL_NASUN_NUSDC=0x2662e8818e9f5f7c97362e50c33854c4b8e8af1a0cd0e53b1e9677cd66ee8f61
```

---

## 주의사항

1. **DeepBook V3 별도 배포 필수**: V3는 시스템 패키지가 아님
2. **BalanceManager**: V2의 AccountCap 대신 V3의 BalanceManager 사용
3. **SOE 단위**: 1 NASUN = 10^9 SOE
4. **Submodule 클론**: `git clone --recursive` 또는 `git submodule update --init`
5. **비전 정렬**: 모든 새 기능은 "Unified Onchain Finance" 비전에 부합해야 함

---

## 변경 이력

| 날짜 | 변경 내용 |
|------|----------|
| 2025-12-25 | 초안 작성 (Phase 0-2 계획) |
| 2025-12-25 | Phase 0-1 완료: Devnet V3 리셋 + DeepBook V3 배포 |
| 2025-12-26 | Phase 2-5 완료: Frontend MVP + Multi-Pool + NASUN 지원 |
| 2025-12-27 | 문서 전면 개편: Unified Onchain Finance 비전 반영, 현황 업데이트 |
| 2025-12-28 | Phase 6, 7 완료, Phase 15.1 구현, UI 개선 |
| 2025-12-28 | Phase 15 완료, wallet-ui 라이트 테마 지원 |
| 2025-12-29 | Phase 14 완료 (Prediction Market MVP), Phase 8.1 완료 (모바일 반응형) |
| 2025-12-31 | Phase 14 상태 정정: MVP 완료 (Sell/마켓 생성/해결/유동성 미구현 명시) |
| 2026-01-01 | Phase 14.6 (Sell), 14.7 (Resolution), 14.9 (Create Market) 완료 |
| 2026-01-03 | Phase 9 완료: zkLogin 전체 앱 통합 (Pado, Explorer, GenSol, Nasun Website) |
| 2026-01-04 | Phase 14 완료: Prediction Markets (시드 유동성 포함), DevOracle 배포 |
| 2026-01-04 | Phase 16 v0 완료: Unified Margin 스마트 컨트랙트 + Frontend |
| 2026-01-09 | Phase 17 완료: Lottery v2 Multi-Tier (Sui Random 기반) |
| 2026-01-10 | Phase 16 v1 완료: Multi-collateral, Risk Engine, Liquidation |
| 2026-01-10 | Phase 11.1-11.2 완료: Perpetuals DEX foundation (perpetual.move, funding.move) |
