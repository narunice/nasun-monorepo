# Pado Spot Trading - Manual E2E Test Checklist

> Last updated: 2026-02-10
> Total test cases: ~65 (10 phases)

## Test Execution Order

### Phase 1: Wallet & Setup

| # | Test Case | Expected Result | Pass |
|---|-----------|-----------------|------|
| 1 | Create new wallet (mnemonic) | Wallet created, mnemonic backup modal shown | |
| 2 | Lock and unlock wallet | Password prompt, successful unlock | |
| 3 | zkLogin authentication (Google OAuth) | OAuth flow completes, wallet connected | |
| 4 | Faucet NASUN | Balance updates with loading spinner until complete | |
| 5 | Faucet NBTC (1 NBTC) | Balance shows +1 NBTC, 5s cooldown active | |
| 6 | Faucet NUSDC (100,000 NUSDC) | Balance shows +100,000 NUSDC, 5s cooldown active | |
| 7 | Rapid faucet clicks during cooldown | Button disabled, no duplicate requests | |
| 8 | Enable Pado (create BalanceManager) | EnablePadoCard shown, BM created after TX | |
| 9 | Verify balances in Assets tab | Wallet / Trading / In Orders columns correct | |
| 10 | Deposit NBTC to BalanceManager | Trading balance increases, wallet balance decreases | |

### Phase 2: Simple Mode Trading

| # | Test Case | Expected Result | Pass |
|---|-----------|-----------------|------|
| 11 | Switch to Simple mode | UI changes to swap-style interface | |
| 12 | Quick Trade: Market buy $50 NBTC | Order executes, balance updates | |
| 13 | Quick Trade: Market sell all NBTC | Order executes, NUSDC balance increases | |
| 14 | Change slippage to 1.0% | Setting persists, shown in order preview | |
| 15 | Verify balance updates after trades | Wallet + Trading balances reflect fills | |

### Phase 3: Pro Mode - Basic Orders

| # | Test Case | Expected Result | Pass |
|---|-----------|-----------------|------|
| 16 | Switch to Pro mode | Full layout with orderbook, chart, order form | |
| 17 | Place GTC limit buy (below mid price) | Order appears in Open Orders tab with badge | |
| 18 | Cancel order from Open Orders tab | Order removed, funds unlocked | |
| 19 | Place POST_ONLY limit sell | Rejected if would cross spread (take liquidity) | |
| 20 | Place IOC market buy | Fills available liquidity, cancels remainder | |
| 21 | Place FOK order (large size) | Rejected if can't fill entirely | |
| 22 | Cancel All orders | All open orders cancelled with confirmation | |
| 23 | Verify Order History tab | Shows lifecycle: placed -> filled/cancelled | |
| 24 | Verify Trade History tab | 1 row per fill, correct price/size/time | |
| 25 | Enable One-Click Trading | Modal warns of risk, subsequent orders skip confirmation | |

### Phase 4: Pro Mode - Advanced Orders

| # | Test Case | Expected Result | Pass |
|---|-----------|-----------------|------|
| 26 | Place Stop-Limit order | Trigger price + limit price set, shown in TP/SL tab | |
| 27 | Place Trailing Stop (% trail) | High/low water mark tracking active | |
| 28 | Place Scale order (5 orders, uniform) | Preview shows 5 orders across price range | |
| 29 | Submit Scale order | 5 limit orders placed sequentially, toast shows results | |
| 30 | Enable TP/SL on limit order | TP and SL inputs shown, order placed with conditions | |
| 31 | Verify TP/SL tab shows active orders | Type, side, trigger price, qty, created time visible | |
| 32 | Cancel TP/SL order | Removed from active list | |

### Phase 5: Orderbook & Chart

| # | Test Case | Expected Result | Pass |
|---|-----------|-----------------|------|
| 33 | Click orderbook price level | Price auto-fills in order form | |
| 34 | Hover ask level | Tooltip below spread: VWAP, total qty, cost, impact % | |
| 35 | Hover bid level | Tooltip above spread: VWAP, total qty, cost, impact % | |
| 36 | Toggle Book/Trades tab | Switches between orderbook and recent trades view | |
| 37 | Change depth level (5 -> 10 -> 20) | Rows count changes accordingly | |
| 38 | Cycle grouping size (0.01 -> 0.1 -> 1) | Price levels aggregate correctly | |
| 39 | Verify spread bar colors | Green (<0.2%), yellow (0.2-0.5%), red (>0.5%) | |
| 40 | Verify large order walls | Thicker bars for orders >3x average | |
| 41 | Switch to Depth Chart tab | Visual depth chart renders | |
| 42 | Switch chart intervals (1m, 5m, 1h, 1d) | OHLCV data loads for each interval | |
| 43 | Add MA indicator | Moving average line appears on chart | |
| 44 | Draw horizontal line on chart | Line persists across interval changes | |
| 45 | Draw Fibonacci retracement | Level lines (23.6%, 38.2%, 50%, 61.8%) appear | |

### Phase 6: Keyboard Shortcuts (Pro Mode)

| # | Test Case | Expected Result | Pass |
|---|-----------|-----------------|------|
| 46 | Press B | Buy side selected | |
| 47 | Press S | Sell side selected | |
| 48 | Press L | Limit order mode | |
| 49 | Press M | Market order mode | |
| 50 | Press C | Scale order mode | |
| 51 | Press 5 | Amount set to 50% of available balance | |
| 52 | Press +/= | Price ticks up by 1 tick | |
| 53 | Press - | Price ticks down by 1 tick | |
| 54 | Press Enter | Order submitted (or confirmation modal opens) | |
| 55 | Press T | Toggle Book/Trades | |
| 56 | Press ? | Shortcuts panel opens | |
| 57 | Press [ and ] | Previous/Next market selected | |

### Phase 7: Mobile Responsiveness

| # | Test Case | Expected Result | Pass |
|---|-----------|-----------------|------|
| 58 | Resize to mobile width (<1024px) | Single-column layout (MobileTradeLayoutV2) | |
| 59 | Scroll through sections | Chart -> Quick Trade -> Orderbook -> Tabs | |
| 60 | Open MobileChatDrawer | Slide-in panel from right | |
| 61 | Place market order on mobile | Touch-friendly buttons work correctly | |
| 62 | Verify MobileMiniTicker | Sticky price bar at top with 24h change | |

### Phase 8: Portfolio & Assets

| # | Test Case | Expected Result | Pass |
|---|-----------|-----------------|------|
| 63 | Verify Assets tab breakdowns | Wallet / Trading / In Orders / Total per token | |
| 64 | Deposit via TransferModal | Wallet -> BalanceManager transfer | |
| 65 | Withdraw via TransferModal | BalanceManager -> Wallet transfer | |
| 66 | Verify locked amounts | Open orders reduce available balance correctly | |
| 67 | Auto-deposit on order placement | Insufficient BM balance auto-pulls from wallet | |

### Phase 9: Notifications & Alerts

| # | Test Case | Expected Result | Pass |
|---|-----------|-----------------|------|
| 68 | Set price alert (above current) | Alert saved, shown in alerts list | |
| 69 | Wait for price alert trigger | Browser notification + sound (if enabled) | |
| 70 | Verify order fill notification | Toast + browser notification on fill | |
| 71 | Toggle sound on/off | Fill sounds respect setting | |

### Phase 10: Error Handling & Edge Cases

| # | Test Case | Expected Result | Pass |
|---|-----------|-----------------|------|
| 72 | Place order with insufficient balance | Red error text, deposit/faucet prompt | |
| 73 | Place order below min size | Validation error shown | |
| 74 | Enter invalid price (below tick size) | Snapped to valid tick or error | |
| 75 | Enter invalid quantity (below lot size) | Snapped to valid lot or error | |
| 76 | Disconnect network | OfflineBanner shown, orderbook warning | |
| 77 | Reconnect network | Data refreshes automatically | |
| 78 | Place order with insufficient gas (0 NASUN) | Error prompts faucet NASUN | |

---

## Key Files Reference

### Core Trading
- [TradePage.tsx](../frontend/src/pages/TradePage.tsx) - Main layout
- [OrderForm.tsx](../frontend/src/features/trading/components/OrderForm.tsx) - Pro order form
- [SimpleOrderForm.tsx](../frontend/src/features/trading/components/SimpleOrderForm.tsx) - Simple mode
- [ScaleOrderForm.tsx](../frontend/src/features/trading/components/ScaleOrderForm.tsx) - Scale orders

### Orderbook & Data
- [Orderbook.tsx](../frontend/src/features/trading/components/Orderbook.tsx) - Orderbook UI
- [deepbook.ts](../frontend/src/lib/deepbook.ts) - DeepBook V3 integration
- [useOrderbook.ts](../frontend/src/features/trading/hooks/useOrderbook.ts) - Data hook
- [useOrderActions.ts](../frontend/src/features/trading/hooks/useOrderActions.ts) - Order actions

### Chart
- [TradingViewChart.tsx](../frontend/src/features/trading/components/chart/TradingViewChart.tsx) - TradingView
- [DepthChart.tsx](../frontend/src/features/trading/components/chart/DepthChart.tsx) - Depth chart

### Keyboard & Mobile
- [useKeyboardShortcuts.ts](../frontend/src/features/trading/hooks/useKeyboardShortcuts.ts) - Shortcuts
- [MobileTradeLayoutV2.tsx](../frontend/src/features/trading/components/MobileTradeLayoutV2.tsx) - Mobile layout

### Portfolio & Tabs
- [BottomTabPanel.tsx](../frontend/src/features/trading/components/BottomTabPanel.tsx) - Tabs container
- [OpenOrders.tsx](../frontend/src/features/trading/components/OpenOrders.tsx) - Open orders

### TP/SL & Alerts
- [useTPSLMonitor.ts](../frontend/src/features/trading/hooks/useTPSLMonitor.ts) - TP/SL monitor
- [usePriceAlertMonitor.ts](../frontend/src/features/trading/hooks/usePriceAlertMonitor.ts) - Price alerts
