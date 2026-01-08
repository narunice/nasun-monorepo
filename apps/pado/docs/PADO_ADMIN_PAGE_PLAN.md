# Pado Prediction Market Admin 페이지 확장 계획

## 요약

**목표**: 기존 `/predict/admin` 페이지를 확장하여 마켓 목록 관리 + 시드 유동성 공급 기능 추가

**접근 방식**: 단계적 확장 (Prediction 완성 → 나중에 다른 영역 추가)

---

## 1. 현재 구현 현황 ✅

### 기존 파일들 (이미 완성)

| 파일 | 기능 |
|------|------|
| `pages/PredictAdminPage.tsx` | Admin 페이지 (`/predict/admin`) - 마켓 생성만 |
| `features/prediction/hooks/usePredictionAdmin.ts` | createMarket, resolveMarket |
| `features/prediction/components/CreateMarketForm.tsx` | 마켓 생성 폼 |
| `features/prediction/components/AdminResolveModal.tsx` | 마켓 해결 모달 |
| `features/prediction/transactions.ts` | buildCreateMarket, buildResolveMarket |

### 스마트컨트랙트

- `create_market()` - AdminCap 필요
- `resolve_market()` - Resolver 권한 필요
- `mint_outcome_tokens()` - YES+NO 토큰 민팅
- `place_bid_order()` / `place_ask_order()` - 주문 배치

---

## 2. 구현할 기능

### 2.1 마켓 목록 관리
- 전체 마켓 조회 (이벤트 기반)
- 상태별 필터링 (Open / Closed / Resolved)
- 마켓별 유동성 현황 표시
- 목록에서 바로 해결/시드 버튼 제공

### 2.2 시드 유동성 공급
- 목표 확률 설정 (예: YES 35%)
- 스프레드 설정 (예: 4%)
- 시드 금액 입력 (NUSDC)
- 2단계 트랜잭션: 민팅 → 주문 배치

---

## 3. 파일 구조

```
apps/pado/frontend/src/
├── pages/
│   └── PredictAdminPage.tsx         # [수정] 탭 기반으로 확장
│
├── features/prediction/
│   ├── components/
│   │   ├── AdminMarketList.tsx      # [신규] 마켓 목록 + 필터
│   │   ├── AdminMarketRow.tsx       # [신규] 개별 마켓 행
│   │   ├── SeedLiquidityForm.tsx    # [신규] 시드 유동성 폼
│   │   ├── SeedLiquidityModal.tsx   # [신규] 시드 유동성 모달
│   │   └── index.ts                 # [수정] export 추가
│   │
│   ├── hooks/
│   │   ├── useAdminMarkets.ts       # [신규] 전체 마켓 조회
│   │   ├── useSeedLiquidity.ts      # [신규] 시드 유동성 로직
│   │   └── index.ts                 # [수정] export 추가
│   │
│   └── transactions.ts              # [수정] 시드 유동성 트랜잭션 추가
```

---

## 4. UI 레이아웃

```
┌─────────────────────────────────────────────────────────────────┐
│  ← Back to Markets                            Admin Mode 🛡️     │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┬─────────────┬─────────────┐                    │
│  │  Markets    │  Create     │  Liquidity  │  ← 3개 탭          │
│  └─────────────┴─────────────┴─────────────┘                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  [Markets 탭]                                                    │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Filter: [All] [Open] [Closed] [Resolved]                   │  │
│  ├───────────────────────────────────────────────────────────┤  │
│  │ Question          │ Status │ Close Time │ Actions          │  │
│  │ BTC $150k by...   │ Open   │ Mar 1      │ [Seed] [Resolve] │  │
│  │ TikTok Ban...     │ Closed │ Mar 1      │ [Resolve]        │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  [Create 탭] → 기존 CreateMarketForm                            │
│                                                                  │
│  [Liquidity 탭]                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Select Market: [BTC $150k ▾]                               │  │
│  │ Target Probability: [35] %                                 │  │
│  │ Spread: [4] %                                              │  │
│  │ Seed Amount: [1000] NUSDC                                  │  │
│  │                                                            │  │
│  │ Preview:                                                   │  │
│  │ ├── YES Ask: $0.37 × 300 shares                           │  │
│  │ └── NO Ask: $0.67 × 300 shares                            │  │
│  │                                                            │  │
│  │ [Execute Seed]                                             │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. 시드 유동성 로직

### 제약 사항
- `mint_outcome_tokens`가 `entry fun`이라 반환값 없음
- 같은 트랜잭션에서 Position NFT ID를 알 수 없음

### 해결 방법: 2단계 트랜잭션

```
Step 1: 민팅
  mint_outcome_tokens(market, nusdc) → YES Position + NO Position 생성

(1.5초 대기 - 블록체인 동기화)

Step 2: Position 조회 후 주문 배치
  getOwnedObjects(POSITION_TYPE) → Position 목록
  for each position:
    place_ask_order(market, position, price)
```

### useSeedLiquidity 훅 상태

```typescript
type SeedStep = 'idle' | 'minting' | 'syncing' | 'placing_orders' | 'done' | 'error';
```

---

## 6. 단계별 구현 순서

### Phase 1: 마켓 목록 관리

| # | 작업 | 파일 |
|---|------|------|
| 1.1 | useAdminMarkets 훅 | `hooks/useAdminMarkets.ts` |
| 1.2 | AdminMarketList 컴포넌트 | `components/AdminMarketList.tsx` |
| 1.3 | AdminMarketRow 컴포넌트 | `components/AdminMarketRow.tsx` |
| 1.4 | PredictAdminPage 탭 구조 | `pages/PredictAdminPage.tsx` |
| 1.5 | export 업데이트 | `index.ts` 파일들 |

### Phase 2: 마켓 해결 통합

| # | 작업 | 파일 |
|---|------|------|
| 2.1 | AdminMarketRow에 Resolve 버튼 | `components/AdminMarketRow.tsx` |
| 2.2 | 기존 AdminResolveModal 연동 | - |

### Phase 3: 시드 유동성 공급

| # | 작업 | 파일 |
|---|------|------|
| 3.1 | useSeedLiquidity 훅 | `hooks/useSeedLiquidity.ts` |
| 3.2 | SeedLiquidityForm 컴포넌트 | `components/SeedLiquidityForm.tsx` |
| 3.3 | SeedLiquidityModal 컴포넌트 | `components/SeedLiquidityModal.tsx` |
| 3.4 | Liquidity 탭 통합 | `pages/PredictAdminPage.tsx` |

---

## 7. 핵심 수정 파일

### 신규 생성 (6개)
- `features/prediction/hooks/useAdminMarkets.ts`
- `features/prediction/hooks/useSeedLiquidity.ts`
- `features/prediction/components/AdminMarketList.tsx`
- `features/prediction/components/AdminMarketRow.tsx`
- `features/prediction/components/SeedLiquidityForm.tsx`
- `features/prediction/components/SeedLiquidityModal.tsx`

### 수정 (3개)
- `pages/PredictAdminPage.tsx` - 탭 기반 레이아웃
- `features/prediction/components/index.ts` - export 추가
- `features/prediction/hooks/index.ts` - export 추가

---

## 8. 향후 확장 (나중에)

| 영역 | 관리 항목 |
|------|---------|
| Trading | 새 풀 생성, 수수료 조정 |
| Lending | 금리 모델, 담보 관리 |
| Faucet | 민팅 금액, 쿨다운 조정 |

→ 이 기능들은 `/admin` 통합 페이지 또는 `/predict/admin` 확장으로 추가
