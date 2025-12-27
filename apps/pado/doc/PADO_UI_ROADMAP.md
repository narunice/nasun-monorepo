# Pado UI/UX 개선 로드맵

> 작성일: 2025-12-26
> 상태: Phase 2 완료, Phase 3 예정

## 현재 상태 요약

**구현 완료:**
- ✅ 핵심 거래 (지정가/시장가 주문, 취소)
- ✅ 오더북 실시간 표시
- ✅ BalanceManager 관리
- ✅ 미체결 주문 관리
- ✅ 지갑 연결 모달 (Header 이동 완료)
- ✅ **주문 확인 모달** (Phase 1.1)
- ✅ **Toast 알림 시스템** (Phase 1.2)
- ✅ **Limit/Market 주문 탭** (Phase 1.3)
- ✅ **캔들스틱 차트** (Phase 2.1) - TradingView Lightweight Charts
- ✅ **거래 히스토리** (Phase 2.2) - 실시간 거래 목록
- ✅ **오더북 가격 클릭** (Phase 2.3) - 주문 폼 자동 입력
- ✅ **Depth Chart** (Phase 2.3) - 누적 물량 시각화
- ✅ **호가 갯수 조절** (Phase 2.3) - 5/10/20 선택

**미구현:**
- ❌ 슬리피지/고급 주문 옵션 UI
- ❌ 토큰 선택 UI (현재 NBTC/NUSDC 고정)

---

## CEX vs DEX 분석

### CEX 장점 (Pado에 적용할 것)

| 거래소 | 장점 | Pado 적용 |
|--------|------|----------|
| **Upbit** | 실시간 오더북, 캔들스틱 차트, 저지연 | 차트 추가, 오더북 개선 |
| **Binance** | Lite/Pro 모드, 거래 히스토리, 통계 | 심플/프로 모드 고려 |
| **Coinbase** | 깔끔한 UX, 초보자 친화적 | 직관적인 폼 디자인 |

### DEX 장점 (Pado 강화할 것)

| 거래소 | 장점 | Pado 적용 |
|--------|------|----------|
| **Uniswap** | 원클릭 스왑, 심플 | 시장가 주문 간편화 |
| **SushiSwap** | DCA/Limit, 수수료 표시 | 주문 유형 선택 UI |
| **1inch** | 가격 비교, 슬리피지 설정 | 슬리피지 설정 추가 |

### 각각의 단점과 Pado 해결책

| 플랫폼 | 단점 | Pado 해결책 |
|--------|------|------------|
| **CEX** | 커스터디, 출금 제한 | Self-custody 지갑 (임베디드) |
| **CEX** | 복잡한 KYC | 지갑만으로 즉시 거래 |
| **DEX** | 복잡한 온보딩 | 임베디드 지갑 (패스워드만) |
| **DEX** | 느린 체결 | Nasun Network + CLOB |
| **DEX** | 슬리피지 불확실 | 지정가 주문 기본 |

---

## 구현 우선순위

### Phase 1: 필수 UX 개선 (즉시)

**1.1 주문 확인 모달** ⭐ 최우선
- 사용자 실수 방지
- 주문 요약: 방향, 가격, 수량, 예상 비용
- "확인" 버튼으로 최종 실행
- CEX 수준의 안전장치

**1.2 거래 결과 Toast/Notification**
- 현재: 폼 아래 메시지 표시
- 개선: 화면 우측 상단 Toast
- 자동 사라짐 (5초)
- 성공/실패 색상 구분

**1.3 시장가 주문 간편화**
- 현재: 가격 입력 필수
- 개선: "Market" 탭 추가
- 금액만 입력하면 즉시 체결
- Uniswap 스타일 간편 UX

### Phase 2: 정보 강화 (1주 내)

**2.1 캔들스틱 차트** ⭐ 핵심
- TradingView Lightweight Charts 사용
- OHLC 데이터 구성 (오더북 기반)
- 시간 간격 선택: 1m, 5m, 15m, 1h, 1d
- CEX 수준의 차트 제공

**2.2 거래 히스토리**
- 최근 거래 목록 (Pool 이벤트)
- 내 거래 내역 (BalanceManager 기준)
- 시간, 가격, 수량, 방향 표시

**2.3 오더북 개선**
- Depth Chart 추가 (누적 물량 시각화)
- 가격 레벨 클릭 → 주문 폼 자동 입력
- 호가 갯수 조절 (5/10/20)

### Phase 3: 고급 기능 (2주 내)

**3.1 주문 유형 선택**
- Limit (기본)
- Market (즉시 체결)
- IOC (Immediate or Cancel)
- FOK (Fill or Kill)
- POST_ONLY (Maker only)

**3.2 슬리피지 설정**
- 시장가 주문 시 활성화
- 0.1%, 0.5%, 1%, Custom
- 예상 체결 범위 표시

**3.3 가격 제안 기능**
- Mid Price 원클릭 입력
- Best Bid/Ask 버튼
- ±1%, ±5% 조절 버튼

### Phase 4: 프로 기능 (향후)

**4.1 레이아웃 커스터마이징**
- Binance 스타일 드래그앤드롭
- 차트/오더북/폼 배치 변경
- 설정 저장

**4.2 다중 풀 지원**
- 토큰 선택 드롭다운
- 풀 목록 표시
- 풀 별 통계

**4.3 포트폴리오 대시보드**
- 전체 자산 현황
- 손익 계산
- 거래 통계

---

## 구현 순서 (권장)

```
Week 1
├── 1. 주문 확인 모달 (OrderConfirmModal.tsx)
├── 2. Toast 알림 시스템 (Toast.tsx, useToast.ts)
└── 3. 시장가 주문 탭 (OrderForm 확장)

Week 2
├── 4. 캔들스틱 차트 (PriceChart.tsx)
├── 5. 거래 히스토리 (TradeHistory.tsx)
└── 6. 오더북 클릭 입력 (Orderbook 개선)

Week 3+
├── 7. 주문 유형 선택 UI
├── 8. 슬리피지 설정
└── 9. 가격 제안 버튼
```

---

## 핵심 파일 (수정 예상)

| 파일 | 변경 내용 |
|------|----------|
| `App.tsx` | Toast Provider 추가, 레이아웃 조정 |
| `features/trading/components/OrderForm.tsx` | Market 탭, 확인 모달 연동 |
| `features/trading/components/Orderbook.tsx` | 클릭 이벤트, Depth Chart |
| `features/trading/components/OrderConfirmModal.tsx` | **신규 생성** |
| `features/trading/components/PriceChart.tsx` | **신규 생성** |
| `features/trading/components/TradeHistory.tsx` | **신규 생성** |
| `components/common/Toast.tsx` | **신규 생성** |
| `lib/deepbook.ts` | 차트 데이터 조회 함수 추가 |

---

## 디자인 원칙

1. **CEX 수준의 정보 밀도** + **DEX의 간편한 온보딩**
2. **기본값은 간단하게**, 고급 옵션은 숨김
3. **실수 방지**: 확인 모달, 슬리피지 경고
4. **실시간 피드백**: 체결 알림, 잔고 업데이트
5. **모바일 고려**: 반응형 레이아웃

---

## 변경 이력

| 날짜 | 변경 내용 |
|------|----------|
| 2025-12-26 | 초안 작성 (Phase 1~4 계획) |
| 2025-12-26 | Phase 1 완료: 주문 확인 모달, Toast 알림, Limit/Market 탭 |
| 2025-12-26 | Phase 2 완료: 캔들스틱 차트, 거래 히스토리, 오더북 가격 클릭 |
| 2025-12-26 | Phase 2.3 보완: Depth Chart, 호가 갯수 조절 추가 |
