# Pado Next Steps: Prototype Launch

> Last Updated: 2026-01-31
> Vision: **Finance-first social -- a financial platform where community forms around execution, not hype.**
> Strategic Reference: [SOCIAL_LAYER_DISCUSSION.md](SOCIAL_LAYER_DISCUSSION.md)

---

## Current State Summary

Pado has **17 completed development phases** covering spot trading, perpetuals, prediction markets, lottery, payments, unified margin, and zkLogin. The core financial engine works.

What's missing for prototype launch is not more features -- it's **polish, reliability, and community infrastructure**.

### Devnet V6 Deployment Status

| Category | Status |
|----------|--------|
| Tokens (NBTC, NUSDC, Faucet) | Deployed |
| DeepBook V3 (Spot CLOB) | Deployed |
| Prediction Markets | Deployed |
| Lottery | Deployed |
| Governance | Deployed |
| Baram (Escrow + Executor) | Deployed |
| Oracle, Margin, Perp | **Not yet deployed on V6** (not blocking prototype) |

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
- Chart data population (needs active trading data)

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

## Priority 2: Social Layer MVP (Phase 19)

The community infrastructure that converts a demo into a gathering place.

### 19.1 Global Chat

**Scope**: Single chat room, visible in the trading page sidebar.

**Technical approach**:
- WebSocket server running on existing EC2 instance
- Backend: Node.js WebSocket server (ws or Socket.IO)
- Storage: SQLite file on EC2 (simple, zero cost, 90-day message retention)
- Frontend: Collapsible sidebar panel on the trading page
- Identity: Connected wallet address (truncated), optional display name

**What it needs to do**:
- Send/receive messages in real-time
- Show wallet address (linked to explorer) per message
- Show online user count
- Basic moderation (admin can delete messages)
- Rate limiting (prevent spam)

**What it does NOT need**:
- User authentication beyond wallet connection
- Message encryption
- File/image uploads
- Multiple channels
- Message reactions or threading

### 19.2 Testnet Leaderboard

**Scope**: Public leaderboard ranked by testnet trading activity.

**Technical approach**:
- Data source: Index DeepBook trade events from RPC (or maintain a simple server-side event listener)
- Metrics: Total volume traded, number of trades, P&L (if computable from fills)
- Display: Dedicated leaderboard page + compact widget on trading page
- Identity: Wallet address + optional nickname

**Key design decisions**:
- Opt-in vs auto-included: Start with auto-included (all traders visible), add opt-out later if requested
- Update frequency: Every few minutes (not real-time, to reduce load)
- Timeframe: Rolling 7-day and all-time

**NFT whitelist connection**: Leaderboard ranking should be designed so it can later be used as a factor in NFT whitelist allocation. This creates the incentive loop: trade on testnet → climb leaderboard → earn whitelist priority.

### 19.3 Chat-Trading Integration

- Chat panel lives in the trading page layout (sidebar or bottom panel)
- Collapsible so it doesn't interfere with trading
- Optionally show trade notifications in chat ("User 0x1234... bought 0.5 BTC")

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

- Perpetuals UI activation (contracts need V6 redeploy first)
- Unified Margin v2 (Spot-Perp integration)
- Lending & Borrowing UI
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
| WebSocket server (chat) | Run on existing EC2 alongside RPC/Faucet | $0 additional |
| Message storage | SQLite file on EC2 | $0 |
| Leaderboard indexer | Node.js process on EC2, polling RPC for trade events | $0 |
| Domain/SSL | Already configured (pado.nasun.io or similar) | $0 |

No new AWS resources required for prototype launch.

---

## Open Questions

1. Should the chat and leaderboard backend be a single Node.js service or separate processes?
2. What testnet campaign (leaderboard competition, faucet event) will drive initial activity at launch?
3. Should leaderboard rankings carry weight in NFT whitelist allocation?
4. Landing page: should visitors land on a dedicated landing page or go directly to the trading view?
5. What is the target concurrent user count for launch day?

---

## Changelog

| Date | Change |
|------|--------|
| 2026-01-31 | Full rewrite: prototype launch priorities aligned with social layer strategy |
| 2026-01-17 | Phase 11.4, 16 v1, 17 completion. Package IDs updated |
| 2026-01-10 | Phase 16 v1, 11.1-11.2 completion |
| 2026-01-09 | Phase 17: Lottery completion |
| 2026-01-04 | Vision analysis-based full restructure |
