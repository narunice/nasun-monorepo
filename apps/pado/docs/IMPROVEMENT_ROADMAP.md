# Pado DEX - Improvement Roadmap for Testnet Launch

> Last updated: 2026-02-15
> Goal: Maximize testnet user impressions -> NFT sales conversion
> Strategic sequence: Vision + Prototype -> Community (testnet) -> NFT Sale -> VC Funding -> Mainnet

---

## 2026 Competitive Landscape

### Table Stakes (must-have in 2026)

| Feature | Pado | Notes |
|---------|------|-------|
| TradingView Charts | Y | 100+ indicators |
| Real-time Orderbook | Y | DeepBook V3 CLOB |
| Copy Trading | N | Bybit/Binance/Bitget core feature |
| Customizable Dashboard | N | Bybit 2026 drag-and-drop widgets |
| AI Trading Dashboard | N | OKX AI analysis tools |
| Intent-based Swaps | N | Jupiter expanding |
| Gamification | Y | Badges/Leaderboard/Competitions (73% DAU increase effect) |
| Mobile Parity | Partial | PWA supported but chart 250px, orderbook 5 levels |
| Social Trading | Y | Chat/Follow/PnL Share/Market Narrator |

### Pado Differentiators (no competitor has this combination)

1. **CLOB + Prediction Markets + Lottery in one DEX** -- Jupiter spot only, Hyperliquid perps only
2. **Market Narrator Bot** -- automated market commentary in live chat (unique among DEXs)
3. **PnL Share Cards + Badge System** -- CEX-grade features in a DEX context
4. **"Built by 2 people"** -- feature breadth itself is the proof of execution

### Biggest Gaps

| Area | Current | Target | Key Missing |
|------|---------|--------|-------------|
| Mobile/Perf | 65 -> 75 | 75+ | ✅ Chart min(40vh,350px), MiniOrderbook 8 levels |
| Social/Gamif | 80 -> 88 | 85+ | ✅ Points system, leaderboard points tab |
| Onboarding | 80 -> 90 | 90+ | ✅ Getting Started card, first-trade celebration |

---

## Current UX Issues (Code Audit)

### CRITICAL

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| C1 | Hardcoded NBTC token name | `useAutoDeposit.ts:311`, `useOrderActions.ts:49,292` | Wrong token in errors + 1000x price overestimation for non-NBTC markets |
| C2 | Onboarding tour not starting | `TradePage.tsx:199` | `!isSimple` guard blocks tour for Simple mode (default) users |
| C3 | No first-trade celebration | Not implemented | No confetti/screenshot moment after first trade |
| C4 | No faucet-to-trade guidance | `HomePage.tsx` | Users don't know what to do after wallet creation |

### HIGH

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| H1 | Earn page shows incomplete features | `EarnPage.tsx` | Staking "Coming Soon" stub visible |
| H2 | PerpsComingSoon info wrong | `PerpsComingSoonPage.tsx` | Shows "Phase 11 planned, 10x" (actual: Phase 11 done, 20x) |
| H3 | No loading skeletons | All pages | Flicker/blank during data load |
| H4 | Error messages not actionable | Multiple `showToast` calls | No "how to fix" guidance |
| H5 | Mobile chart 250px fixed | `MobileTradeLayoutV2.tsx:60` | Poor mobile UX from Twitter links |
| H6 | Chat hard to discover | `ChatToggleButton.tsx` | 40px icon, hidden by default. Social differentiator not exposed |

### LOW

| # | Issue | Impact |
|---|-------|--------|
| L1 | Button style inconsistency | bg-pd2, bg-green-500, bg-orange-600 mixed |
| L2 | Empty states without CTAs | "No trades yet" with no guidance |
| L3 | Narrator bot hardcoded pool name | "NBTC" fixed (multi-pool not supported) |
| L4 | 15+ TODO comments in production | useTotalValue.ts, useTransferHistory.ts etc |

---

## Prioritized Improvements

### TIER 1: Must-Do Before Launch (~12h total) -- ✅ COMPLETE (2026-02-14)

| Rank | Item | Hours | Effect | Status |
|------|------|-------|--------|--------|
| 1 | C1: Fix NBTC hardcoded bug | 1.5h | Trust | ✅ Dynamic `currentPool.baseToken.symbol` in useAutoDeposit, useOrderActions, useFaucet |
| 2 | C2: Fix onboarding tour for Simple mode | 1h | First-use | ✅ Removed `!isSimple` guard, Simple mode tour auto-starts |
| 3 | H2: Fix PerpsComingSoon page | 1h | Accuracy | ✅ Updated to "20x leverage, deployed", link to PerpTradePage |
| 4 | C3: **First-trade celebration animation** | 3.5h | Viral | ✅ canvas-confetti + modal + Twitter share button. `useFirstTradeCelebration` hook |
| 5 | H1: Clean up Earn page | 1h | Trust | ✅ Staking tab hidden with "Coming Soon" banner |
| 6 | H6: Chat default visibility | 2h | Social | ✅ MobileChatDrawer auto-opens on first visit, notification dot when collapsed |
| 7 | C4: Faucet-to-trade guide flow | 3h | Conversion | ✅ GettingStartedCard on HomePage (3-step checklist: Wallet -> Faucet -> Trade) |

### TIER 2: Should-Do First Week (~24h total) -- ✅ COMPLETE (2026-02-14)

| Rank | Item | Hours | Effect | Status |
|------|------|-------|--------|--------|
| 8 | H5: Mobile chart/orderbook improvements | 2.5h | Mobile UX | ✅ Chart `min(40vh,350px)`, MiniOrderbook 5->8 levels |
| 9 | **Enhanced share cards** | 5h | Viral | ✅ "Built by 2 people" watermark, points/rank, one-click Twitter share via canvasRenderer |
| 10 | H3: Loading skeletons | 4.5h | Polish | ✅ Skeleton component added to Dashboard, Portfolio, Leaderboard pages |
| 11 | H4: Actionable error messages | 3.5h | UX | ✅ `errorParser.ts` maps RPC errors to user-friendly messages + fix guidance |
| 12 | **Points system** | 10h | NFT conversion | ✅ SQLite store, trade/volume/diversity formula, Points leaderboard tab, aggregator integration |

### TIER 3: Post-Launch (~35h total)

| Rank | Item | Hours | Effect | Description |
|------|------|-------|--------|-------------|
| 13 | **Daily quests system** | 12h | Retention | "Trade 3 times today" +10pt, homepage checklist |
| 14 | **Referral system** | 7h | Growth | Unique links, referrer point bonus |
| 15 | Empty state CTAs | 2.5h | UX | Action buttons on empty orderbook/history/portfolio |
| 16 | Button/typography consistency | 5h | Polish | Button variant system, text size standardization |
| 17 | Sound effects additions | 1.5h | Feel | Badge unlock, lottery draw, chat notification sounds |
| 18 | L3: Narrator bot dynamic pool names | 1h | Accuracy | NBTC hardcoded -> pool-specific display |
| 19 | L4: TODO comment cleanup | 2h | Code quality | Remove/track production TODO comments |

---

## Testnet Campaign Strategy

### "Pado Testnet Season 1" (3 weeks)

**Week 1: Onboarding Sprint**
- First-trade points 2x bonus
- "First 100 Traders" badge
- Target: 200+ wallets, 100+ first trades

**Week 2: Volume Competition**
- Use existing `/competitions` infrastructure
- Top 10 by volume = guaranteed NFT whitelist
- Market Narrator alerts active in chat

**Week 3: Social Sprint**
- Share card points 3x
- Bug report rewards (50 pts per confirmed report)
- Top 200 by total points = Frontiers Event NFT whitelist

### VC Metrics to Track

- DAU / WAU / MAU
- Avg trades per active user
- 24h trading volume
- Discord/Twitter growth rate
- Tester -> whitelist conversion rate

---

## Key Files (Modified in T1/T2)

| File | Change | Tier |
|------|--------|------|
| `features/trading/hooks/useAutoDeposit.ts` | NBTC -> `currentPool.baseToken.symbol` | T1-1 |
| `features/trading/hooks/useOrderActions.ts` | Dynamic symbol, performAutoDeposit signature | T1-1 |
| `features/trading/hooks/useFaucet.ts` | Dynamic token symbol in error messages | T1-1 |
| `pages/TradePage.tsx` | Tour auto-start fix (removed `!isSimple` guard) | T1-2 |
| `pages/PerpsComingSoonPage.tsx` | Updated to "20x leverage, deployed" | T1-3 |
| `features/trading/components/FirstTradeCelebration.tsx` | New: confetti + modal + Twitter share | T1-4 |
| `features/trading/hooks/useFirstTradeCelebration.ts` | New: first-trade detection hook | T1-4 |
| `pages/HomePage.tsx` | GettingStartedCard integration | T1-7 |
| `features/dashboard/components/GettingStartedCard.tsx` | New: 3-step onboarding checklist | T1-7 |
| `features/trading/components/MobileTradeLayoutV2.tsx` | Chart `min(40vh,350px)` + orderbook 8 levels | T2-8 |
| `features/trading/components/MiniOrderbook.tsx` | LEVELS constant 5->8 | T2-8 |
| `features/social/components/ShareCardModal.tsx` | Enhanced branding + points/rank | T2-9 |
| `features/social/utils/canvasRenderer.ts` | "Built by 2 people" watermark, Twitter share | T2-9 |
| `components/common/Skeleton.tsx` | Skeleton variants for different page layouts | T2-10 |
| `features/trading/utils/errorParser.ts` | New: RPC error -> user-friendly message mapper | T2-11 |
| `chat-server/src/leaderboard-store.ts` | Points tables + aggregation queries | T2-12 |
| `chat-server/src/leaderboard-types.ts` | POINTS constants, TraderPointsRow interface | T2-12 |
| `chat-server/src/aggregator.ts` | runPointsAggregation formula | T2-12 |
| `chat-server/src/server.ts` | Points API endpoints | T2-12 |
| `features/leaderboard/components/PointsLeaderboardTable.tsx` | New: Points leaderboard tab UI | T2-12 |

---

## Execution Schedule

**Sprint 1 (2026-02-14)**: Tier 1 items 1-7 = ✅ Complete
**Sprint 2 (2026-02-14)**: Tier 2 items 8-12 = ✅ Complete
**Post-launch**: Tier 3 -> Prioritize based on community feedback

Total Tier 1+2: Completed in a single session. 1085 unit tests passing (46 test files, 0 failures).

---

## Core Thesis

Current Pado already surpasses most DEXs in feature completeness. The key is NOT "build more features" but **"showcase existing features properly"**:

1. Bug fixes for trust (C1, C2, H2)
2. First-trade celebration + sharing for viral loop (C3, item 9)
3. Guided flow for conversion rate (C4)
4. Points system for NFT whitelist connection (item 12)
5. Chat visibility for "people are here" feeling (H6)

These 5 elements are the core drivers converting testnet visitors into NFT buyers.
