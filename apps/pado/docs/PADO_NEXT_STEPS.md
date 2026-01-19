# Pado 개발 로드맵

> 작성일: 2025-12-26
> 최종 업데이트: 2026-01-17
> 비전: **"One Account. One Margin Pool. Every Asset Works Harder."**

---

## Executive Summary

### 핵심 전략 선언

> **Pado = Decentralized Prime Brokerage + Unified Account**

현재 Pado는 **Unified Margin v1**과 **Perpetuals DEX Core** 구현을 완료하여 비전 달성에 한 걸음 더 다가섰습니다. 다음 단계는 **Perpetuals Trading UI의 고도화**와 **Spot-Perp Integration**을 통해 진정한 통합 마진 경험을 제공하는 것입니다.

### 비전 부합도 점수

| 영역 | 점수 | 비전 임팩트 | 상태 |
|------|------|------------|------|
| **Unified Margin** | **80%** | ⭐⭐⭐⭐⭐ | ✅ v1 완료 (Multi-collateral + Risk Engine + Liquidation) |
| **Smart Account** | **70%** | ⭐⭐⭐⭐⭐ | ✅ 잔고 통합 UI 완료 |
| **Risk Engine** | **80%** | ⭐⭐⭐⭐ | ✅ v1 완료 (4-Tier Threshold) |
| **Perpetuals** | **85%** | ⭐⭐⭐⭐ | ✅ Phase 11.4 완료 (청산 엔진 + Keeper) |
| Spot Trading | 80% | ⭐⭐⭐ | ⚠️ 별도 BalanceManager (통합 예정) |
| zkLogin | 100% | ⭐⭐⭐ | ✅ 완료 |
| Lending | 60% | ⭐⭐ | ⚠️ Core 통합 대기 |
| Staking | 70% | ⭐⭐ | ⚠️ Core 통합 대기 |
| Prediction | 60% | ⭐⭐ | ⚠️ Core 통합 대기 |
| Payments | 80% | ⭐⭐ | ✅ 기능 완료 |
| Lottery | 100% | ⭐ | ✅ 완료 |

**전체 비전 부합도: 약 75%** (Phase 16 v1 + Phase 11.4 완료 후)

---

## 구현 완료 상태

### Core Era ✅ (v1 완료)

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
| Phase 17 | ✅ | **Lottery v2** | ⭐ | 2026-01-09 |

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
         │  • Spot-Perp       │  • Unified Margin ✅│
         │    Integration     │  • Smart Account ✅ │
         │  • Portfolio       │  • Risk Engine ✅   │
         │    Margin          │  • Perp Core ✅     │
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

## 다음 단계 목표 (Next Steps)

### Phase 11.5: Spot-Perp Integration 🚀

**목표**: Spot 거래와 Perpetual 거래가 동일한 Unified Margin 풀을 공유하도록 통합합니다.

| 순서 | 작업 | 설명 |
|------|------|------|
| 11.5.1 | MarginAccount 연동 | Perp 포지션 개설 시 MarginAccount 담보 확인 |
| 11.5.2 | PnL 반영 | Perp 미실현 PnL을 MarginAccount 총 자산 가치에 반영 |
| 11.5.3 | 청산 연쇄 작용 | Perp 청산 시 Spot 자산도 청산 대상에 포함 (또는 그 반대) |
| 11.5.4 | UI 통합 | Trade 페이지에서 Spot/Perp 전환 시 잔고가 통합되어 보이도록 개선 |

### Phase 12: Lending & Borrowing 📋

**목표**: 유휴 자산을 예치하여 이자 수익을 얻거나, 담보를 통해 자산을 대출받는 기능.

| 순서 | 작업 | 설명 |
|------|------|------|
| 12.1 | Lending Pool 컨트랙트 | 공급/대출 풀 로직 구현 |
| 12.2 | Interest Rate Model | 이용률 기반 동적 금리 모델 |
| 12.3 | Margin 통합 | 예치 자산을 Unified Margin 담보로 인정 (Haircut 적용) |
| 12.4 | UI 구현 | Earn 페이지에 Lending/Borrowing 기능 추가 |

---

## 배포된 컨트랙트 (2026-01-17 기준)

### Unified Margin v1
- **Package**: `0x2886424ff9b3ed9ecdb408ea1f68ca9598efbcbf796311ad3dc33c97d31d63c7`
- **MarginRegistry**: `0x57979cb0...`
- **UpgradeCap**: `0x4781e6fd...`

### Perpetuals DEX (v2)
- **Package**: `0x4e2a36299ce4b17ecbd3c4049fa99aae77afeb193a0724c4ad738765072be2e5`
- **UpgradeCap**: `0x19f09fb2fe1c4406b61d134881743e37a3cab2f8ae5b538f350025213c0fb910`
- **BTC-PERP Market**: `0x0a3ba00cce5aae262ea48ca989dbdf9270addc06e796242f9c0189087c111ec2`

### Lottery (v2)
- **Package**: `0x8dce08316436ed3fa8c4a183895101ee4a4c4eb8e1dcd19e121b46ee5e256538`
- **LotteryRegistry**: `0x56e1875df39be66f3c591678ff75866b6c44637c4b84e4c2767926f738ea7f16`

---

## 변경 이력

| 날짜 | 변경 내용 |
|------|----------|
| 2026-01-17 | **문서 현행화**: Phase 11.4, 16 v1, 17 완료 반영. 패키지 ID 최신화. |
| 2026-01-10 | **Phase 16 v1 완료 + Phase 11.1-11.2 완료** |
| 2026-01-09 | **Phase 17: Lottery 완료** |
| 2026-01-04 | **Vision Analysis 기반 전면 재구성** |