# fix(pado): Hardcoded 'NBTC' in Auto-Deposit Code

> Status: Not started
> Priority: High (affects all non-NBTC markets)
> Found: 2026-02-10

## Bug Description

NSOL/NUSDC market에서 Stop Loss가 trigger되었을 때 에러 메시지가 "Not enough **NBTC**"로 표시됨.
실제로는 NSOL 잔액이 부족한 것이지만, auto-deposit 관련 코드 3곳에서 'NBTC'가 하드코딩되어 있어
어떤 market에서든 항상 NBTC로 표시하는 버그.

### Screenshot Evidence

- Toast 1: "Stop Loss triggered at $83.91 — executing sell 24.9585 NSOL..." (correct)
- Toast 2: "Not enough **NBTC**. Get 24.9585 more from Faucet in your wallet." (WRONG - should be NSOL)
- Toast 3: "Stop Loss failed: Not enough **NBTC**..." (WRONG)

## Root Cause

3곳에서 base token symbol이 'NBTC'로 하드코딩됨:

### 1. `useAutoDeposit.ts` L311 — Error message (screenshot의 직접 원인)

```typescript
// File: apps/pado/frontend/src/features/trading/hooks/useAutoDeposit.ts
// Line 311
error = `Not enough NBTC. Get ${check.baseShortfall.toFixed(4)} more from Faucet in your wallet.`;
```

`currentPool`은 이미 hook 내에서 `useMarket()`으로 접근 가능하므로 `currentPool.baseToken.symbol` 사용.

### 2. `useOrderActions.ts` L292 — Oracle price for auto-deposit estimation

```typescript
// File: apps/pado/frontend/src/features/trading/hooks/useOrderActions.ts
// Line 292 (handleMarketOrder 내부)
const oraclePrice = getUnifiedPrice('NBTC');
```

Market order의 auto-deposit 금액 추정 시 항상 NBTC 가격을 사용.
NSOL/NUSDC에서 buy market order 시 NBTC 가격(~$95,000)으로 계산하여
필요 NUSDC를 ~1,000배 과대 추정하게 됨.

`currentPool`은 이미 `useMarket()` (L118)에서 가져오고 있음.

### 3. `useOrderActions.ts` L49 — Auto-deposit toast message

```typescript
// File: apps/pado/frontend/src/features/trading/hooks/useOrderActions.ts
// Line 49 (performAutoDeposit 함수)
showToast(`Auto-deposited ${result.depositedBaseAmount!.toFixed(4)} NBTC to trading`, "info");
```

`performAutoDeposit`은 standalone 함수라 currentPool에 접근 불가.
시그니처에 `baseSymbol: string` 파라미터를 추가해야 함.

## Fix Plan

### Fix 1: `useAutoDeposit.ts` L311

```diff
- error = `Not enough NBTC. Get ${check.baseShortfall.toFixed(4)} more from Faucet in your wallet.`;
+ error = `Not enough ${currentPool.baseToken.symbol}. Get ${check.baseShortfall.toFixed(4)} more from Faucet in your wallet.`;
```

### Fix 2: `useOrderActions.ts` L292

```diff
- const oraclePrice = getUnifiedPrice('NBTC');
+ const baseSymbol = currentPool.baseToken.symbol;
+ const oraclePrice = getUnifiedPrice(baseSymbol as import('../../../lib/prices').TokenSymbol);
```

### Fix 3: `useOrderActions.ts` L28-56 (performAutoDeposit)

시그니처에 `baseSymbol` 추가:

```diff
  async function performAutoDeposit(
    depositIfNeeded: (q: number, b: number) => Promise<AutoDepositResult>,
    requiredQuote: number,
    requiredBase: number,
    showToast: (msg: string, type: "info" | "error" | "success" | "warning") => void,
+   baseSymbol: string,
  ): Promise<{ success: boolean; error?: string }> {
```

Toast 메시지 수정:

```diff
- showToast(`Auto-deposited ${result.depositedBaseAmount!.toFixed(4)} NBTC to trading`, "info");
+ showToast(`Auto-deposited ${result.depositedBaseAmount!.toFixed(4)} ${baseSymbol} to trading`, "info");
```

호출부 2곳에서 `currentPool.baseToken.symbol` 전달:
- L245 (handleLimitOrder 내 performAutoDeposit 호출)
- L296 (handleMarketOrder 내 performAutoDeposit 호출)

## Files to Modify

| File | Lines | Change |
|------|-------|--------|
| `apps/pado/frontend/src/features/trading/hooks/useAutoDeposit.ts` | 311 | `NBTC` -> `currentPool.baseToken.symbol` |
| `apps/pado/frontend/src/features/trading/hooks/useOrderActions.ts` | 49 | toast `NBTC` -> `baseSymbol` param |
| `apps/pado/frontend/src/features/trading/hooks/useOrderActions.ts` | 292 | `getUnifiedPrice('NBTC')` -> dynamic symbol |
| `apps/pado/frontend/src/features/trading/hooks/useOrderActions.ts` | 28, 245, 296 | `performAutoDeposit` signature + call sites |

## Verification

1. `pnpm build --filter=@nasun/pado` build 통과
2. NSOL/NUSDC market에서 잔액 부족 시 "Not enough NSOL" 표시 확인
3. NBTC/NUSDC market에서 기존대로 "Not enough NBTC" 표시 확인
4. Auto-deposit toast가 올바른 token symbol 표시 확인
5. Market buy order의 auto-deposit 금액이 올바른 가격 기반으로 계산되는지 확인
