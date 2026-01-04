# Pado 개발 로드맵

> 작성일: 2025-12-26
> 최종 업데이트: 2026-01-04
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

**전체 비전 부합도: 약 40%**

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

### Era 2: Vertical Era ⚠️ (부분 완료)

| Phase | 상태 | 내용 | 비전 기여도 | 완료일 |
|-------|------|------|------------|--------|
| Phase 6 | ✅ | Trading UX Pro (MA, RSI, MACD) | ⭐ | 2025-12-28 |
| Phase 7 | ✅ | Portfolio Dashboard | ⭐ | 2025-12-28 |
| Phase 8 | ✅ | Mobile & Theme | ⭐ | 2025-12-28 |
| Phase 12 | ✅ | Lending Pool (NUSDC) | ⭐⭐ | 2026-01-01 |
| Phase 13 | ✅ | Staking (Native) | ⭐⭐ | 2026-01-01 |
| Phase 14 | ⚠️ MVP | Prediction Markets | ⭐⭐ | 2025-12-31 |
| Phase 15 | ✅ | Payments (Send, QR) | ⭐⭐ | 2025-12-28 |
| **Phase 11** | ❌ | **Perpetuals** | ⭐⭐⭐⭐ | - |

### Era 3: Core Era 📋 (시작 필요)

| Phase | 상태 | 내용 | 비전 기여도 |
|-------|------|------|------------|
| **Phase 16** | ❌ | **Unified Margin** | ⭐⭐⭐⭐⭐ |
| Phase 16.1 | ❌ | Smart Account 통합 | ⭐⭐⭐⭐⭐ |
| Phase 16.2 | ❌ | Risk Engine | ⭐⭐⭐⭐ |
| Phase 16.3 | ❌ | Portfolio Margin | ⭐⭐⭐⭐⭐ |

---

## 우선순위 매트릭스

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
| I.5 | Oracle 옵션 조사 | 📋 | 저 | Pyth, Switchboard on Sui |

**목표 UI:**
```
┌─────────────────────────────────────────────────────┐
│  Net Value: $10,000  │  Available: $5,000  │  🟢   │
└─────────────────────────────────────────────────────┘
         ↑ 이 헤더가 모든 탭에서 항상 표시됨
```

---

### SHORT-TERM (3-4주) - Core Foundation

Unified Account & Margin 기초 구축

| 순서 | 작업 | 상태 | 난이도 | 설명 |
|------|------|------|--------|------|
| S.1 | Unified Margin Pool 스마트컨트랙트 v0 | 📋 | 고 | 단일 담보 풀 |
| S.2 | Smart Account 통합 | 📋 | 고 | Wallet + BalanceManager 병합 |
| S.3 | Pyth Network 연동 PoC | 📋 | 중 | 가격 오라클 |
| S.4 | Portfolio View 홈 화면 구현 | 📋 | 중 | 모든 포지션 한눈에 |

**Unified Margin Pool v0 요구사항:**
```move
module pado::unified_margin {
    struct UnifiedAccount has key {
        id: UID,
        owner: address,
        // 담보 자산
        collateral: Table<TypeName, Balance>,
        // 사용 중인 마진
        used_margin: u64,
        // 미실현 PnL
        unrealized_pnl: i64,
    }

    // 모든 product에서 공유
    public fun deposit(account: &mut UnifiedAccount, coin: Coin<T>);
    public fun withdraw(account: &mut UnifiedAccount, amount: u64): Coin<T>;
    public fun get_available_margin(account: &UnifiedAccount): u64;
}
```

---

### MID-TERM (5-8주) - Perp DEX + Core Validation

Unified Margin을 검증하는 첫 번째 고난도 vertical

| 순서 | 작업 | 상태 | 난이도 | 설명 |
|------|------|------|--------|------|
| M.1 | Perp 마진 시스템 (Cross only) | 📋 | 고 | Unified Margin 연동 |
| M.2 | 펀딩 레이트 메커니즘 | 📋 | 고 | 8시간 정산 |
| M.3 | 청산 엔진 (부분 청산) | 📋 | 고 | Liquidation bot |
| M.4 | Risk Engine v1 | 📋 | 고 | 포트폴리오 레벨 리스크 |
| M.5 | Spot/Perp/Prediction 통합 | 📋 | 고 | 동일 마진 풀 공유 |

**Perp DEX의 전략적 위치:**
> **Perp DEX ≠ 별도의 새로운 제품**
> **Perp DEX = Unified Margin의 실전 검증 수단**

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

## 성공 지표

### 비전 달성 마일스톤

| 마일스톤 | 설명 | 비전 기여도 | 상태 |
|----------|------|------------|------|
| M1 | Portfolio Header UI | ⭐⭐ | 📋 |
| M2 | Unified Margin Pool v0 | ⭐⭐⭐⭐⭐ | 📋 |
| M3 | Perp v0 + 통합 | ⭐⭐⭐⭐ | 📋 |
| M4 | Portfolio Margin | ⭐⭐⭐⭐⭐ | 📋 |

### 정성적 성공 지표

- [ ] 사용자가 "두 개의 잔고"를 인지하지 않음
- [ ] 모든 상품에서 동일한 margin pool 사용
- [ ] Spot + Perp 헤지 시 마진 절감 체감
- [ ] "One account, One margin pool" 실현

---

## 핵심 파일 구조

### 현재 구조

```
frontend/src/
├── features/
│   ├── trading/          # Spot 거래 ✅
│   ├── portfolio/        # 포트폴리오 ✅
│   ├── prediction/       # 예측 시장 ✅
│   ├── earn/             # Staking/Lending ✅
│   ├── payments/         # 결제 ✅
│   └── dashboard/        # 홈 대시보드 ✅
├── pages/
│   ├── TradePage.tsx
│   ├── PortfolioPage.tsx
│   ├── PredictPage.tsx
│   ├── EarnPage.tsx
│   └── WalletPage.tsx
└── components/
    └── common/
```

### 목표 구조 (Core Era)

```
frontend/src/
├── features/
│   ├── core/             # 🆕 Core 기능
│   │   ├── unified-margin/
│   │   ├── risk-engine/
│   │   └── smart-account/
│   ├── trading/          # Spot + Perp 통합
│   ├── portfolio/        # 재설계 필요
│   ├── prediction/
│   ├── earn/
│   └── payments/
└── contracts/
    ├── unified_margin.move  # 🆕
    ├── perp_market.move     # 🆕
    └── risk_engine.move     # 🆕
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

---

*이 문서는 PADO_VISION_VS_REALITY_ANALYSIS.md를 기반으로 전략적 방향을 반영합니다.*
*마지막 업데이트: 2026-01-04*
