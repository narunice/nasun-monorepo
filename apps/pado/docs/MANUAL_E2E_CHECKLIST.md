# Pado Spot Trading - Manual E2E Test Checklist

> Last updated: 2026-02-23
> Total test cases: ~153 (23 phases)

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

## Phase 22 Tests: Testnet Launch Polish (T1 + T2)

> Added: 2026-02-15. These tests cover features implemented in Phase 22 (Tier 1 + Tier 2).
> They require a real browser because they involve on-chain transactions, visual effects,
> canvas rendering, real CSS layout, WebSocket connections, and third-party integrations
> that jsdom/vitest cannot simulate.

### Phase 11: Getting Started & Onboarding (T1)

| # | Test Case | Expected Result | Pass |
|---|-----------|-----------------|------|
| 79 | Visit HomePage as new user (no wallet) | GettingStartedCard visible with 3 steps: Create Wallet, Get Tokens, Make First Trade | |
| 80 | Step 1: Create wallet from GettingStartedCard | Step 1 marked complete (checkmark), step 2 highlighted | |
| 81 | Step 2: Click "Get Tokens" in GettingStartedCard | Navigates to faucet or triggers faucet flow, step 2 marked complete after success | |
| 82 | Step 3: Complete first trade | Step 3 marked complete, card shows "You're Ready!" state | |
| 83 | Revisit HomePage after completing all steps | GettingStartedCard hidden or shows completed state (not blocking) | |
| 84 | Clear localStorage and revisit | GettingStartedCard reappears with all steps unchecked | |

### Phase 12: First-Trade Celebration (T1)

| # | Test Case | Expected Result | Pass |
|---|-----------|-----------------|------|
| 85 | Execute first-ever trade (new wallet, 0 prior trades) | Confetti animation plays, celebration modal appears | |
| 86 | Celebration modal content | Shows "You traded on a real L1 CLOB!" message, trade details (pair, amount) | |
| 87 | Twitter share button in celebration modal | Opens Twitter intent with pre-filled text including trade details | |
| 88 | Close celebration modal | Modal dismisses, does not reappear on next trade | |
| 89 | Execute second trade | No confetti, no celebration modal (one-time only) | |
| 90 | Test across sessions: trade, close browser, re-open | Celebration state persists in localStorage, no re-trigger | |

### Phase 13: Onboarding Tour & Chat Visibility (T1)

| # | Test Case | Expected Result | Pass |
|---|-----------|-----------------|------|
| 91 | Visit TradePage in Simple mode as first-time user | Onboarding tour auto-starts with step-by-step tooltips | |
| 92 | Tour covers Simple mode elements | Tooltips point to: swap form, market selector, balance display (not pro-only elements) | |
| 93 | Complete tour | Tour state saved, does not re-trigger on next visit | |
| 94 | Dismiss tour early | Tour stops, does not auto-restart | |
| 95 | MobileChatDrawer on first visit (mobile viewport) | Chat drawer auto-opens briefly or notification dot visible | |
| 96 | Collapse chat, receive new message | Notification dot appears on chat toggle button | |
| 97 | Re-open chat after notification | Dot clears, new messages visible | |

### Phase 14: Token-Dynamic Error Messages (T1)

| # | Test Case | Expected Result | Pass |
|---|-----------|-----------------|------|
| 98 | Switch to NETH/NUSDC market, attempt order with insufficient NETH | Error says "Not enough NETH" (not "NBTC") | |
| 99 | Switch to NSOL/NUSDC market, attempt order with insufficient NSOL | Error says "Not enough NSOL" | |
| 100 | Switch to NASUN/NUSDC market, attempt order with insufficient NASUN | Error says "Not enough NASUN" | |
| 101 | Auto-deposit flow on NETH market | Auto-deposit message references NETH, correct amount deposited | |
| 102 | Faucet button on NETH market shows correct token | Button says "Get NETH" or references NETH (not NBTC) | |

### Phase 15: Perpetual Trading & Earn Page

| # | Test Case | Expected Result | Pass |
|---|-----------|-----------------|------|
| 103 | Navigate to /markets/perp | PerpTradePage loads with leverage slider, orderbook, position panel | |
| 104 | Open long BTC position (5x leverage) | Position opens, shown in position list with entry price and leverage | |
| 105 | Adjust leverage slider (1x to 20x) | Leverage updates, margin requirement recalculates | |
| 106 | View funding rate display | Current funding rate and next funding time shown | |
| 107 | Close perp position | Position removed from list, realized PnL shown | |
| 108 | Navigate to Earn page | Staking tab hidden or shows "Coming Soon" banner, no broken stubs | |
| 109 | Earn page does not show incomplete forms | No input fields or buttons for unimplemented staking features | |

### Phase 16: Mobile Chart & Orderbook Improvements (T2)

| # | Test Case | Expected Result | Pass |
|---|-----------|-----------------|------|
| 110 | Resize to mobile (<1024px), check chart height | Chart container height is approximately min(40vh, 350px), NOT fixed 250px | |
| 111 | Verify chart is usable on 375px width (iPhone SE) | Chart renders without overflow, candles visible, touch zoom works | |
| 112 | Verify chart on 430px width (iPhone 14 Pro Max) | Chart takes advantage of larger viewport, taller than on iPhone SE | |
| 113 | MiniOrderbook shows 8 levels | Count visible ask (red) and bid (green) rows: should be 8 each | |
| 114 | MiniOrderbook price click on mobile | Tapping a price level fills the order form price field | |
| 115 | MiniOrderbook spread display | Spread row visible between asks and bids with percentage | |
| 116 | Scroll behavior: chart -> orderbook -> trade form | Smooth scroll, no content overlap or z-index issues | |

### Phase 17: Enhanced Share Cards (T2)

| # | Test Case | Expected Result | Pass |
|---|-----------|-----------------|------|
| 117 | Open PnL share modal after a trade | ShareCardModal opens with trade performance data | |
| 118 | Canvas card rendering | Card includes: PnL data, "Built by 2 people" watermark, Pado branding | |
| 119 | Points/rank display on card | If user has points, they appear on the share card | |
| 120 | Download share card | "Download" button saves PNG to device | |
| 121 | Twitter share button | Opens Twitter with pre-attached image or intent URL, correct hashtags | |
| 122 | Share card on mobile viewport | Card renders correctly, buttons are touch-friendly | |
| 123 | Share card with negative PnL | Red color scheme, correct negative percentage display | |
| 124 | Share card with zero trades | Graceful empty state or disabled share button | |

### Phase 18: Loading Skeletons (T2)

| # | Test Case | Expected Result | Pass |
|---|-----------|-----------------|------|
| 125 | Dashboard page initial load (clear cache) | Skeleton placeholders shown for NetWorthCard, HotMarketsCard while data loads | |
| 126 | Portfolio page initial load | Skeleton for AssetOverview, TokenBalanceList, RecentTrades | |
| 127 | Leaderboard page initial load | Skeleton rows in leaderboard table while fetching rankings | |
| 128 | Throttle network to Slow 3G in DevTools | Skeletons visible for extended period, smooth transition to real content | |
| 129 | No flash of empty content | Content areas show skeletons immediately, never blank white space | |

### Phase 19: Actionable Error Messages (T2)

| # | Test Case | Expected Result | Pass |
|---|-----------|-----------------|------|
| 130 | Trigger "InsufficientBalance" RPC error | Toast shows user-friendly message + "Deposit funds or use Faucet" guidance | |
| 131 | Trigger "GasPaymentError" (0 NASUN gas) | Toast says "You need NASUN for gas fees" + "Get NASUN from Faucet" button | |
| 132 | Trigger network timeout/RPC unavailable | Toast says "Network connection issue" + "Try again in a few seconds" | |
| 133 | Trigger "ObjectNotFound" error | Toast explains object was deleted/doesn't exist, suggests refresh | |
| 134 | Verify error message includes action button | At least one error type has a clickable CTA (e.g., "Go to Faucet") | |
| 135 | Error messages do not show raw hex/RPC data | No `0x...` addresses, Move abort codes, or stack traces in user-facing toasts | |

### Phase 20: Points System & Leaderboard (T2)

> **Prerequisite**: Chat-server must be running with points aggregation enabled.

| # | Test Case | Expected Result | Pass |
|---|-----------|-----------------|------|
| 136 | Navigate to /leaderboard, find "Points" tab/mode | Points leaderboard tab visible alongside Volume tab | |
| 137 | Points leaderboard shows ranked traders | Table with rank, address/nickname, total points, breakdown columns | |
| 138 | Execute a trade, wait for aggregation cycle | Trader appears in points leaderboard (or points increase) | |
| 139 | Trade on multiple pools (NBTC + NETH) | Diversity points increase (unique_pools * 25 pts each) | |
| 140 | First trade bonus | New wallet's first trade awards 100 bonus points | |
| 141 | Volume-based points | $1K+ volume awards 5 points per $1K (check after large trade) | |

### Phase 21: Passkey Wallet

| # | Test Case | Expected Result | Pass |
|---|-----------|-----------------|------|
| 142 | Create passkey-based wallet | Passkey registered, wallet created with device credential | |
| 143 | Authenticate with passkey (biometric/PIN) | Passkey verification succeeds, wallet unlocked | |
| 144 | Execute trade with passkey signer | Transaction signed via passkey, trade completes | |
| 145 | Passkey persists across sessions | Close and reopen browser, passkey still available | |

### Phase 22: Competitions

| # | Test Case | Expected Result | Pass |
|---|-----------|-----------------|------|
| 146 | Navigate to /competitions | Competition list page loads | |
| 147 | View active competition with countdown | Timer shows remaining time, participant count visible | |
| 148 | Competition leaderboard loads | Ranked participants with volume/PnL displayed | |
| 149 | Navigate to /competitions/:id | Competition detail page with rules and leaderboard | |

### Phase 23: PWA Features

| # | Test Case | Expected Result | Pass |
|---|-----------|-----------------|------|
| 150 | Install PWA from browser | "Install app" prompt appears, installs to home screen | |
| 151 | Launch from home screen | App opens in standalone mode (no browser chrome) | |
| 152 | Service worker caches assets | After first load, static assets served from cache | |
| 153 | Offline banner on disconnect | OfflineBanner shown when network disconnected | |

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

### Phase 22 (T1/T2) Components

- [GettingStartedCard.tsx](../frontend/src/features/dashboard/components/GettingStartedCard.tsx) - Onboarding checklist
- [FirstTradeCelebration.tsx](../frontend/src/features/trading/components/FirstTradeCelebration.tsx) - Confetti + modal
- [useFirstTradeCelebration.ts](../frontend/src/features/trading/hooks/useFirstTradeCelebration.ts) - First-trade detection
- [MiniOrderbook.tsx](../frontend/src/features/trading/components/MiniOrderbook.tsx) - Mobile orderbook (8 levels)
- [MobileTradeLayoutV2.tsx](../frontend/src/features/trading/components/MobileTradeLayoutV2.tsx) - Mobile layout
- [ShareCardModal.tsx](../frontend/src/features/social/components/ShareCardModal.tsx) - Share card UI
- [canvasRenderer.ts](../frontend/src/features/social/utils/canvasRenderer.ts) - Canvas card renderer
- [errorParser.ts](../frontend/src/features/trading/utils/errorParser.ts) - RPC error mapper
- [Skeleton.tsx](../frontend/src/components/common/Skeleton.tsx) - Loading skeleton component
- [PointsLeaderboardTable.tsx](../frontend/src/features/leaderboard/components/PointsLeaderboardTable.tsx) - Points tab
- [PerpsComingSoonPage.tsx](../frontend/src/pages/PerpsComingSoonPage.tsx) - Perps info page
