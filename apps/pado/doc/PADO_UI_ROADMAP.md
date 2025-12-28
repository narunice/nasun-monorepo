# Pado UI/UX 개선 로드맵

> 작성일: 2025-12-26
> 최종 업데이트: 2025-12-28
> 비전: CEX-Grade UX, DEX-Level Transparency

---

## 현재 상태 요약 (2025-12-27)

### 구현 완료 ✅

**거래 UI (Trading UI)**
- ✅ 지정가/시장가 주문 (Limit/Market 탭)
- ✅ 고급 주문 옵션 (GTC, IOC, FOK, POST_ONLY)
- ✅ 오더북 실시간 표시 (5/10/20 depth)
- ✅ 오더북 가격 클릭 → 주문폼 자동 입력
- ✅ Depth Bar (누적 물량 시각화)
- ✅ 캔들스틱 차트 (Lightweight Charts)
- ✅ 거래 히스토리 (최근 거래 목록)

**주문 UX (Order UX)**
- ✅ 주문 확인 모달
- ✅ Toast 알림 시스템
- ✅ 가격 제안 버튼 (Mid, Best Bid, Best Ask)
- ✅ 슬리피지 설정 UI

**잔고 관리 (Balance Management)**
- ✅ BalanceManager 생성/관리
- ✅ 토큰 입금/출금 (NBTC, NUSDC, NASUN)
- ✅ 다중 토큰 잔고 표시

**마켓 선택 (Market Selection)**
- ✅ 마켓 선택 드롭다운
- ✅ NBTC/NUSDC, NASUN/NUSDC 풀 지원

**지갑 (Wallet)**
- ✅ Header에 WalletConnect 통합
- ✅ Faucet 버튼 (NASUN + Token)

### 최근 구현 ✅ (2025-12-28)

- ✅ 실시간 거래 이벤트 (시뮬레이션)
- ✅ 차트 이동평균선 (MA 5/20/60)
- ✅ 포트폴리오 대시보드 (/portfolio)
- ✅ 토큰 전송 페이지 (/send)
- ✅ Spinner 컴포넌트
- ✅ 토큰 아이콘 색상 통일
- ✅ 드롭다운 화살표 트랜지션 개선
- ✅ 다크/라이트 테마 전환 (Phase 8.2)
- ✅ 시스템 테마 감지 (prefers-color-scheme)
- ✅ localStorage 테마 저장

### 미구현 ❌

- ❌ 모바일 반응형 최적화
- ❌ 거래량 차트 (Volume)
- ❌ 추가 기술 지표 (RSI, MACD)

---

## UI 컴포넌트 현황

### 구현된 컴포넌트 (11개)

| 컴포넌트 | 파일 | 상태 | 설명 |
|---------|------|------|------|
| OrderForm | `OrderForm.tsx` | ✅ 완료 | 주문 입력 폼 (Limit/Market) |
| Orderbook | `Orderbook.tsx` | ✅ 완료 | 호가창 + Depth Bar |
| PriceChart | `PriceChart.tsx` | ✅ 완료 | 캔들스틱 차트 |
| TradeHistory | `TradeHistory.tsx` | ✅ 완료 | 거래 내역 |
| OpenOrders | `OpenOrders.tsx` | ✅ 완료 | 미체결 주문 |
| BalanceManagerCard | `BalanceManagerCard.tsx` | ✅ 완료 | BM 상태 + 입출금 |
| MarketSelector | `MarketSelector.tsx` | ✅ 완료 | 마켓 선택 |
| OrderConfirmModal | `OrderConfirmModal.tsx` | ✅ 완료 | 주문 확인 |
| PriceSuggestions | `PriceSuggestions.tsx` | ✅ 완료 | 빠른 가격 선택 |
| SlippageSettings | `SlippageSettings.tsx` | ✅ 완료 | 슬리피지 설정 |
| PoolInfo | `PoolInfo.tsx` | ✅ 완료 | 풀 정보 표시 |

### 공통 컴포넌트 (4개)

| 컴포넌트 | 파일 | 상태 | 설명 |
|---------|------|------|------|
| Toast | `Toast.tsx` | ✅ 완료 | 알림 메시지 |
| Button | `Button.tsx` | ✅ 완료 | 공통 버튼 |
| Input | `Input.tsx` | ✅ 완료 | 공통 입력 필드 |
| Spinner | `Spinner.tsx` | ✅ 완료 | 로딩 상태 표시 |

---

## CEX vs DEX 분석

### CEX 장점 (Pado에 적용 완료)

| 거래소 | 장점 | Pado 적용 | 상태 |
|--------|------|----------|------|
| **Upbit** | 실시간 오더북, 캔들스틱 차트 | 차트 + 오더북 | ✅ |
| **Binance** | Lite/Pro 모드, 거래 히스토리 | 거래 내역 | ✅ |
| **Coinbase** | 깔끔한 UX, 초보자 친화적 | 직관적 폼 | ✅ |

### DEX 장점 (Pado 강화 완료)

| 거래소 | 장점 | Pado 적용 | 상태 |
|--------|------|----------|------|
| **Uniswap** | 원클릭 스왑 | 시장가 주문 | ✅ |
| **SushiSwap** | 수수료 표시 | 풀 정보 | ✅ |
| **1inch** | 슬리피지 설정 | 슬리피지 UI | ✅ |

### Pado 차별화 포인트

| 기존 문제 | Pado 해결책 | 상태 |
|----------|------------|------|
| CEX: 커스터디 위험 | Self-custody 지갑 | ✅ |
| CEX: 복잡한 KYC | 지갑만으로 즉시 거래 | ✅ |
| DEX: 복잡한 온보딩 | Embedded Wallet (패스워드만) | ✅ |
| DEX: 느린 체결 | Nasun Network + CLOB | ✅ |
| DEX: 슬리피지 불확실 | 지정가 주문 기본 | ✅ |

---

## UI 개선 로드맵

### Phase 3: 고급 기능 (현재)

**3.1 실시간 데이터** ⭐ 다음 단계

| 작업 | 설명 | 난이도 | 상태 |
|------|------|--------|------|
| 블록체인 이벤트 구독 | WebSocket 실시간 업데이트 | 중 | 📋 |
| 실시간 차트 업데이트 | 시뮬레이션 → 실제 데이터 | 중 | 📋 |
| 실시간 거래 내역 | 시뮬레이션 → 실제 이벤트 | 중 | 📋 |

**3.2 차트 고급화**

| 작업 | 설명 | 난이도 | 상태 |
|------|------|--------|------|
| 이동평균선 (MA) | 5, 20, 60 MA | 저 | 📋 |
| 거래량 표시 | Volume Bar | 저 | 📋 |
| 기술 지표 | RSI, MACD | 중 | 📋 |

**3.3 가격 제안 고급화**

| 작업 | 설명 | 난이도 | 상태 |
|------|------|--------|------|
| ±1%, ±5% 버튼 | 가격 조절 버튼 | 저 | 📋 |
| 최근 체결가 | 마지막 거래 가격 | 저 | 📋 |

---

### Phase 4: 프로 기능 (예정)

**4.1 포트폴리오 대시보드** ⭐

| 작업 | 설명 | 난이도 | 상태 |
|------|------|--------|------|
| 전체 자산 현황 | 토큰별 잔고 + USD 환산 | 중 | 📋 |
| 손익 계산 (P&L) | 포지션별 수익률 | 중 | 📋 |
| 거래 통계 | 총 거래량, 평균 체결가 | 중 | 📋 |
| 거래 내역 조회 | 필터링, 페이지네이션 | 중 | 📋 |

**4.2 레이아웃 커스터마이징**

| 작업 | 설명 | 난이도 | 상태 |
|------|------|--------|------|
| 드래그앤드롭 | 패널 배치 변경 | 고 | 📋 |
| 설정 저장 | localStorage 저장 | 저 | 📋 |
| 프리셋 | 기본/Pro 레이아웃 | 중 | 📋 |

**4.3 다중 마켓 뷰**

| 작업 | 설명 | 난이도 | 상태 |
|------|------|--------|------|
| 마켓 목록 | 전체 풀 목록 | 저 | 📋 |
| 24h 변동률 | 가격 변화 표시 | 중 | 📋 |
| 거래량 순위 | 인기 마켓 정렬 | 중 | 📋 |

---

### Phase 5: 모바일 & 테마 (예정)

**5.1 모바일 반응형**

| 작업 | 설명 | 난이도 | 상태 |
|------|------|--------|------|
| 반응형 레이아웃 | 768px 이하 최적화 | 중 | 📋 |
| 터치 최적화 | 탭/스와이프 제스처 | 중 | 📋 |
| 모바일 내비게이션 | 바텀 탭바 | 저 | 📋 |

**5.2 테마 시스템**

| 작업 | 설명 | 난이도 | 상태 |
|------|------|--------|------|
| 다크 테마 | 기본 테마 | ✅ | 완료 |
| 라이트 테마 | 밝은 테마 옵션 | 저 | 📋 |
| 테마 전환 | 토글 스위치 | 저 | 📋 |
| 시스템 설정 연동 | prefers-color-scheme | 저 | 📋 |

---

## 핵심 파일 목록

### 현재 구현된 파일

```
frontend/src/
├── features/trading/
│   ├── components/
│   │   ├── OrderForm.tsx          # 주문 폼 (~200줄)
│   │   ├── Orderbook.tsx          # 오더북 (~150줄)
│   │   ├── PriceChart.tsx         # 차트 (~200줄)
│   │   ├── TradeHistory.tsx       # 거래 내역 (~100줄)
│   │   ├── OpenOrders.tsx         # 미체결 주문 (~100줄)
│   │   ├── BalanceManagerCard.tsx # BM 관리 (~150줄)
│   │   ├── MarketSelector.tsx     # 마켓 선택 (~80줄)
│   │   ├── OrderConfirmModal.tsx  # 주문 확인 (~100줄)
│   │   ├── PriceSuggestions.tsx   # 가격 제안 (~60줄)
│   │   ├── SlippageSettings.tsx   # 슬리피지 (~80줄)
│   │   └── PoolInfo.tsx           # 풀 정보 (~50줄)
│   ├── containers/
│   │   ├── BalancePanel.tsx       # 상단 잔고
│   │   ├── MarketPanel.tsx        # 차트+오더북
│   │   └── TradingPanel.tsx       # 주문+BM
│   ├── context/
│   │   ├── MarketContext.tsx      # 마켓 상태
│   │   └── OrderFormContext.tsx   # 주문폼 상태
│   └── hooks/
│       ├── useOrderbook.ts        # 오더북 데이터
│       ├── useOrderActions.ts     # 주문 액션
│       ├── useFaucet.ts           # Faucet 로직
│       └── useOpenOrders.ts       # 미체결 주문
├── components/
│   ├── common/
│   │   ├── Toast.tsx              # 토스트
│   │   ├── Button.tsx             # 버튼
│   │   └── Input.tsx              # 입력 필드
│   └── layout/
│       ├── Header.tsx             # 헤더
│       └── ErrorBoundary.tsx      # 에러 처리
└── pages/
    └── TradePage.tsx              # 메인 페이지
```

### 향후 추가 예상 파일

```
frontend/src/
├── features/
│   ├── trading/
│   │   └── components/
│   │       ├── TechnicalIndicators.tsx  # 기술 지표
│   │       └── VolumeChart.tsx          # 거래량 차트
│   └── portfolio/                       # Phase 4
│       ├── components/
│       │   ├── AssetOverview.tsx
│       │   ├── PnLChart.tsx
│       │   └── TradeHistory.tsx
│       └── PortfolioPage.tsx
├── hooks/
│   └── useTheme.ts                      # 테마 훅
└── pages/
    └── PortfolioPage.tsx
```

---

## 디자인 원칙

### 1. CEX 수준의 정보 밀도 + DEX의 간편한 온보딩
- 전문 트레이더를 위한 풍부한 정보
- 초보자도 쉽게 시작할 수 있는 간편 모드

### 2. 기본값은 간단하게, 고급 옵션은 숨김
- 시장가 주문: 수량만 입력
- 지정가 주문: 가격 + 수량
- 고급 옵션: 접힌 상태로 제공

### 3. 실수 방지
- 주문 확인 모달
- 슬리피지 경고
- 잔고 부족 사전 알림

### 4. 실시간 피드백
- 체결 알림 (Toast)
- 잔고 즉시 업데이트
- 오더북 실시간 갱신

### 5. 모바일 고려
- 반응형 레이아웃
- 터치 친화적 UI
- 핵심 기능 우선 표시

---

## 변경 이력

| 날짜 | 변경 내용 |
|------|----------|
| 2025-12-26 | 초안 작성 (Phase 1~4 계획) |
| 2025-12-26 | Phase 1 완료: 주문 확인 모달, Toast, Limit/Market 탭 |
| 2025-12-26 | Phase 2 완료: 캔들스틱 차트, 거래 히스토리, 오더북 가격 클릭 |
| 2025-12-26 | Phase 2.3 보완: Depth Chart, 호가 갯수 조절 |
| 2025-12-27 | 문서 전면 개편: 현재 구현 현황 반영, UI 로드맵 재정렬 |
| 2025-12-28 | Phase 6, 7 완료 반영, Spinner 컴포넌트 추가, 토큰 전송 페이지 추가 |
| 2025-12-28 | Phase 8.2 완료: 다크/라이트 테마 전환, 시스템 테마 감지 |
