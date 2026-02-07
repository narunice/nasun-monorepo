# Pado Next Steps: Prototype Launch

> Last Updated: 2026-02-05
> Vision: **Finance-first social -- a financial platform where community forms around execution, not hype.**
> Strategic Reference: [SOCIAL_LAYER_DISCUSSION.md](SOCIAL_LAYER_DISCUSSION.md)

---

## Current State Summary

Pado has **22 completed development phases** covering spot trading, perpetuals, prediction markets, lottery, payments, unified margin, zkLogin, social layer (chat + leaderboard + competitions), and LP bot. The core financial engine and community infrastructure are functional.

### Devnet V7 Deployment Status (2026-02-04)

| Category | Status |
|----------|--------|
| Tokens (NBTC, NUSDC, Faucet) | ✅ V7 |
| DeepBook V3 (Spot CLOB) | ✅ V7 |
| Prediction Markets | ✅ V7 |
| Lottery | ✅ V7 |
| Governance | ✅ V7 |
| Baram (Escrow + Executor) | ✅ V7 |
| Oracle (pado_oracle) | ✅ V7 |
| Lending (pado_lending) | ✅ V7 |
| Margin (unified_margin) | ✅ V7 |
| Perpetuals (pado_perp) | ✅ V7 |

---

## Priority 1: Prototype Polish (Phase 18)

The single most important thing at launch: **a visitor creates a wallet, gets faucet tokens, and executes a trade on a real orderbook -- all within 60 seconds**.

### 18.1 End-to-End Trading Flow QA

Walk through the full visitor journey and fix every friction point:

1. Land on Pado → First impression (landing page or direct to trading)
2. Create wallet → Must be < 30 seconds, zero confusion
3. Get faucet tokens → Instant, never fails silently
4. Place a limit order → Confirm it appears in orderbook
5. Fill the order → Confirm balance updates correctly
6. View order history → Confirm trade is recorded

**Known areas to verify**:
- Faucet claim flow (ClaimRecord shared object contention under load)
- DeepBook balance manager deposit/withdraw reliability
- Orderbook real-time sync (WebSocket vs polling)
- ~~Chart data population (needs active trading data)~~ **Resolved: LP Bot provides liquidity**

**LP Bot (Implemented 2026-02-05)**:
- Location: `apps/pado/bots/`
- Provides 20 bid + 20 ask orders on NBTC/NUSDC orderbook
- Binance API price feed with 0.3% spread
- Auto-refill from faucet when balance is low
- PM2 deployment for staging/production

### 18.2 Onboarding UX

- Consider a first-time guided flow (tooltip or modal sequence)
- Ensure wallet creation → faucet → first trade is a single unbroken flow
- Error messages must be human-readable, not raw RPC errors

### 18.3 UI Polish

- Consistent loading states across all pages
- Empty states for orderbook, trade history, portfolio
- Mobile responsiveness check on trading page
- Navigation clarity: Trading / Prediction / Lottery clearly accessible

---

## Priority 2: Social Layer MVP (Phase 19) -- ✅ Complete

All social layer features are implemented and deployed.

### 19.1 Global Chat -- ✅ Done
- WebSocket server with signature-based authentication (`apps/pado/chat-server/`)
- Nicknames (wallet-signed verification), SQLite storage (90-day retention)
- Floating chat popup, mobile drawer, collapsible sidebar on trading page

### 19.2 Leaderboard -- ✅ Done
- DeepBook OrderFilled event indexer → SQLite aggregation
- Volume rankings by period (24h, 7d, 30d, all-time)
- Dedicated `/leaderboard` page + MyRankCard widget

### 19.3 Trader Profiles -- ✅ Done
- Per-address stats page (`/leaderboard/trader/:address`)
- Fill history table, volume breakdown

### 19.4 Trading Competitions -- ✅ Done
- Admin CRUD API with Bearer token auth
- Time-limited competitions with dedicated leaderboards
- `/competitions` and `/competitions/:id` pages

### 19.5 Chat-Trading Integration -- ✅ Done
- FloatingChatPopup, MobileChatDrawer, ChatToggleButton
- Chat lives alongside trading UI, collapsible

**NFT whitelist connection**: Leaderboard ranking can be used as a factor in NFT whitelist allocation (trade → climb leaderboard → earn whitelist priority).

---

## Priority 3: Activation (Phase 20)

Ensure the vision-differentiating features are live at launch.

### 20.1 Prediction Market

- Create 1-2 markets with clear outcomes (e.g., a time-bound event)
- Seed with initial liquidity so the market isn't empty
- Verify resolution flow works end-to-end

### 20.2 Lottery

- Create 1 active round before launch
- Verify ticket purchase → draw → settlement → claim flow
- Ensure prize pool display is clear and compelling

### 20.3 Navigation & Discovery

- Main nav clearly shows: Trading | Predictions | Lottery
- Each section has a clear value proposition visible on first load
- Portfolio/Dashboard accessible but not primary navigation focus for prototype

---

## Not For Prototype (Tier 4)

These are explicitly deferred. Do not work on them until after community formation and funding.

- Perpetuals UI activation (contracts V7 deployed, .env integration pending)
- Unified Margin v2 (Spot-Perp integration, contracts V7 deployed)
- Lending & Borrowing UI (contract V7 deployed)
- Encrypted DMs
- AI Agents
- Copy Trading
- Reputation System / ZKP Leaderboards
- Strategy Marketplace
- Tournaments

---

## Dependencies & Infrastructure

| Need | Solution | Cost |
|------|----------|------|
| LP Bot | PM2 process on existing EC2 (staging/production) | $0 additional |
| WebSocket server (chat) | Run on existing EC2 alongside RPC/Faucet | $0 additional |
| Message storage | SQLite file on EC2 | $0 |
| Leaderboard indexer | Node.js process on EC2, polling RPC for trade events | $0 |
| Domain/SSL | Already configured (pado.nasun.io or similar) | $0 |

No new AWS resources required for prototype launch.

---

## Open Questions

1. ~~Should the chat and leaderboard backend be a single Node.js service or separate processes?~~ **Resolved**: Single service (`apps/pado/chat-server/`) handles chat, leaderboard, and competitions.
2. What testnet campaign (leaderboard competition, faucet event) will drive initial activity at launch?
3. Should leaderboard rankings carry weight in NFT whitelist allocation?
4. Landing page: should visitors land on a dedicated landing page or go directly to the trading view?
5. What is the target concurrent user count for launch day?

---

## Changelog

| Date | Change |
|------|--------|
| 2026-02-07 | Phase 19 (Social Layer) marked complete. V7 deployment status updated for all contracts |
| 2026-02-05 | LP Bot implementation complete -- orderbook now has 40 levels of liquidity |
| 2026-01-31 | Full rewrite: prototype launch priorities aligned with social layer strategy |
| 2026-01-17 | Phase 11.4, 16 v1, 17 completion. Package IDs updated |
| 2026-01-10 | Phase 16 v1, 11.1-11.2 completion |
| 2026-01-09 | Phase 17: Lottery completion |
| 2026-01-04 | Vision analysis-based full restructure |
