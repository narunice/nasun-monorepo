# Pado 앱 비전 vs 현실 분석 보고서 v2

> 분석일: 2026-01-04
> 참조: PADO-pitchdeck-ak01.pdf, CEX/Perp DEX 트렌드 분석
> 목적: 현재 구현 상태가 비전에 부합하는지 평가 및 전략적 로드맵 재정의

---

## 1. Pado 제품 전략 선언

### 핵심 명제

> **Pado = Decentralized Prime Brokerage + Unified Account**
>
> "One account. One margin pool. Every asset works harder."

### Pado Core vs Pado Apps 분리

```
┌─────────────────────────────────────────────────────────────────────┐
│                         PADO ARCHITECTURE                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                      PADO APPS (Verticals)                     │  │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐  │  │
│  │  │  Spot   │ │  Perp   │ │ Predict │ │ Lending │ │ Staking │  │  │
│  │  │ Trading │ │ Trading │ │ Markets │ │  Pools  │ │  Yield  │  │  │
│  │  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘  │  │
│  └───────┼──────────┬┼──────────┬┼──────────┬┼──────────┬┼───────┘  │
│          │          ││          ││          ││          ││          │
│          └──────────┴┴──────────┴┴──────────┴┴──────────┴┘          │
│                                  │                                   │
│  ┌───────────────────────────────┴───────────────────────────────┐  │
│  │                       PADO CORE (Infra)                        │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │  │
│  │  │   Smart     │  │   Unified   │  │    Risk     │            │  │
│  │  │   Account   │  │   Margin    │  │   Engine    │            │  │
│  │  │             │  │    Pool     │  │             │            │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘            │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │  │
│  │  │  Payments   │  │   Oracle    │  │ Settlement  │            │  │
│  │  │   Layer     │  │   Layer     │  │   Layer     │            │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘            │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                  │                                   │
│  ┌───────────────────────────────┴───────────────────────────────┐  │
│  │                    NASUN BLOCKCHAIN (L1)                       │  │
│  │         Parallel Execution • Subsecond Finality                │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**핵심 원칙:**
- Pado Apps는 Pado Core를 검증하는 vertical
- 모든 Apps는 동일한 Unified Margin Pool을 공유
- Apps 추가/제거는 Core에 영향 없이 가능

---

## 2. Unified Account & Margin: 제품의 절대적 중심축

### 2.1 CEX/Perp DEX에서 배우는 Unified Margin 요구사항

| 요소 | OKX/Bybit 방식 | Pado 목표 |
|------|---------------|-----------|
| **단일 계정** | Unified Trading Account | Pado Smart Account |
| **마진 모드** | Cross / Isolated 선택 | Cross 기본, Isolated 옵션 |
| **리스크 단위** | 자산별·시장군별 Risk Unit | Token + Position 기반 |
| **포트폴리오 마진** | Spot+Perp+Options 통합 MMR | Spot+Perp+Prediction 통합 |
| **미실현 손익** | 계정 전체 마진에 즉시 반영 | 실시간 PnL 반영 |

### 2.2 Unified Margin 상세 요구사항

```
┌─────────────────────────────────────────────────────────────────────┐
│                    UNIFIED MARGIN REQUIREMENTS                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Phase 1: Cross Margin Only (MVP)                                   │
│  ├── 단일 계정/잔고                                                  │
│  ├── Spot + Perp 통합 마진                                          │
│  ├── 실시간 미실현 손익 반영                                          │
│  └── 부분 청산 지원                                                  │
│                                                                     │
│  Phase 2: Portfolio Margin                                          │
│  ├── Spot + Perp + Prediction payoff 통합                           │
│  ├── 헤지 포지션 인정 (Long Spot + Short Perp = 낮은 마진)            │
│  ├── 스트레스 테스트 기반 MMR 계산                                    │
│  └── 담보별 Haircut 비율 적용                                        │
│                                                                     │
│  Phase 3: Full Portfolio                                            │
│  ├── Lending yield를 담보로 한 레버리지                               │
│  ├── Staking position의 마진 eligible 처리                           │
│  └── Cross-product 전략 지원 (Carry trade, Event hedge 등)           │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.3 담보 자산별 Haircut 정의

| 자산 | Margin Eligible | Haircut | 비고 |
|------|-----------------|---------|------|
| NASUN (Native) | ✅ Yes | 0% | 기본 담보 |
| NUSDC (Stable) | ✅ Yes | 0% | 스테이블코인 |
| NBTC | ✅ Yes | 10% | 변동성 고려 |
| Spot Position | ✅ Yes | 15% | 유동성 리스크 |
| Perp Unrealized PnL | ✅ Yes | 20% | 실현 전 리스크 |
| Prediction Position | ⚠️ Partial | 50% | 바이너리 payoff |
| Lending Deposit | ✅ Yes | 5% | 이자 수익 인정 |
| Staking Position | ⚠️ Partial | 30% | 언스테이킹 지연 |

---

## 3. Vision Impact vs Effort 매트릭스

### 3.1 우선순위 매트릭스

```
                         HIGH VISION IMPACT
                              ▲
                              │
         ┌────────────────────┼────────────────────┐
         │                    │                    │
         │   ⭐ PRIORITY 1    │   ⭐ PRIORITY 0    │
         │   (해야 하지만     │   (당장 해야 함)   │
         │    시간 필요)      │                    │
         │                    │                    │
         │  • Perp DEX       │  • Unified Margin  │
         │  • Cross-Chain    │  • Smart Account   │
         │  • Portfolio      │  • Risk Engine     │
         │    Margin         │  • 잔고 통합 UI    │
         │                    │                    │
  LOW ◄──┼────────────────────┼────────────────────┼──► HIGH
  EFFORT │                    │                    │   EFFORT
         │   PRIORITY 3      │   PRIORITY 2       │
         │   (선택적)         │   (Core 이후)      │
         │                    │                    │
         │  • 차트 인디케이터 │  • Oracle 통합     │
         │  • 테마/모바일     │  • 청산 엔진       │
         │  • Prediction     │  • 펀딩 레이트     │
         │    시드 유동성     │  • Keeper 인프라   │
         │                    │                    │
         └────────────────────┼────────────────────┘
                              │
                              ▼
                         LOW VISION IMPACT
```

### 3.2 Phase별 비전 기여도 재평가

| Phase | 기능 | 비전 기여도 | 현재 상태 | 전략적 위치 |
|-------|------|------------|----------|------------|
| **16** | **Unified Margin** | ⭐⭐⭐⭐⭐ | ❌ 미구현 | **Pado의 정의 그 자체** |
| **11** | Perpetuals | ⭐⭐⭐⭐ | ❌ 미구현 | Core를 검증하는 첫 번째 고난도 vertical |
| 0-5 | Spot DEX Infra | ⭐⭐⭐ | ✅ 완료 | Foundation |
| 9 | zkLogin | ⭐⭐⭐ | ✅ 완료 | Seedless auth 달성 |
| 12 | Lending Pool | ⭐⭐ | ✅ 완료 | Core 통합 시 가치 상승 |
| 13 | Staking | ⭐⭐ | ✅ 완료 | Core 통합 시 가치 상승 |
| 14 | Prediction | ⭐⭐ | ⚠️ MVP | Core 통합 시 가치 상승 |
| 15 | Payments | ⭐⭐ | ✅ 완료 | 기본 기능 |
| 6 | Trading UX Pro | ⭐ | ✅ 완료 | Retention용, 차별화 아님 |
| 7 | Portfolio Dashboard | ⭐ | ✅ 완료 | Core 통합 시 재설계 필요 |
| 8 | Mobile/Theme | ⭐ | ✅ 완료 | 기본 품질 |

---

## 4. 현재 상태: 핵심 문제 진단

### 4.1 잔고 이원화 문제 (Critical)

**현재 아키텍처의 근본적 결함:**

```
현재: 탭별 분리된 잔고 관리
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  [Trade 탭]                      [Predict/Earn/Wallet 탭]
       │                                    │
       ▼                                    ▼
┌─────────────────────┐          ┌─────────────────────┐
│   BalanceManager    │          │     Wallet 잔고      │
│    (DeepBook)       │          │    (직접 사용)       │
│                     │          │                     │
│  "Deposit Required" │          │   "Instant Access"  │
└─────────────────────┘          └─────────────────────┘
         │                                  │
         ▼                                  ▼
    Spot Trading              Prediction/Lending/Staking

⚠️ 이것은 Pado가 해결하려던 "Fragmented DeFi" 문제 그 자체!
```

**목표 아키텍처:**

```
목표: 단일 Portfolio View 중심
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

                    ┌─────────────────────────────────┐
                    │         PORTFOLIO VIEW          │
                    │   (항상 상단에 고정 표시)         │
                    │                                 │
                    │  Net Account Value: $10,000     │
                    │  ├── Available:     $5,000      │
                    │  ├── In Orders:     $2,000      │
                    │  ├── In Positions:  $1,500      │
                    │  ├── In Prediction: $1,000      │
                    │  └── Earning Yield: $500        │
                    │                                 │
                    │  Margin Level: 245%  🟢 Healthy │
                    └─────────────────────────────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              │                    │                    │
              ▼                    ▼                    ▼
        ┌──────────┐        ┌──────────┐        ┌──────────┐
        │  Trade   │        │  Earn    │        │ Predict  │
        │          │        │          │        │          │
        │ Buy/Sell │        │ Lend     │        │ Yes/No   │
        │ Long/Sht │        │ Stake    │        │ Markets  │
        └──────────┘        └──────────┘        └──────────┘

        모든 액션이 동일한 Unified Margin Pool에서 실행
        별도 입금/출금 없이 즉시 사용 가능
```

### 4.2 비전 부합도 점수 (v2)

| 영역 | 점수 | 비전 임팩트 | 상태 |
|------|------|------------|------|
| **Unified Margin** | **0%** | ⭐⭐⭐⭐⭐ | ❌ **핵심 미구현** |
| **Smart Account** | **30%** | ⭐⭐⭐⭐⭐ | ⚠️ 잔고 이원화 |
| **Risk Engine** | **0%** | ⭐⭐⭐⭐ | ❌ 미구현 |
| Perpetuals | 0% | ⭐⭐⭐⭐ | ❌ 미구현 |
| Spot Trading | 80% | ⭐⭐⭐ | ⚠️ 별도 BalanceManager |
| zkLogin | 100% | ⭐⭐⭐ | ✅ 완료 |
| Lending | 60% | ⭐⭐ | ⚠️ Core 통합 대기 |
| Staking | 70% | ⭐⭐ | ⚠️ Core 통합 대기 |
| Prediction | 60% | ⭐⭐ | ⚠️ Core 통합 대기 |
| Payments | 80% | ⭐⭐ | ✅ 기능 완료 |

**전체 비전 부합도: 약 40%** (Core 미구현으로 하향 조정)

---

## 5. UI/UX 전략: Portfolio-Centric Design

### 5.1 현재 vs 목표 UI 패러다임

| 현재 | 목표 (2025 CEX 트렌드) |
|------|----------------------|
| 탭 분리형 (Trade/Earn/Predict) | Portfolio View 중심 |
| 탭마다 다른 잔고 표시 | 하나의 Net Account Value |
| BalanceManager에 "입금" 개념 | "Enable Trading Balance" 라벨링 |
| 기능별 페이지 분리 | Positions 섹션에 모든 상품 통합 |

### 5.2 단기 UI 개선 (Option C 강화)

**즉시 적용 가능한 변경:**

1. **상단 Portfolio Header 고정**
   ```
   ┌─────────────────────────────────────────────────────┐
   │  Net Value: $10,000  │  Available: $5,000  │  🟢   │
   └─────────────────────────────────────────────────────┘
   ```
   - 탭이 바뀌어도 이 헤더는 항상 표시
   - Wallet + BalanceManager 잔고 합산 표시

2. **라벨링 변경**
   - "Deposit to BalanceManager" → "Enable Trading Balance"
   - "Withdraw from BalanceManager" → "Release to Wallet"
   - 사용자에게 "두 개의 다른 잔고"가 아닌 "하나의 계정 내 서브슬롯"처럼 인식

3. **Portfolio를 홈 화면으로**
   - 현재: Trade 탭이 기본
   - 목표: Portfolio/Home 탭이 기본, 모든 상품 PnL/포지션 한눈에

### 5.3 중기 UI 재설계

**Portfolio-Centric Layout:**

```
┌─────────────────────────────────────────────────────────────────┐
│  PADO                               [🔔] [👤] [Connect Wallet]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  NET ACCOUNT VALUE                            $10,000   │   │
│  │  ├── Available Margin          $5,000   ███████████░░░  │   │
│  │  ├── In Spot Orders            $2,000   ████░░░░░░░░░░  │   │
│  │  ├── In Perp Positions         $1,500   ███░░░░░░░░░░░  │   │
│  │  ├── In Prediction             $1,000   ██░░░░░░░░░░░░  │   │
│  │  └── Earning Yield               $500   █░░░░░░░░░░░░░  │   │
│  │                                                          │   │
│  │  Margin Level: 245%  🟢 Healthy    24h PnL: +$150 (+1.5%)│   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  POSITIONS                                    [+ New]    │  │
│  ├──────────────────────────────────────────────────────────┤  │
│  │  Type    │  Market      │  Side  │  Size   │  PnL       │  │
│  ├──────────┼──────────────┼────────┼─────────┼────────────┤  │
│  │  Spot    │  NBTC/NUSDC  │  Long  │  0.5    │  +$50      │  │
│  │  Perp    │  BTC-PERP    │  Short │  0.2    │  -$20      │  │
│  │  Predict │  BTC > 150k  │  YES   │  100    │  +$15      │  │
│  │  Lend    │  NUSDC Pool  │  --    │  $500   │  +$2 (APY) │  │
│  └──────────┴──────────────┴────────┴─────────┴────────────┘  │
│                                                                 │
│  [Trade]  [Earn]  [Predict]  [Send]                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6. Perp DEX: Unified Margin을 검증하는 첫 번째 Vertical

### 6.1 Perp DEX의 전략적 위치 재정의

> **Perp DEX ≠ 별도의 새로운 제품**
> **Perp DEX = Unified Margin의 실전 검증 수단**

Hyperliquid, dYdX 스타일에서 "마진/리스크 엔진이 곧 제품"이다. Perp를 구현하면서 자연스럽게 Unified Margin의 핵심 기능이 완성된다.

### 6.2 Cross-Product 전략 예시

| 전략 | 설명 | Unified Margin 필요성 |
|------|------|---------------------|
| **Carry Trade** | Spot Long + Perp Short | 헤지 인정으로 마진 절감 |
| **Event Hedge** | Prediction YES + Perp Short | 이벤트 리스크 상쇄 |
| **Yield Leverage** | Lending yield 담보로 Perp | 수익 극대화 |
| **Basis Trade** | Spot + Perp funding 차익 | 저위험 수익 |

### 6.3 Perp 구현 우선순위 (재정렬)

```
Step 0: Unified Margin 최소 기능 정의
        ├── Cross margin only (Isolated는 Phase 2)
        ├── Linear perp + Spot 중심
        └── 단일 계정 잔고

Step 1: Oracle + Risk Engine PoC
        ├── Pyth Network 연동
        ├── Mark Price 계산 (TWAP)
        ├── Maintenance Margin Rate 정의
        └── Partial Liquidation 로직

Step 2: Perp v0 + Unified Account 통합
        ├── 소수 마켓 (BTC-PERP, ETH-PERP)
        ├── 저레버리지 (최대 10x)
        ├── 단순 펀딩 레이트 (8시간)
        └── BalanceManager 통합

Step 3: Portfolio Margin 확장
        ├── Spot + Perp 헤지 인정
        ├── Prediction payoff를 Risk Engine에 편입
        └── Lending/Staking의 margin eligible 처리
```

---

## 7. 개발 로드맵 재정의

### 7.1 시대 구분

| 시대 | Phase | 목표 | 기간 |
|------|-------|------|------|
| **Foundation Era** | 0-10 | Nasun L1 + Spot DEX + Auth | ✅ 완료 |
| **Vertical Era** | 11-15 | Apps 구현 (Perp, Lend, Stake, Predict, Pay) | ⚠️ 부분 완료 |
| **Core Era** | 16+ | **Unified Account & Margin 완성** | 📋 시작 필요 |

### 7.2 권장 구현 순서

```
IMMEDIATE (1-2주)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
├── [UI] 상단 Portfolio Header 추가
├── [UI] BalanceManager 라벨링 변경
├── [Prediction] 시드 유동성 배치
└── [Research] Oracle 옵션 조사 (Pyth, Switchboard)

SHORT-TERM (3-4주)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
├── [Core] Unified Margin Pool 스마트컨트랙트 v0
├── [Core] Smart Account 통합 (Wallet + BalanceManager 병합)
├── [Oracle] Pyth Network 연동 PoC
└── [UI] Portfolio View 홈 화면 구현

MID-TERM (5-8주)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
├── [Perp] 마진 시스템 (Cross margin only)
├── [Perp] 펀딩 레이트 메커니즘
├── [Perp] 청산 엔진 (부분 청산)
├── [Core] Risk Engine v1
└── [Integration] Spot/Perp/Prediction 통합

LONG-TERM (9-12주)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
├── [Core] Portfolio Margin (헤지 인정)
├── [Core] Lending/Staking margin eligible 처리
├── [Perp] Isolated margin 옵션
└── [Perp] 추가 마켓 (ETH-PERP, SOL-PERP)
```

---

## 8. 결론

### 전략적 선언

1. **Unified Account & Margin = Pado의 정의**
   - 모든 다른 기능은 이 Core를 검증하는 vertical
   - Core 없이 Apps만 있으면 "또 하나의 fragmented DeFi"

2. **Perp DEX는 Unified Margin의 첫 번째 시험**
   - 별도 제품이 아닌 Core 검증 수단
   - 마진/리스크 엔진이 곧 제품

3. **UI/UX는 Portfolio-Centric으로 전환**
   - 탭 분리가 아닌 하나의 Net Account Value 중심
   - 모든 포지션이 하나의 Positions 섹션에

### 비전 달성을 위한 핵심 마일스톤

| 마일스톤 | 설명 | 비전 기여도 |
|----------|------|------------|
| M1 | Portfolio Header UI | ⭐⭐ (인지적 통합) |
| M2 | Unified Margin Pool v0 | ⭐⭐⭐⭐⭐ (핵심) |
| M3 | Perp v0 + 통합 | ⭐⭐⭐⭐ (검증) |
| M4 | Portfolio Margin | ⭐⭐⭐⭐⭐ (완성) |

### 성공 지표

- [ ] 사용자가 "두 개의 잔고"를 인지하지 않음
- [ ] 모든 상품에서 동일한 margin pool 사용
- [ ] Spot + Perp 헤지 시 마진 절감 체감
- [ ] "One account, One margin pool" 실현

---

*이 문서는 CEX/Perp DEX 트렌드 분석을 반영하여 Pado의 전략적 방향을 재정의합니다.*
*Perplexity AI 피드백 반영 v2*
*마지막 업데이트: 2026-01-04*
