# Pado Next Steps: Prototype Launch

> Last Updated: 2026-02-23
> Vision: **Finance-first social -- a financial platform where community forms around execution, not hype.**
> Strategic Reference: [SOCIAL_LAYER_DISCUSSION.md](SOCIAL_LAYER_DISCUSSION.md)

---

## Current State Summary

Pado has **22 completed development phases** covering spot trading (4 pools), perpetuals, prediction markets, lottery, payments, unified margin, zkLogin, passkey auth, social layer (chat + leaderboard + competitions + PnL share + badges + market narrator + points system), LP bot, TP/SL keeper, and testnet launch polish. All contracts deployed on V7. The core financial engine and community infrastructure are functional and polished.

### Devnet V7 Deployment Status (2026-02-04)

| Category | Status |
|----------|--------|
| Tokens (NBTC, NUSDC, Faucet V1+V2) | ✅ V7 |
| DeepBook V3 (Spot CLOB, 4 pools) | ✅ V7 |
| Prediction Markets | ✅ V7 |
| Lottery | ✅ V7 |
| Governance | ✅ V7 |
| Oracle (pado_oracle) | ✅ V7 |
| Lending (pado_lending) | ✅ V7 |
| Margin (unified_margin) | ✅ V7 |
| Perpetuals (pado_perp) | ✅ V7 |
| Nasun Smart Account (NSA) | ✅ V7 |

---

## Completed Phases (Summary)

- **Phase 18 (Prototype Polish)**: ✅ -- E2E trading flow, onboarding tour, GettingStartedCard, first-trade celebration, keyboard shortcuts, error parsing
- **Phase 19 (Social Layer)**: ✅ -- Global chat, leaderboard, trader profiles, competitions, PnL share, badges, market narrator
- **Phase 20 (LP Bot)**: ✅ -- Grid market making (NBTC/NETH/NSOL), Binance price feed, auto-faucet
- **Phase 21 (V7 Redeployment)**: ✅ -- All contracts redeployed on V7
- **Phase 22 (Testnet Polish)**: ✅ -- Bug fixes, points system, enhanced share cards, mobile UX, loading skeletons, actionable errors

---

## Priority: Launch Activation (Operational)

### Prediction Market Activation
- Create 1-2 markets with clear outcomes (e.g., a time-bound event)
- Seed with initial liquidity so the market isn't empty
- Verify resolution flow works end-to-end

### Lottery Activation
- Create 1 active round before launch
- Verify ticket purchase -> draw -> settlement -> claim flow
- Ensure prize pool display is clear and compelling

---

## Protocol-Level Roadmap (Post-Mainnet)

### Native Conditional Orders (Priority: Must-Have)

**Problem**: DeepBook V3 supports only limit/market orders. TP/SL, Stop-Limit, and
Trailing Stop orders depend on an off-chain keeper bot or client browser polling.
This creates a single point of failure, browser dependency, and trust concerns.

**Current state**: Keeper Bot running (PM2, Port 4001). Frontend delegates TradeCap
for server-side TP/SL. Browser polling is the fallback. TP/SL keeper modal guides
users to enable server mode on first TP/SL activation.

**Competitive comparison**:

| Platform | Conditional Order Execution | Trust Model |
|----------|---------------------------|-------------|
| Binance/Bybit | Matching engine (central server) | Custodial |
| Hyperliquid | Validator consensus (on-chain) | Trustless |
| dYdX v4 | Validator memory (off-chain -> on-chain settlement) | Trustless |
| Pado (current) | Keeper Bot (single server) + browser | Semi-trust |

**Goal**: Nasun L1 protocol upgrade to support trustless conditional orders.

**Implementation paths** (by difficulty):

1. **DeepBook Conditional Order Module** (Medium)
   - Add on-chain TP/SL/Stop-Limit support via Move module upgrade
   - Matching engine checks conditional orders on price updates
   - No keeper bot needed, fully trustless
   - Estimated scope: new `conditional_order` module + pool integration

2. **Validator-Level Trigger System** (Hard)
   - Validators check trigger conditions during block production (like Hyperliquid)
   - Requires consensus layer modifications
   - Highest performance, lowest latency
   - Nasun controls the validator software (Sui fork) so this is feasible

3. **Scheduled Transaction Framework** (Hard)
   - General-purpose conditional transaction framework
   - Useful beyond trading: DeFi automation, scheduled governance, etc.
   - Broadest impact but largest scope

4. **Permissionless Crank Network** (Low-Medium)
   - Anyone can call a `crank_conditional_orders()` entry function to trigger eligible orders
   - Incentivize crankers with small gas rebate or fee share
   - Already proven pattern in Pado: Lottery draw + Lending liquidation use crank
   - Lowest protocol-level change required (Move module only, no validator changes)
   - Trade-off: trigger latency depends on cranker availability and incentive design

**Why this is feasible for Nasun**: Unlike projects built on top of Sui mainnet,
Nasun is a sovereign L1 (Sui fork) with full control over the validator software
and protocol. Protocol-level conditional orders are an engineering decision, not
a governance or political one.

---

## Post-Launch Improvements (Tier 3)

Items migrated from the completed improvement roadmap. Prioritize based on community feedback.

| Item | Effort | Impact | Description |
|------|--------|--------|-------------|
| Daily quests system | 12h | Retention | "Trade 3 times today" +10pt, homepage checklist |
| Referral system | 7h | Growth | Unique links, referrer point bonus |
| Empty state CTAs | 2.5h | UX | Action buttons on empty orderbook/history/portfolio |
| Button/typography consistency | 5h | Polish | Button variant system, text size standardization |
| Sound effects additions | 1.5h | Feel | Badge unlock, lottery draw, chat notification sounds |
| Narrator bot dynamic pool names | 1h | Accuracy | "NBTC" hardcoded -> pool-specific display |
| TODO comment cleanup | 2h | Code quality | Remove/track production TODO comments |

---

## Not For Prototype (Tier 4)

These are explicitly deferred. Do not work on them until after community formation and funding.

- Perpetuals LP liquidity (Perp UI 100% complete, LP bot does not yet provide perp liquidity)
- Unified Margin v2 (Spot-Perp integration, contracts V7 deployed)
- Lending & Borrowing full UI (contract V7 deployed, UI stubs at 40%)
- Chat Tabs / Room system (server-side room support exists)
- AI Market Narrator v2 (multi-pool support, richer summaries)
- Encrypted DMs
- Copy Trading
- Reputation System / ZKP Leaderboards
- Strategy Marketplace
- Tournaments

---

## Dependencies & Infrastructure

| Need | Solution | Cost |
|------|----------|------|
| LP Bot (3 markets) | PM2 processes on existing EC2 (staging/production) | $0 additional |
| Price Updater | PM2 process, Binance/CoinGecko -> DevOracle (30s interval) | $0 additional |
| TP/SL Keeper | PM2 process, HTTP API port 4001, TradeCap delegation | $0 additional |
| Liquidation Keeper | PM2 process, perp position monitoring (10s interval) | $0 additional |
| WebSocket server (chat) | Run on existing EC2, single service (chat + leaderboard + competitions) | $0 additional |
| Message storage | SQLite file on EC2 | $0 |
| Domain/SSL | pado.finance (prod), staging.pado.finance (staging) | $0 |

No new AWS resources required for prototype launch.

---

## Open Questions

1. What testnet campaign (leaderboard competition, faucet event) will drive initial activity at launch?
2. Should leaderboard rankings carry weight in NFT whitelist allocation?
3. Landing page: should visitors land on a dedicated landing page or go directly to the trading view?
4. What is the target concurrent user count for launch day?

---

## Changelog

| Date | Change |
|------|--------|
| 2026-02-23 | Doc cleanup: consolidated Tier 3 items from IMPROVEMENT_ROADMAP.md, removed completed phases detail, updated infrastructure table |
| 2026-02-15 | Phase 22 (Testnet Launch Polish) complete: T1+T2 done, TP/SL Keeper modal wired |
| 2026-02-07 | Phase 19 (Social Layer) marked complete |
| 2026-02-05 | LP Bot implementation complete |
| 2026-01-31 | Full rewrite: prototype launch priorities aligned with social layer strategy |
