# Pado Implementation Plan

**Created**: 2025-12-25
**Last Updated**: 2026-02-05
**Status**: Prototype launch preparation
**Strategic Reference**: [SOCIAL_LAYER_DISCUSSION.md](SOCIAL_LAYER_DISCUSSION.md)

---

## Strategic Context

Pado launches as a **prototype**, not a finished product. The goal is to demonstrate a compelling vision with credible execution, build a community, and fund further development through NFT sales and VC investment.

**Sequence**: Vision + Prototype → Community (Social Layer) → NFT Funding → Liquidity → Product Completion

See [SOCIAL_LAYER_DISCUSSION.md](SOCIAL_LAYER_DISCUSSION.md) for the full strategic analysis.

---

## Completed Phases (History)

All phases below are implemented and functional on Nasun Devnet.

| Phase | Name | Key Deliverables |
|-------|------|-----------------|
| 0 | Infrastructure | Devnet V6 (Sui fork), 2-Node Validator, RPC + Faucet |
| 1 | Spot DEX Core | DeepBook V3 CLOB, NBTC/NUSDC pool |
| 2 | Trading UI MVP | Orderbook, OrderForm (Limit/Market), Balance management |
| 3 | Trading UX | Lightweight Charts, Order History, Real-time updates |
| 4 | Multi-Pool | NASUN/NUSDC pool, Market Selector |
| 5 | Native Token | NASUN deposit/withdraw, Gas reservation |
| 6 | Trading UX Pro | MA/RSI/MACD indicators, Volume chart |
| 7 | Portfolio Dashboard | Asset summary, P&L chart |
| 8 | Mobile & Theme | Responsive design, Dark/Light theme |
| 9 | Smart Account v2 | zkLogin (Google OAuth) |
| 14 | Prediction Markets | Contract, Market creation/trading/settlement UI, Seed liquidity |
| 15 | Payments | Token transfer UI, QR code payments |
| 16 | Unified Margin v1 | MarginAccount (multi-collateral), Risk Engine (4-tier), Liquidation Engine |
| 17 | Lottery v2 | Lottery contract (Sui Random), Ticket purchase UI, Multi-tier prizes |
| 11.1-11.4 | Perpetuals DEX | PerpMarket, Position, Leverage (20x), Funding, Trading UI, Liquidation + Keeper |
| 19 | Social Layer | Global Chat (WebSocket + SQLite), Leaderboard (DeepBook event indexer), Trader Profiles, Trading Competitions |
| 22 | LP Bot | Liquidity Provider Bot for NBTC/NUSDC orderbook (Binance price feed, 20-level grid) |

---

## Deployed Contracts (Devnet V7, 2026-02-04)

> Full addresses: `packages/devnet-config/devnet-ids.json`

| Contract | Status |
|----------|--------|
| devnet_tokens (NBTC, NUSDC, Faucet) | ✅ V7 |
| DeepBook V3 (CLOB) | ✅ V7 |
| Prediction (GlobalState) | ✅ V7 |
| Lottery (LotteryRegistry) | ✅ V7 |
| Governance (Dashboard) | ✅ V7 |
| Baram (BaramRegistry + Executor) | ✅ V7 |
| pado_oracle | ✅ V7 |
| pado_lending | ✅ V7 |
| unified_margin | ✅ V7 |
| pado_perp | ✅ V7 |

---

## Forward Plan: Prototype Launch

The forward plan is organized by the tier system defined in [SOCIAL_LAYER_DISCUSSION.md](SOCIAL_LAYER_DISCUSSION.md), aligned with the prototype visitor journey.

### Phase 18: Prototype Polish (Tier 1 -- ✅ Complete)

**Goal**: Core financial proof -- visitors must be able to trade on a real orderbook within 60 seconds of landing.

| Task | Description | Status |
|------|-------------|--------|
| 18.1 Spot Trading QA | End-to-end testing: wallet creation → faucet → place order → fill → balance update | ✅ Done |
| 18.2 Onboarding Flow | Streamline wallet creation + faucet claim into a single guided flow | ✅ Done |
| 18.3 Orderbook + Chart Stability | Fix any rendering/sync issues, ensure real-time updates are reliable | ✅ Done |
| 18.4 UI Polish Pass | Landing page, navigation, error states, loading states, empty states | ✅ Done |
| 18.5 Faucet Reliability | Ensure faucet never fails silently, add rate limiting for abuse prevention | ✅ Done |

### Phase 19: Social Layer MVP (Tier 2 -- ✅ Complete)

**Goal**: Community foundation -- turn one-time visitors into returning community members.

| Task | Description | Status |
|------|-------------|--------|
| 19.1 Global Chat | WebSocket chat with signature-based auth, nicknames, SQLite storage | ✅ Done |
| 19.2 Testnet Leaderboard | DeepBook OrderFilled event indexer, volume rankings (24h/7d/30d/all) | ✅ Done |
| 19.3 Trader Profiles | Per-address stats page with fill history and volume breakdown | ✅ Done |
| 19.4 Trading Competitions | Time-limited competitions with dedicated leaderboards | ✅ Done |
| 19.5 Chat-Trading Integration | Floating chat popup, mobile drawer, collapsible sidebar | ✅ Done |

**Technical Implementation (Phase 19)**:
- Chat backend: WebSocket server on existing EC2 (`apps/pado/chat-server/`)
- Message storage: SQLite on EC2 (90-day retention)
- Identity: Wallet address + optional nickname (signature-verified)
- Leaderboard: DeepBook OrderFilled event polling → SQLite aggregation
- Competitions: Admin CRUD API, Bearer token auth

### Phase 20: Vision Differentiation (Tier 3 -- Strongly Recommended)

**Goal**: Demonstrate that Pado is more than a DEX -- it's a unified financial platform.

| Task | Description | Status |
|------|-------------|--------|
| 20.1 Prediction Market Activation | Ensure 1-2 active markets are running at launch with seed liquidity | Pending |
| 20.2 Lottery Round Activation | Ensure 1 active lottery round is running at launch | Pending |
| 20.3 Cross-Feature Navigation | Smooth transitions between Trading, Prediction, Lottery from main nav | Pending |

### Phase 21: V7 Contract Redeployment -- ✅ Complete

All contracts successfully deployed on V7 (2026-02-04 reset).

| Task | Description | Status |
|------|-------------|--------|
| 21.1 Oracle Redeployment | pado_oracle deployed on V7 | ✅ Done |
| 21.2 Lending Redeployment | pado_lending deployed on V7 | ✅ Done |
| 21.3 Margin Redeployment | unified_margin deployed on V7 | ✅ Done |
| 21.4 Perp Redeployment | pado_perp deployed on V7 | ✅ Done |
| 21.5 Frontend .env Update | Perp/Margin/Lending .env 주소 연동 필요 | Pending |

---

## Post-Funding Roadmap (Tier 4 -- Vision Document Only)

These features are implemented or partially implemented but are **not required for prototype launch**. They become priorities after community formation and initial funding.

| Feature | Current State | Priority Trigger |
|---------|--------------|-----------------|
| Perpetuals Trading UI | Phase 11.3 UI exists, contracts V7 deployed, .env integration pending | After funding, when liquidity is meaningful |
| Unified Margin v2 (Spot-Perp Integration) | Contracts V7 deployed, UI integration pending | After perp .env integration |
| Lending & Borrowing | Contract V7 deployed, UI not built | After core user base established |
| Encrypted DMs | Not started | When users request it |
| AI Agents (Risk Sentinel, Market Narrator) | Not started | When data indexing is stable |
| Category Chat Tabs | Not started | When single chat becomes too noisy |
| Copy Trading / Reputation System | Not started | When community has meaningful participation |
| Strategy Marketplace / Tournaments | Not started | When community is self-sustaining |

---

## Changelog

| Date | Change |
|------|--------|
| 2026-02-07 | Phase 19 (Social Layer), Phase 21 (V7 deploy) marked complete. V7 contract status updated |
| 2026-02-05 | Phase 22: LP Bot implementation complete (Binance price, 20-level grid, PM2 deploy) |
| 2026-01-31 | Full rewrite: prototype launch strategy aligned with social layer discussion |
| 2026-01-17 | Phase 16 v1, 11.1-11.4, 17 completion status update |
| 2026-01-10 | Phase 16 v1, 11.1-11.2 completion status update |
| 2026-01-09 | Phase 17 completion status update |
| 2026-01-04 | Phase 9, 14, 15 completion status update |
| 2025-12-25 | Initial creation |
