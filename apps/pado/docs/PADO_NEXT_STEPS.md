# Pado 개발 로드맵

> 작성일: 2025-12-26
> 최종 업데이트: 2026-01-10
> 비전: **"One Account. One Margin Pool. Every Asset Works Harder."**

---

## Executive Summary

### 핵심 전략 선언

> **Pado = Decentralized Prime Brokerage + Unified Account**

현재 Pado는 개별 vertical(Spot, Lending, Staking, Prediction)은 구현되었으나, 이들을 통합하는 **Core(Unified Margin)**가 미구현 상태입니다. 이로 인해 비전 부합도는 **약 40%** 수준입니다.

### 핵심 문제: 잔고 이원화

```
현재 문제:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  [Trade 탭]              [Predict/Earn/Wallet 탭]
       │                           │
       ▼                           ▼
┌─────────────────┐      ┌─────────────────┐
│ BalanceManager  │      │   Wallet 잔고    │
│   (DeepBook)    │      │   (직접 사용)    │
│ "Deposit 필요"   │      │ "즉시 사용"      │
└─────────────────┘      └─────────────────┘

⚠️ 이것은 Pado가 해결하려던 "Fragmented DeFi" 문제 그 자체!
```

### 비전 부합도 점수

| 영역 | 점수 | 비전 임팩트 | 상태 |
|------|------|------------|------|
| **Unified Margin** | **80%** | ⭐⭐⭐⭐⭐ | ✅ v1 완료 (Multi-collateral + Risk Engine + Liquidation) |
| **Smart Account** | **70%** | ⭐⭐⭐⭐⭐ | ✅ 잔고 통합 UI 완료 |
| **Risk Engine** | **80%** | ⭐⭐⭐⭐ | ✅ v1 완료 (4-Tier Threshold) |
| **Perpetuals** | **80%** | ⭐⭐⭐⭐ | ✅ Phase 11.4 완료 (청산 엔진 + Keeper) |
| Spot Trading | 80% | ⭐⭐⭐ | ⚠️ 별도 BalanceManager |
| zkLogin | 100% | ⭐⭐⭐ | ✅ 완료 |
| Lending | 60% | ⭐⭐ | ⚠️ Core 통합 대기 |
| Staking | 70% | ⭐⭐ | ⚠️ Core 통합 대기 |
| Prediction | 60% | ⭐⭐ | ⚠️ Core 통합 대기 |
| Payments | 80% | ⭐⭐ | ✅ 기능 완료 |
| Lottery | 100% | ⭐ | ✅ 완료 |

**전체 비전 부합도: 약 72%** (Phase 16 v1 + Phase 11.4 완료 후)

---

## 인프라 리스크 (Devnet 한계)

| 항목 | 현재 상태 | 리스크 | 대응책 |
|------|----------|--------|--------|
| **TPS** | ~21 TPS | 고빈도 거래 불가 | 배치 처리, 오프체인 매칭 |
| **안정성** | V4 리셋 경험 | 데이터 유실 가능 | 롤백 태그 관리 |
| **블록 생성** | ~2초 | 실시간 UX 어려움 | Optimistic UI |
| **RPC** | 단일 노드 | SPOF | 모니터링 강화 |

> ⚠️ **경고**: Devnet은 개발/테스트 전용입니다.
> 프로덕션 출시 전 Testnet → Mainnet 마이그레이션 필요.

---

## 구현 완료 상태

### Era 1: Foundation Era ✅

| Phase | 상태 | 내용 | 완료일 |
|-------|------|------|--------|
| Phase 0 | ✅ | Nasun Devnet V3 리셋 | 2025-12-25 |
| Phase 1 | ✅ | DeepBook V3 배포 + 테스트 토큰 | 2025-12-25 |
| Phase 2 | ✅ | Frontend MVP (오더북, 주문폼, 잔고관리) | 2025-12-25 |
| Phase 3 | ✅ | Trading UX (차트, 가격 클릭, 피드백) | 2025-12-26 |
| Phase 4 | ✅ | Multi-Pool (NASUN/NUSDC 풀) | 2025-12-26 |
| Phase 5 | ✅ | Native Token (NASUN 입금/출금) | 2025-12-26 |
| Phase 9 | ✅ | zkLogin (Google OAuth) | 2026-01-03 |

### Era 2: Vertical Era ✅ (완료)

| Phase | 상태 | 내용 | 비전 기여도 | 완료일 |
|-------|------|------|------------|--------|
| Phase 6 | ✅ | Trading UX Pro (MA, RSI, MACD) | ⭐ | 2025-12-28 |
| Phase 7 | ✅ | Portfolio Dashboard | ⭐ | 2025-12-28 |
| Phase 8 | ✅ | Mobile & Theme | ⭐ | 2025-12-28 |
| Phase 12 | ✅ | Lending Pool (NUSDC) | ⭐⭐ | 2026-01-01 |
| Phase 13 | ✅ | Staking (Native) | ⭐⭐ | 2026-01-01 |
| Phase 14 | ✅ | Prediction Markets | ⭐⭐ | 2026-01-04 |
| Phase 15 | ✅ | Payments (Send, QR) | ⭐⭐ | 2025-12-28 |
| Phase 17 | ✅ | Lottery (Sui Random) | ⭐ | 2026-01-09 |

### Era 3: Core Era ✅ (v1 완료)

| Phase | 상태 | 내용 | 비전 기여도 | 완료일 |
|-------|------|------|------------|--------|
| **Phase 16** | ✅ | **Unified Margin v1** | ⭐⭐⭐⭐⭐ | 2026-01-10 |
| Phase 16.1 | ✅ | Oracle Integration | ⭐⭐⭐⭐⭐ | 2026-01-10 |
| Phase 16.2 | ✅ | Multi-Collateral | ⭐⭐⭐⭐⭐ | 2026-01-10 |
| Phase 16.3 | ✅ | Position Registry + Risk Engine v1 | ⭐⭐⭐⭐⭐ | 2026-01-10 |
| Phase 16.4 | ✅ | Liquidation Engine | ⭐⭐⭐⭐ | 2026-01-10 |
| Phase 16.5 | ✅ | Smart Account UI | ⭐⭐⭐⭐ | 2026-01-10 |
| Phase 16.1c | ✅ | Risk Engine UI Integration | ⭐⭐⭐ | 2026-01-10 |
| **Phase 11** | ✅ | **Perpetuals DEX** | ⭐⭐⭐⭐ | 2026-01-10 |
| Phase 11.1 | ✅ | perpetual.move (PerpMarket, Position) | ⭐⭐⭐ | 2026-01-10 |
| Phase 11.2 | ✅ | funding.move (8h Funding Rate) | ⭐⭐⭐ | 2026-01-10 |
| Phase 11.3 | ✅ | Perp Trading UI | ⭐⭐⭐ | 2026-01-10 |
| Phase 11.4 | ✅ | Perp Liquidation + Keeper | ⭐⭐⭐ | 2026-01-10 |
| Phase 11.5 | 📋 | Spot-Perp Integration | ⭐⭐⭐ | - |

---

## 우선순위 매트릭스

```
                         HIGH VISION IMPACT
                              ▲
                              │
         ┌────────────────────┼────────────────────┐
         │                    │                    │
         │   ⭐ PRIORITY 1    │   ⭐ PRIORITY 0    │
         │   (다음 단계)      │   (완료!)          │
         │                    │                    │
         │  • Perp Trading UI│  • Unified Margin ✅│
         │  • Cross-Chain    │  • Smart Account ✅ │
         │  • Portfolio      │  • Risk Engine ✅   │
         │    Margin         │  • 잔고 통합 UI ✅  │
         │                    │                    │
  LOW ◄──┼────────────────────┼────────────────────┼──► HIGH
  EFFORT │                    │                    │   EFFORT
         │   PRIORITY 3      │   PRIORITY 2       │
         │   (선택적)         │   (완료!)          │
         │                    │                    │
         │  • 차트 인디케이터 │  • Oracle 통합 ✅   │
         │  • 테마/모바일 ✅  │  • 청산 엔진 ✅     │
         │  • Prediction ✅   │  • 펀딩 레이트 ✅   │
         │    시드 유동성     │  • Keeper 인프라 ✅│
         │                    │                    │
         └────────────────────┼────────────────────┘
                              │
                              ▼
                         LOW VISION IMPACT
```

---

## 개발 로드맵 (Vision-Aligned)

### IMMEDIATE (1-2주) - UI/UX Quick Wins

비전에 가까워지는 즉각적인 UX 개선

| 순서 | 작업 | 상태 | 난이도 | 설명 |
|------|------|------|--------|------|
| I.1 | 상단 Portfolio Header 고정 | ✅ | 저 | 탭 전환에도 Net Value 항상 표시 |
| I.2 | BalanceManager 라벨링 변경 | ✅ | 저 | "Add to Trading" / "Return to Wallet" |
| I.3 | Prediction 시드 유동성 | ✅ | 저 | 4개 마켓 오더북 주문 배치 |
| I.4 | Portfolio를 홈 화면으로 | ✅ | 중 | Portfolio-centric HomePage |
| I.5 | DevOracle 구현 | ✅ | 중 | Admin Oracle 배포 + 프론트엔드 연동 |
| I.6 | Price Updater Bot | ✅ | 저 | CoinGecko/Binance API 기반 가격 업데이트 |

**목표 UI:**
```
┌─────────────────────────────────────────────────────┐
│  Net Value: $10,000  │  Available: $5,000  │  🟢   │
└─────────────────────────────────────────────────────┘
         ↑ 이 헤더가 모든 탭에서 항상 표시됨
```

---

### SHORT-TERM ✅ (완료) - Core Foundation

Unified Account & Margin v1 구축 완료

| 순서 | 작업 | 상태 | 난이도 | 설명 |
|------|------|------|--------|------|
| S.1 | **Unified Margin v0** | ✅ 완료 | 중 | Frontend + 온체인 배포 완료 (0x2886424f...) |
| S.2 | **Risk Engine v1** | ✅ 완료 | 중 | 4-Tier Threshold (IM/Warning/MM/FC) |
| S.3 | Smart Account UI 통합 | ✅ 완료 | 중 | HeaderNetValue 구현 |
| S.4 | Multi-Collateral | ✅ 완료 | 중 | NUSDC (0%) + NBTC (10% haircut) |
| S.5 | Liquidation Engine | ✅ 완료 | 고 | 5% 보너스, 50% 최대 청산 |
| S.6 | Position Registry | ✅ 완료 | 중 | 포지션 추적 + PnL 계산 |

**Unified Margin v1 달성:**

| 버전 | 담보 자산 | 연동 상품 | 주요 기능 | 상태 |
|------|----------|----------|----------|------|
| **v0** | NUSDC only | Spot + Prediction | 단일 담보 풀, 잔고 통합 | ✅ 완료 |
| **v1** | NUSDC + NBTC | + Risk Engine | Multi-collateral, Haircut, Liquidation | ✅ 완료 |
| **v2** | 모든 토큰 | + Perp | Portfolio Margin, 헤지 인정 | 📋 예정 |

**Unified Margin v1 구현 (contracts-margin):**
```move
// unified_margin.move (v0.6)
- MarginAccount: Multi-collateral (NUSDC + NBTC)
- MarginRegistry: 전역 TVL 추적
- public(package) functions: Liquidation 모듈 접근용

// risk_engine.move
- 4-Tier Threshold: IM(10%), Warning(8%), MM(5%), FC(3%)
- Haircut: NUSDC(0%), NBTC(10%)

// account_positions.move
- 포지션 추적 + 실시간 PnL 계산
- Signed arithmetic: { value: u64, is_negative: bool }

// liquidation.move
- 5% 보너스, 50% 최대 청산 비율
- 부분 청산 지원
```

---

### MID-TERM 🚧 (진행중) - Perp DEX + Integration

Unified Margin v1과 연동되는 Perpetuals DEX

| 순서 | 작업 | 상태 | 난이도 | 설명 |
|------|------|------|--------|------|
| M.1 | **Perp Core Contract** | ✅ 완료 | 고 | perpetual.move (20x 레버리지) |
| M.2 | **펀딩 레이트** | ✅ 완료 | 고 | funding.move (8시간 정산) |
| M.3 | Perp Trading UI | 📋 | 중 | Long/Short 주문 UI |
| M.4 | Perp Liquidation | 📋 | 중 | 청산 로직 연동 |
| M.5 | Spot/Perp/Prediction 통합 | 📋 | 고 | 동일 마진 풀 공유 |

**Perpetuals DEX 구현 (contracts-perp):**
```move
// perpetual.move
- PerpMarket: 20x max leverage, Isolated margin
- PerpPosition: Long/Short 포지션 관리
- INITIAL_MARGIN_BPS = 500 (5%)
- MAINTENANCE_MARGIN_BPS = 250 (2.5%)

// funding.move
- 8시간 정산 (FUNDING_INTERVAL_MS = 8 * 60 * 60 * 1000)
- MAX_FUNDING_RATE_BPS = 125 (1.25%)
- Oracle staleness protection (MAX_ORACLE_AGE_MS = 120_000)
- Signed arithmetic: { value: u64, is_negative: bool }
```

**Risk Engine v1 완료:**

| 버전 | 주요 기능 | 트리거 | 상태 |
|------|----------|--------|------|
| **v0** | `balance > 0` 체크 | 주문 시 | ✅ 완료 |
| **v1** | 4-Tier Threshold + Liquidation | 가격 변동 시 | ✅ 완료 |
| **v2** | 포트폴리오 상관관계 (헤지 인정) | 실시간 | 📋 예정 |

**Perp DEX의 전략적 위치:**
> **Perp DEX = Unified Margin v1의 실전 검증 수단**
> Phase 11.1-11.2 완료로 Core Contract 준비 완료

---

### LONG-TERM (9-12주) - Portfolio Margin

Cross-product 전략 지원

| 순서 | 작업 | 상태 | 난이도 | 설명 |
|------|------|------|--------|------|
| L.1 | Portfolio Margin (헤지 인정) | 📋 | 고 | Spot Long + Perp Short = 낮은 마진 |
| L.2 | Lending/Staking margin eligible | 📋 | 중 | 예치금을 담보로 인정 |
| L.3 | Isolated margin 옵션 | 📋 | 중 | 사용자 선택 |
| L.4 | 추가 Perp 마켓 | 📋 | 중 | ETH-PERP, SOL-PERP |

**Cross-Product 전략 예시:**

| 전략 | 설명 | Unified Margin 필요성 |
|------|------|---------------------|
| **Carry Trade** | Spot Long + Perp Short | 헤지 인정으로 마진 절감 |
| **Event Hedge** | Prediction YES + Perp Short | 이벤트 리스크 상쇄 |
| **Yield Leverage** | Lending yield 담보로 Perp | 수익 극대화 |
| **Basis Trade** | Spot + Perp funding 차익 | 저위험 수익 |

---

## 담보 자산별 Haircut 정의

| 자산 | Margin Eligible | Haircut | 버전 | 비고 |
|------|-----------------|---------|------|------|
| NUSDC (Stable) | ✅ Yes | 0% | v0 | 스테이블코인, 첫 담보 |
| NASUN (Native) | ✅ Yes | 0% | v0.5 | 기본 담보 |
| NBTC | ✅ Yes | 10% | v0.5 | 변동성 고려 |
| Spot Position | ✅ Yes | 15% | v1 | 유동성 리스크 |
| Perp Unrealized PnL | ✅ Yes | 20% | v1 | 실현 전 리스크 |
| Lending Deposit | ✅ Yes | 5% | v0.5 | 이자 수익 인정 |
| Staking Position | ⚠️ Partial | 30% | v1 | 언스테이킹 지연 |
| Prediction Position | ❌ Phase L | 50%* | v2 | 바이너리 payoff |

> **참고**: Prediction Position의 담보 인정은 Phase L (LONG-TERM)에서 구현 예정.
> 바이너리 payoff 특성상 복잡한 리스크 모델 필요. (*50%는 목표치)

---

## 상세 구현 현황

### Phase 14: Prediction Markets ⚠️ (MVP 완료)

| 순서 | 작업 | 상태 | 완료일 |
|------|------|------|--------|
| 14.1 | 스마트 컨트랙트 배포 | ✅ | 2025-12-29 |
| 14.2 | 기본 UI (마켓 목록) | ✅ | 2025-12-29 |
| 14.3 | 마켓 상세 (오더북) | ✅ | 2025-12-29 |
| 14.4 | 거래 기능 (Mint, Buy) | ✅ | 2025-12-29 |
| 14.5 | 포지션 관리 (P&L, Claim) | ✅ | 2025-12-30 |
| 14.6 | Sell 주문 활성화 | ✅ | 2025-12-31 |
| 14.7 | 마켓 해결 (Admin) | ✅ | 2025-12-31 |
| 14.8 | 시드 유동성 공급 | ✅ | 2026-01-04 |
| 14.9 | 마켓 생성 (Admin) | ✅ | 2025-12-31 |

**현재 마켓 상태 (2026-01-04):**

| # | Market | Collateral | Ask Orders | Target % |
|---|--------|------------|------------|----------|
| 1 | BTC $150k by Mar 2026 | 1,330 NUSDC | YES:1, NO:2 | ~35% |
| 2 | TikTok Ban by Mar 2026 | 2,000 NUSDC | YES:1, NO:1 | ~30% |
| 3 | Russia-Ukraine Ceasefire | 1,000 NUSDC | YES:1, NO:1 | ~25% |
| 4 | ETH $10k by Dec 2026 | 2,000 NUSDC | YES:1, NO:1 | ~50% |

---

### Phase 17: Lottery ✅

| 순서 | 작업 | 상태 | 완료일 |
|------|------|------|--------|
| 17.1 | Lottery v2 스마트 컨트랙트 배포 | ✅ | 2026-01-09 |
| 17.2 | Sui Random 기반 난수 생성 | ✅ | 2026-01-09 |
| 17.3 | 티켓 구매 UI (1-32 번호 선택) | ✅ | 2026-01-09 |
| 17.4 | Quick Pick 기능 | ✅ | 2026-01-09 |
| 17.5 | Round 관리 (생성, 마감, 추첨, 정산) | ✅ | 2026-01-09 |
| 17.6 | Prize Claim 기능 | ✅ | 2026-01-09 |
| 17.7 | Admin Dashboard 통합 | ✅ | 2026-01-09 |

**배포 정보:**
- Package: `0x8dce08316436ed3fa8c4a183895101ee4a4c4eb8e1dcd19e121b46ee5e256538`
- LotteryRegistry: `0x56e1875df39be66f3c591678ff75866b6c44637c4b84e4c2767926f738ea7f16`
- 티켓 가격: 1 NUSDC
- 번호 범위: 1-32 (5개 선택)
- 당첨 분배: 70% Prize Pool, 20% Rollover, 10% Treasury

---

### Phase 9: Smart Account (zkLogin) ✅

| 순서 | 작업 | 상태 | 완료일 |
|------|------|------|--------|
| 9.1 | 백엔드 인프라 (Salt Lambda) | ✅ | 2026-01-01 |
| 9.2 | @nasun/wallet zkLogin 확장 | ✅ | 2026-01-01 |
| 9.3 | @nasun/wallet-ui 소셜 로그인 UI | ✅ | 2026-01-01 |
| 9.4 | Pado 앱 통합 | ✅ | 2026-01-01 |
| 9.5 | 전체 앱 통합 | ✅ | 2026-01-03 |
| 9.6 | Passkey 인증 | 📋 | - |
| 9.7 | 계정 복구 메커니즘 | 📋 | - |

---

### Wallet Security Phases

**완료된 보안 기능 (Phase 1-2):**

| Phase | 기능 | 상태 |
|-------|------|------|
| 1.1 | 세션 타임아웃 (자동 잠금) | ✅ |
| 1.2 | 메모리 보안 (secureZero) | ✅ |
| 1.3 | SecuritySettings UI | ✅ |
| 2.1 | 주소록 시스템 | ✅ |
| 2.2 | 첫 거래 주소 경고 | ✅ |
| 2.3 | 트랜잭션 시뮬레이션 API | ✅ |

**남은 보안 작업 (Phase 3-4):**

| Phase | 기능 | 상태 | 난이도 |
|-------|------|------|--------|
| 3.1 | IndexedDB 마이그레이션 | 📋 | 중 |
| 3.2 | 암호화 키 저장소 개선 (Argon2) | 📋 | 고 |
| 4.1 | 스캠 주소 DB 연동 | 📋 | 중 |
| 4.2 | 하드웨어 지갑 연동 | 📋 | 고 |

---

## 격주 마일스톤 (Bi-Weekly Targets)

| 주차 | 날짜 | 목표 | 검증 기준 |
|------|------|------|----------|
| W1-2 | 1/6 - 1/17 | Unified Margin v0 스마트컨트랙트 | devInspect 성공 |
| W3-4 | 1/20 - 1/31 | Smart Account UI 통합 | 잔고 이원화 해소 |
| W5-6 | 2/3 - 2/14 | Risk Engine v0.5 | 마진 사용률 표시 |
| W7-8 | 2/17 - 2/28 | Perp v0 MVP | BTC-PERP 거래 가능 |

> **유연성**: 이 일정은 목표치이며, Devnet 상황에 따라 조정 가능.
> 각 마일스톤 종료 시 retrospective 진행 후 다음 일정 조정.

---

## 성공 지표

### 비전 달성 마일스톤

| 마일스톤 | 설명 | 비전 기여도 | 상태 |
|----------|------|------------|------|
| M1 | Portfolio Header UI | ⭐⭐ | ✅ 완료 |
| M2 | Unified Margin Pool v1 | ⭐⭐⭐⭐⭐ | ✅ 완료 |
| M3 | Perp Core Contract | ⭐⭐⭐⭐ | ✅ 완료 (11.1-11.2) |
| M4 | Perp Trading UI | ⭐⭐⭐⭐ | 📋 |
| M5 | Portfolio Margin (v2) | ⭐⭐⭐⭐⭐ | 📋 |

### 정성적 성공 지표

- [x] 사용자가 "두 개의 잔고"를 인지하지 않음 (HeaderNetValue 통합 표시)
- [x] Multi-collateral margin pool 구현 (NUSDC + NBTC)
- [x] Risk Engine v1 구현 (4-Tier Threshold)
- [x] Liquidation Engine 구현 (5% 보너스)
- [ ] Spot + Perp 헤지 시 마진 절감 체감 (v2 예정)
- [ ] "One account, One margin pool" 완전 실현 (Perp 통합 대기)

---

## 핵심 파일 구조

### 현재 구조 (Core Era 완료 후)

```
apps/pado/
├── contracts/              # NBTC, NUSDC, Faucet
├── contracts-prediction/   # Prediction Market
├── contracts-oracle/       # DevOracle 가격 피드
├── contracts-lending/      # Lending Pool
├── contracts-lottery/      # Lottery (Sui Random)
├── contracts-margin/       # ✅ Unified Margin v1 (NEW)
│   └── sources/
│       ├── unified_margin.move     # Multi-collateral 마진
│       ├── risk_engine.move        # 4-Tier Risk Threshold
│       ├── account_positions.move  # 포지션 추적 + PnL
│       └── liquidation.move        # 청산 엔진
├── contracts-perp/         # ✅ Perpetuals DEX (진행중)
│   └── sources/
│       ├── perpetual.move          # PerpMarket, PerpPosition
│       └── funding.move            # 8시간 펀딩 레이트
└── frontend/src/
    ├── features/
    │   ├── trading/          # Spot 거래 ✅
    │   ├── portfolio/        # 포트폴리오 ✅
    │   ├── prediction/       # 예측 시장 ✅
    │   ├── earn/             # Staking/Lending ✅
    │   ├── payments/         # 결제 ✅
    │   ├── dashboard/        # 홈 대시보드 ✅
    │   └── lottery/          # 로또 ✅
    ├── pages/
    │   ├── TradePage.tsx
    │   ├── PortfolioPage.tsx
    │   ├── PredictPage.tsx
    │   ├── EarnPage.tsx
    │   ├── LotteryPage.tsx
    │   └── WalletPage.tsx
    └── components/
        └── common/
```

### 다음 목표 (Portfolio Margin v2)

```
frontend/src/
├── features/
│   ├── core/             # 📋 Core 기능 확장
│   │   ├── unified-margin/  # v2: Portfolio Margin
│   │   ├── risk-engine/     # v2: 헤지 인정
│   │   └── smart-account/   # 계정 추상화
│   ├── trading/          # Spot + Perp 통합
│   └── perp/             # 📋 Perp Trading UI (11.3)
└── contracts-margin/
    └── sources/
        └── portfolio_margin.move  # 📋 v2
```

---

## 작업 프로세스

### Phase 시작 전

```bash
# 1. 롤백 포인트 확보
git add -A && git commit -m "chore: checkpoint before phase X"
git tag vX.Y.Z-pre

# 2. 작업 브랜치 생성 (선택)
git checkout -b feature/phase-X
```

### Phase 완료 후

```bash
# 1. 빌드 테스트
pnpm build:pado

# 2. 개발 서버 테스트
pnpm dev:pado

# 3. 문서 업데이트
# - PADO_NEXT_STEPS.md (이 문서)
# - PADO_IMPLEMENTATION_PLAN.md
# - PADO_UI_ROADMAP.md

# 4. 커밋 & 태그
git add -A && git commit -m "feat: complete phase X - 설명"
git tag vX.Y.Z

# 5. 푸시
git push origin main --tags
```

---

## 변경 이력

| 날짜 | 변경 내용 |
|------|----------|
| 2025-12-26 | 초안 작성 (Phase 6-10 계획) |
| 2025-12-27 | 문서 전면 개편: Unified Onchain Finance 비전 기반 |
| 2025-12-28 | Phase 6, 7, 8, 15 완료 |
| 2025-12-29 | Phase 14 MVP, Phase 3.1 완료 |
| 2025-12-31 | Phase 14.6~14.9 완료 |
| 2026-01-01 | Phase 9, 12, 13 완료 |
| 2026-01-03 | zkLogin 전체 앱 통합 완료 |
| 2026-01-04 | **Vision Analysis 기반 전면 재구성** |
| | - 비전 부합도 분석 결과 반영 (40%) |
| | - Unified Account & Margin을 핵심 축으로 재정의 |
| | - Priority 매트릭스 추가 |
| | - 잔고 이원화 문제 명시 |
| | - Perp DEX를 Core 검증 수단으로 재정의 |
| | - Phase 14.8 시드 유동성 완료 |
| | - 담보 Haircut 테이블 추가 |
| 2026-01-04 | **AI 피드백 기반 문서 개선** (Perplexity/ChatGPT) |
| | - 인프라 리스크 섹션 추가 (Devnet 한계 명시) |
| | - Unified Margin v0/v0.5/v1 단계화 |
| | - Risk Engine v0/v0.5/v1/v2 버전화 |
| | - 격주 마일스톤 일정 추가 |
| | - Prediction 담보를 Phase L로 연기 |
| | - Haircut 테이블에 버전 컬럼 추가 |
| 2026-01-04 | **Oracle 리서치 완료 (I.5)** |
| | - Sui 생태계 오라클 비교: Switchboard, Pyth, Stork, Supra, UMA |
| | - 추천: Switchboard V3 (메인) + Pyth (백업) |
| | - Prediction Resolution: Admin → Multi-sig → 커뮤니티 기반 |
| 2026-01-04 | **DevOracle 구현 완료 (I.5, I.6)** |
| | - Nasun Devnet용 Admin Oracle 배포 |
| | - Package: `0x10ffe5c6...` |
| | - BTC/ETH/NASUN 가격 피드 (8 decimals) |
| | - lib/oracle-client.ts + hooks/useOraclePrice.ts |
| | - bots/price-updater.ts (CoinGecko + Binance fallback) |
| | - Mainnet 전환: PythOracleClient로 교체 예정 |
| 2026-01-04 | **Unified Margin v0 Frontend 구현 (S.1)** |
| | - useBalanceManagerBalance 훅 생성 |
| | - useNetWorth 수정: BM 잔고 통합 |
| | - useUnifiedMargin 훅 (core/unified-margin) |
| | - HeaderNetValue: Wallet + Trading 통합 표시 |
| | - 비전 부합도: 40% → 45% 상승 |
| 2026-01-09 | **Phase 17: Lottery 완료** |
| | - Lottery v2 스마트 컨트랙트 배포 (Multi-Tier Prizes) |
| | - Sui Random 기반 검증 가능한 난수 생성 |
| | - 티켓 구매 UI (1-32, 5개 선택) |
| | - Round lifecycle: OPEN → CLOSED → DRAWN → SETTLED |
| | - Admin Dashboard 통합 (Prediction + Lottery) |
| | - 비전 부합도: 45% → 48% 상승 |
| 2026-01-10 | **Phase 16 v1 완료 + Phase 11.1-11.2 완료** |
| | - Unified Margin v1: Multi-collateral, Risk Engine, Liquidation |
| | - contracts-margin: unified_margin.move (v0.6), risk_engine.move, account_positions.move, liquidation.move |
| | - Phase 11.1-11.2: Perpetuals DEX foundation (perpetual.move, funding.move) |
| | - contracts-perp: 20x 레버리지, 8시간 펀딩 레이트 |
| | - 비전 부합도: 48% → 62% 상승 |
| 2026-01-10 | **Phase 16.1c: Risk Engine UI Integration 완료** |
| | - InsufficientBalancePrompt 컴포넌트 생성 |
| | - OrderForm (Pro mode) 잔고 부족 경고 + Faucet CTA |
| | - SimpleOrderForm (Simple mode) 잔고 부족 경고 + Faucet CTA |
| | - "No market liquidity" 경고 UI (오더북 비어있을 때) |
| | - 네트워크별 Faucet 버튼 표시 (devnet/testnet only) |
| 2026-01-10 | **Phase 11.3: Perp Trading UI 완료** |
| | - contracts-perp 배포: `0xe985134c5bec...` |
| | - features/perp/ 모듈 생성 (types, constants, transactions, hooks, components) |
| | - PerpTradingPanel, PerpTradePage 구현 |
| | - /markets/perp 라우트 활성화 |
| | - Header, QuickActions에 Perp 메뉴 활성화 |
| | - 비전 부합도: 62% → 65% 상승 |
| 2026-01-10 | **BTC-PERP Market 활성화** |
| | - PTB 스크립트로 BTC-PERP 마켓 생성 |
| | - Market ID: `0x0a3ba00cce5aae262ea48ca989dbdf9270addc06e796242f9c0189087c111ec2` |
| | - Oracle 가격 연동 수정 (Table dynamic field 접근) |
| | - ORACLE_FEEDS_TABLE_ID 상수 추가 |
| | - 비전 부합도: 65% → 67% 상승 |

---

*이 문서는 PADO_VISION_VS_REALITY_ANALYSIS.md를 기반으로 전략적 방향을 반영합니다.*
*마지막 업데이트: 2026-01-10*
