# Pado 다음 단계 작업 계획서

> 작성일: 2025-12-26
> 최종 업데이트: 2025-12-29
> 비전: Unified Onchain Finance

---

## 현재 구현 상태

| Phase | 상태 | 내용 | 완료일 |
|-------|------|------|--------|
| Phase 0 | ✅ 완료 | Nasun Devnet V3 리셋 | 2025-12-25 |
| Phase 1 | ✅ 완료 | DeepBook V3 배포 + 테스트 토큰 | 2025-12-25 |
| Phase 2 | ✅ 완료 | Frontend MVP (오더북, 주문폼, 잔고관리) | 2025-12-25 |
| Phase 3 | ✅ 완료 | Trading UX (차트, 가격 클릭, 피드백) | 2025-12-26 |
| Phase 4 | ✅ 완료 | Multi-Pool (NASUN/NUSDC 풀, MarketSelector) | 2025-12-26 |
| Phase 5 | ✅ 완료 | Native Token (NASUN 입금/출금, 가스비 예약) | 2025-12-26 |
| Phase 6 | ✅ 완료 | Trading UX Pro (MA, Volume, RSI, MACD) | 2025-12-28 |
| Phase 7 | ✅ 완료 | Portfolio Dashboard | 2025-12-28 |
| Phase 8 | ✅ 완료 | Mobile & Theme (반응형, 다크/라이트) | 2025-12-28 |
| Phase 14 | ✅ 완료 | Prediction Markets MVP | 2025-12-29 |
| Phase 15 | ✅ 완료 | Payments (Send, QR) | 2025-12-28 |

### 구현 완료 기능 상세

**스팟 거래**
- ✅ 지정가 주문 (GTC, IOC, FOK, POST_ONLY)
- ✅ 시장가 주문 (슬리피지 설정)
- ✅ 주문 취소
- ✅ 오더북 (5/10/20 depth, Depth Bar)
- ✅ 캔들스틱 차트 (Lightweight Charts)
- ✅ 거래 히스토리
- ✅ 주문 확인 모달
- ✅ Toast 알림

**잔고 관리**
- ✅ BalanceManager 생성/관리
- ✅ 토큰 입금/출금 (NBTC, NUSDC, NASUN)
- ✅ 가스비 예약 (NASUN 0.1)
- ✅ 다중 토큰 잔고 조회 (useMultiBalance)

**마켓**
- ✅ NBTC/NUSDC, NASUN/NUSDC 풀
- ✅ 마켓 선택 드롭다운
- ✅ 가격 제안 버튼 (Mid, Best Bid/Ask)

**지갑**
- ✅ @nasun/wallet, @nasun/wallet-ui 통합
- ✅ Embedded Wallet
- ✅ NASUN Faucet + Token Faucet

---

## 우선순위별 개발 로드맵

### 🔴 Tier 1: 핵심 기능 (즉시 ~ 2주)

비즈니스 가치가 높고, Unified Onchain Finance 비전에 필수적인 기능

#### Phase 6: Trading UX Pro ⭐ (완료)

**목표**: CEX 수준의 거래 경험 완성

| 순서 | 작업 | 상태 | 난이도 |
|------|------|------|--------|
| 6.1 | 실시간 거래 데이터 | ✅ 완료 | 중 |
| 6.2 | 차트 기술 지표 (MA) | ✅ 완료 | 중 |
| 6.3 | 포지션 P&L 표시 | ✅ 완료 | 저 |

**구현 완료 (2025-12-28)**:
- useTradeEvents hook + 시뮬레이션 fallback
- PriceChart MA 5/20/60 + 토글 기능
- TokenBalanceList 24h P&L 표시

---

#### Phase 7: Portfolio Dashboard ⭐ (완료)

**목표**: 사용자 자산/거래 현황 한눈에 파악

| 순서 | 작업 | 상태 | 난이도 |
|------|------|------|--------|
| 7.1 | 포트폴리오 페이지 | ✅ 완료 | 중 |
| 7.2 | 전체 자산 현황 | ✅ 완료 | 저 |
| 7.3 | 24h P&L 표시 | ✅ 완료 | 저 |
| 7.4 | 거래 통계/내역 | ✅ 완료 | 중 |

**구현 완료 (2025-12-28)**:
- PortfolioPage + /portfolio 라우팅
- AssetOverview 전체 자산 USD 환산
- TokenBalanceList 24h P&L 색상 표시
- Header 네비게이션 Portfolio 메뉴 활성화
- useTradeHistory hook (사용자 거래 내역 조회)
- TradeStats 컴포넌트 (거래 통계: 총 거래 수, 거래량, 매수/매도 비율)
- RecentTrades 컴포넌트 (최근 거래 목록 테이블)

---

#### Wallet Security Phases ⭐

**목표**: 웹3 지갑 보안 강화로 사용자 자산 보호

**완료된 보안 기능 (Phase 1-2)**

| Phase | 기능 | 상태 | 완료일 |
|-------|------|------|--------|
| Security 1.1 | 세션 타임아웃 (자동 잠금) | ✅ 완료 | 2025-12-28 |
| Security 1.2 | 메모리 보안 (secureZero) | ✅ 완료 | 2025-12-28 |
| Security 1.3 | SecuritySettings UI | ✅ 완료 | 2025-12-28 |
| Security 2.1 | 주소록 시스템 | ✅ 완료 | 2025-12-28 |
| Security 2.2 | 첫 거래 주소 경고 | ✅ 완료 | 2025-12-28 |
| Security 2.3 | 트랜잭션 시뮬레이션 API | ✅ 완료 | 2025-12-28 |

**남은 보안 작업 (Phase 3-4)**

##### Security Phase 3: 저장소 보안 강화

| 순서 | 작업 | 상태 | 난이도 | 설명 |
|------|------|------|--------|------|
| 3.1 | IndexedDB 마이그레이션 | 📋 | 중 | localStorage → IndexedDB (더 안전) |
| 3.2 | 암호화 키 저장소 개선 | 📋 | 고 | 키 파생 알고리즘 강화 (Argon2) |
| 3.3 | 세션 스토리지 보안 | 📋 | 중 | 민감 데이터 암호화 저장 |

##### Security Phase 4: 고급 보안 기능

| 순서 | 작업 | 상태 | 난이도 | 설명 |
|------|------|------|--------|------|
| 4.1 | 스캠 주소 DB 연동 | 📋 | 중 | 외부 API로 스캠 주소 체크 |
| 4.2 | 하드웨어 지갑 연동 | 📋 | 고 | Ledger/Trezor 지원 |
| 4.3 | dApp 권한 관리 | 📋 | 고 | 연결된 dApp 권한 제어 |
| 4.4 | 트랜잭션 화이트리스트 | 📋 | 중 | 신뢰할 수 있는 컨트랙트만 허용 |

**구현된 보안 기능 파일 위치**:
- `packages/wallet/src/types/index.ts` - SecuritySettings, AddressBook 타입
- `packages/wallet/src/hooks/useWallet.ts` - 자동 잠금 로직
- `packages/wallet/src/hooks/useAddressBook.ts` - 주소록 관리
- `packages/wallet/src/core/crypto.ts` - secureZero 함수
- `packages/wallet/src/sui/client.ts` - simulateTransaction 함수
- `packages/wallet-ui/src/SecuritySettings.tsx` - 보안 설정 UI
- `packages/wallet-ui/src/SendTransaction.tsx` - 주소 경고 UI

---

#### Phase 9: Smart Account v2 ⭐

**목표**: 시드리스 온보딩으로 사용자 진입 장벽 낮춤

| 순서 | 작업 | 상태 | 난이도 |
|------|------|------|--------|
| 9.1 | zkLogin 통합 | 📋 | 고 |
| 9.2 | Passkey 인증 | 📋 | 고 |
| 9.3 | 계정 복구 메커니즘 | 📋 | 중 |

**구현 방향**:
```typescript
// Smart Account 인터페이스
interface ISmartAccount {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  signTransaction(tx: Transaction): Promise<SignedTransaction>;
  getBalanceManager(poolId: string): Promise<string | null>;
}

type AccountType = 'embedded' | 'zklogin' | 'passkey';
```

---

### 🟡 Tier 2: 확장 기능 (2~4주)

Unified Finance 비전을 향한 핵심 확장

#### Phase 11: Perpetuals ⭐

**목표**: 무기한 선물 거래 지원

| 순서 | 작업 | 상태 | 난이도 |
|------|------|------|--------|
| 11.1 | Perps 컨트랙트 설계 | 📋 | 고 |
| 11.2 | 펀딩 레이트 메커니즘 | 📋 | 고 |
| 11.3 | 마진 시스템 (교차/격리) | 📋 | 고 |
| 11.4 | 청산 엔진 | 📋 | 고 |

**의존성**: Oracle 통합 (DeepBook V3 Oracle)

---

#### Phase 12: Lending & Borrowing ⭐

**목표**: 통합 대출 프로토콜

| 순서 | 작업 | 상태 | 난이도 |
|------|------|------|--------|
| 12.1 | Lending Pool 설계 | 📋 | 고 |
| 12.2 | 동적 금리 곡선 | 📋 | 중 |
| 12.3 | 담보 관리 | 📋 | 고 |
| 12.4 | 청산 메커니즘 | 📋 | 고 |

**확장 방향**: Unified Margin과 연동하여 거래 마진으로 활용

---

#### Phase 16: Unified Margin ⭐

**목표**: 크로스-프로덕트 통합 마진 시스템

| 순서 | 작업 | 상태 | 난이도 |
|------|------|------|--------|
| 16.1 | 통합 담보 관리 | 📋 | 고 |
| 16.2 | 포트폴리오 레벨 리스크 엔진 | 📋 | 고 |
| 16.3 | 자산별 리스크 가중치 | 📋 | 중 |
| 16.4 | 실시간 청산 가격 계산 | 📋 | 고 |

**아키텍처**:
```
┌─────────────────────────────────────┐
│         Unified Risk Engine         │
├─────────────────────────────────────┤
│  Spot + Perps + Lending + Prediction │
│  공유 담보 풀 (BalanceManager)        │
│  실시간 PnL + 청산 가격              │
└─────────────────────────────────────┘
```

---

### 🟢 Tier 3: 부가 기능 (4주+)

사용자 경험 향상 및 생태계 확장

#### Phase 8: Mobile & Theme ⭐ (완료)

| 순서 | 작업 | 상태 | 난이도 |
|------|------|------|--------|
| 8.1 | 모바일 반응형 최적화 | ✅ 완료 | 중 |
| 8.2 | 다크/라이트 테마 | ✅ 완료 | 저 |
| 8.3 | 레이아웃 커스터마이징 | 📋 | 고 |

**구현 완료 (8.1, 8.2 - 2025-12-28)**:
- 모바일 햄버거 메뉴 (768px 이하)
- 그리드 반응형 개선 (TradePage, Orderbook, BalancePanel)
- ThemeProvider + useTheme hook
- CSS 변수 기반 테마 시스템
- Header에 테마 토글 버튼 (해/달 아이콘)
- localStorage 테마 저장
- 시스템 테마 감지 (prefers-color-scheme)

---

#### Phase 10: Cross-Chain Vaults

| 순서 | 작업 | 상태 | 난이도 |
|------|------|------|--------|
| 10.1 | BTC Vault 설계 | 📋 | 고 |
| 10.2 | ETH Vault 설계 | 📋 | 고 |
| 10.3 | MPC/Threshold Signature | 📋 | 고 |
| 10.4 | 1:1 Mint/Burn 메커니즘 | 📋 | 고 |

---

#### Phase 13: Staking

| 순서 | 작업 | 상태 | 난이도 |
|------|------|------|--------|
| 13.1 | NAS 토큰 스테이킹 | 📋 | 중 |
| 13.2 | 검증자 위임 | 📋 | 중 |
| 13.3 | 보상 배분 | 📋 | 중 |

---

#### Phase 14: Prediction Markets ⭐ (완료)

**목표**: 이진 예측 시장 (YES/NO Outcome)

| 순서 | 작업 | 상태 | 난이도 |
|------|------|------|--------|
| 14.1 | 스마트 컨트랙트 배포 | ✅ 완료 | 고 |
| 14.2 | 기본 UI (마켓 목록, 카드) | ✅ 완료 | 중 |
| 14.3 | 마켓 상세 (오더북, 카운트다운) | ✅ 완료 | 중 |
| 14.4 | 거래 기능 (Mint, Buy, Sell) | ✅ 완료 | 고 |
| 14.5 | 포지션 관리 (P&L, Claim) | ✅ 완료 | 중 |

**구현 완료 (2025-12-29)**:
- 예측 시장 스마트 컨트랙트 (CTF 모델)
- 마켓 목록/상세 페이지 (/predict, /predict/:marketId)
- YES/NO 토큰 민트 (1 NUSDC = 1 YES + 1 NO)
- 주문 기능 (Buy/Sell)
- 포지션 NFT 관리
- 블록체인 동기화 UI 피드백
- 사용자 친화적 에러 메시지

**파일 위치**:
- `features/prediction/` - hooks, components, types
- `pages/PredictPage.tsx` - 마켓 목록
- `pages/PredictMarketPage.tsx` - 마켓 상세

---

#### Phase 15: Payments ⭐

| 순서 | 작업 | 상태 | 난이도 |
|------|------|------|--------|
| 15.1 | 즉시 전송 | ✅ 완료 | 저 |
| 15.2 | 정기 결제 | 📋 | 중 |
| 15.3 | QR 코드 결제 | ✅ 완료 | 저 |

**구현 완료 (15.1, 15.3)**:
- PaymentPage with @nasun/wallet-ui SendTransaction
- 라우팅: /send
- 헤더 네비게이션 추가
- NASUN, NBTC, NUSDC 전송 지원
- PaymentQRCode 컴포넌트 (qrcode.react)
- Send/Receive 탭 UI
- QR 코드로 결제 링크 공유

---

## 작업 프로세스

### Phase 시작 전

```bash
# 1. 롤백 포인트 확보
git add -A && git commit -m "chore: checkpoint before phase X"
git tag vX.Y.Z-pre

# 2. 작업 브랜치 생성
git checkout -b feature/phase-X
```

### Phase 완료 후

```bash
# 1. 빌드 테스트
pnpm build:pado

# 2. 개발 서버 테스트
pnpm dev:pado

# 3. 문서 업데이트
# - CLAUDE.md
# - PADO_IMPLEMENTATION_PLAN.md
# - 이 문서 (PADO_NEXT_STEPS.md)

# 4. 커밋 & 태그
git add -A && git commit -m "feat: complete phase X - 설명"
git tag vX.Y.Z

# 5. 푸시
git push origin main --tags
```

---

## 핵심 파일 구조

### 현재 구조

```
frontend/src/
├── features/
│   └── trading/          # 스팟 거래 (구현 완료)
│       ├── components/   # 11개 컴포넌트
│       ├── hooks/        # 4개 훅
│       └── context/      # 2개 컨텍스트
├── pages/
│   └── TradePage.tsx     # 메인 거래 페이지
└── components/
    └── common/           # 공통 UI
```

### 향후 확장 구조

```
frontend/src/
├── features/
│   ├── trading/          # 스팟 거래 ✅
│   ├── portfolio/        # 포트폴리오 (Phase 7)
│   ├── perps/            # 무기한 선물 (Phase 11)
│   ├── lending/          # 대출 (Phase 12)
│   ├── staking/          # 스테이킹 (Phase 13)
│   ├── prediction/       # 예측 시장 (Phase 14)
│   └── payments/         # 결제 (Phase 15)
├── smart-account/        # Smart Account (Phase 9)
│   ├── adapters/
│   │   ├── EmbeddedAdapter.ts
│   │   ├── ZkLoginAdapter.ts
│   │   └── PasskeyAdapter.ts
│   └── core/
└── pages/
    ├── TradePage.tsx
    ├── PortfolioPage.tsx
    ├── PerpsPage.tsx
    ├── LendPage.tsx
    └── PredictPage.tsx
```

---

## 우선순위 결정 기준

### Tier 1 (즉시)
- ✅ 사용자 획득에 직접적 영향
- ✅ Unified Finance 비전 핵심
- ✅ 현재 인프라로 구현 가능

### Tier 2 (2~4주)
- ✅ 수익 창출 가능
- ✅ 경쟁 우위 확보
- ⚠️ 새로운 컨트랙트 필요

### Tier 3 (4주+)
- ✅ 생태계 확장
- ⚠️ 외부 의존성 있음
- ⚠️ 규제 고려 필요

---

## 변경 이력

| 날짜 | 변경 내용 |
|------|----------|
| 2025-12-26 | 초안 작성 (Phase 6-10 계획) |
| 2025-12-26 | Phase 6 완료: NASUN 입금/출금 멀티풀 지원 |
| 2025-12-27 | 문서 전면 개편: Unified Onchain Finance 비전 기반 우선순위 재정렬 |
| 2025-12-28 | Phase 15.1 완료: 즉시 전송 (Immediate Transfer) |
| 2025-12-28 | Phase 6 완료 (실시간 거래, MA, P&L), Phase 7 완료 (포트폴리오, 자산현황) |
| 2025-12-28 | Phase 8.2 완료: 다크/라이트 테마 전환 |
| 2025-12-28 | Phase 15.3 완료: QR 코드 결제 (PaymentQRCode, Send/Receive 탭) |
| 2025-12-28 | Phase 7.4 완료: 거래 통계/내역 (TradeStats, RecentTrades, useTradeHistory) |
| 2025-12-29 | Phase 14 완료: Prediction Market MVP (14.1~14.5) |
| 2025-12-29 | Phase 8.1 완료: 모바일 반응형 최적화 (햄버거 메뉴, 그리드 반응형) |
