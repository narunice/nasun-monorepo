# Prediction Market UX Roadmap

> Written: 2026-05-02
> Goal: Industry-leading prediction market UX, accessible to first-time users while powerful enough for experienced traders.
> Reference benchmark: Polymarket (gold standard), Manifold Markets (social/onboarding)

---

## Current State Assessment

### What works
- Binary YES/NO orderbook with CLOB mechanics
- Market card grid with probability bar
- Limit + market order entry
- Open orders list with cancel
- Position list with claim/sell
- Admin resolve flow
- Keeper auto-resolution via Binance oracle

### Critical gaps vs. Polymarket
| Feature | Polymarket | Pado (current) |
|---|---|---|
| Trade history (my fills) | Yes | No (hook exists, no UI) |
| Market activity feed | Yes | No |
| Probability chart over time | Yes | No |
| Payout calculator | Yes | No |
| Portfolio view (all markets) | Yes | No |
| Market search/filter | Yes | No |
| Onboarding tour | No | No |
| Share button | Yes | No |
| Mobile-first layout | Yes | Partial |

---

## Priority Tiers

### P0 - Ship in next sprint (quick wins, high impact)

#### P0-1: My Trade History Panel
**What**: Show filled orders per-market, separate from open orders.
**Why**: After a market order fills, user sees no confirmation in the UI. Erodes trust.
**Implementation**: `useRecentFills` hook already built but unconnected. Add `MyTradeHistory` component that filters `RecentFill[]` by current wallet address and renders a table.
**Data fields**: side (BUY YES / SELL NO etc.), shares, avg price, cost, time ago
**Location**: Add as a tab alongside "My Open Orders" in the right sidebar, or as a collapsible panel below PositionList.

#### P0-2: Market Activity Feed (Recent Trades)
**What**: Live feed of all recent fills in this market (not just mine).
**Why**: Empty orderbooks look dead. A live trades feed signals real activity and market health.
**Implementation**: `useRecentFills` already fetches all fills. Render as a compact ticker: "BUY YES 0.52 | 100 shares | 2m ago"
**Location**: New panel in the left column, below OutcomeOrderbook.
**Design**: 5-10 rows, newest first. Green for YES buys, red for NO buys. Auto-updates every 15s.

#### P0-3: Payout Calculator in Order Form
**What**: Real-time "If YES wins, you receive: $XX.XX" line in the order form.
**Why**: New users don't intuitively understand that buying YES at 0.35 means 2.86x payout. Without this, they can't evaluate if the risk/reward makes sense.
**Implementation**: Inline calculation in OutcomeOrderForm:
- BUY YES at price P for N shares: payout = N shares x $0.01/share if resolved YES
- Cost = N * P / 10000 * (NUSDC unit). Profit if wins = cost / P * (1 - P).
- Show: "Cost: $3.50 | Max payout: $10.00 | Return: +186%"
**Design**: Show in muted text below the submit button. Update live as user types.

#### P0-4: Price Impact Warning for Market Orders
**What**: When switching to Market order type, show estimated fill price and slippage.
**Why**: Market orders walk the book. A large market order at thin liquidity could fill at 95c on a 50c YES token. User needs to know before confirming.
**Implementation**: Walk the ask/bid levels to compute weighted average fill price. If fill price deviates >5% from mid, show yellow warning. If >15%, show red warning with "High slippage" label.

#### P0-5: Market Status "Closed, Awaiting Resolution" State
**What**: When market is past close time but not yet resolved, show a clear "Market Closed - Awaiting Resolution" banner with countdown to resolve deadline.
**Why**: Users see an open-looking UI but cannot trade. Confusing. The MarketCard already has a `status === 'closed'` badge case but MarketStatus type doesn't include 'closed' - it just stays 'open' until resolved.
**Implementation**: Derive `isClosedNotResolved = market.status === 'open' && now >= market.closeTime`. Show banner explaining that keeper bot will auto-resolve by deadline.

---

### P1 - Next major feature batch

#### P1-1: Portfolio View (/predict/portfolio)
**What**: New page listing all markets where I have open positions or pending claims.
**Why**: Users with positions in multiple markets have no way to track them without visiting each market individually.
**Implementation**:
- New `usePredictionPortfolio` hook: scan `PositionCreated`/`PositionUpdated` events by owner, batch-fetch position objects
- Table view: Market question | My position (YES/NO + shares) | Current value (midpoint estimate) | P&L | Status | Action
- "Claim All" batch button for resolved markets where I hold winning positions
- Link in the top nav or as a tab on PredictPage

#### P1-2: Onboarding Tour
**What**: Step-by-step overlay for first-time visitors explaining how prediction markets work.
**Why**: Binary outcome markets with CLOB pricing are conceptually unfamiliar to most users. Without explanation, users guess, lose money, and don't return.
**Trigger**: Show automatically when `localStorage['prediction_tour_completed']` is not set. Dismissible. Accessible via "?" help button permanently.
**Steps** (6 steps):
1. "What is a prediction market?" - You bet YES or NO on a question. If you're right, you profit.
2. "Prices are probabilities" - YES at $0.35 means the market thinks there's a 35% chance this resolves YES.
3. "How to buy" - Click a price in the orderbook, or type your own. Limit orders rest in the book.
4. "Your potential payout" - If you buy 100 YES shares at $0.35 total cost = $35. If YES wins, you receive $100. That's 186% return.
5. "When does it resolve?" - At the close time, a verified source (e.g. Binance API) determines the outcome. The keeper bot resolves automatically.
6. "Managing positions" - You can sell before resolution. Your open positions appear in the right sidebar.
**Design**: Spotlight overlay (darken background, highlight target element with glow). Progress dots at bottom. "Got it, let's trade" CTA on last step.

#### P1-3: "How It Works" Explainer Panel
**What**: Collapsible/modal explainer accessible at any time on the market page.
**Why**: Onboarding tour runs once. Users forget or need to re-check specific concepts.
**Implementation**: "?" icon button in MarketHeader. Opens a modal with tabbed content:
- "Buying & Selling" tab
- "Prices & Probability" tab
- "Resolution" tab
- FAQ: "What if the market doesn't resolve?" / "Can I trade after close?" / "How are prices set?"

#### P1-4: Market List Improvements
**What**: Search, filter by category/status, sort by volume/close time/probability.
**Why**: As markets grow, the grid becomes unusable without discovery tools.
**Implementation on PredictPage**:
- Search bar (client-side filter on question text)
- Status filter pills: All / Open / Closing Soon (< 24h) / Resolved
- Category filter: All / Crypto / Sports / Politics / Custom
- Sort dropdown: Trending | Volume | Closing Soon | Newest
- "Closing Soon" section: pinned row of markets closing within 24h

#### P1-5: Share Market Button
**What**: Copy-to-clipboard link + Twitter/X pre-filled share text.
**Why**: Social sharing is the cheapest user acquisition. Prediction markets are inherently sharable ("I bet $50 that BTC hits $100k").
**Implementation**: Share button in MarketHeader:
- Copy link (pado.finance/predict/{id})
- "Share on X": pre-fill text "I think {outcome} on '{question}' - trade it on Pado: {url}"
**Design**: Small icon button next to market title.

#### P1-6: Mobile UX Overhaul
**What**: Redesign the market page for mobile (<768px) as a bottom-sheet trading panel.
**Why**: Current mobile layout stacks accordion-style but the order form is buried. Most crypto users trade on mobile.
**Implementation**:
- Sticky "Buy YES / Buy NO" buttons at bottom of viewport on mobile
- Tapping opens a bottom sheet drawer with the order form
- Orderbook collapses to a summary row (best bid/ask + spread) with expandable detail
- Portfolio tab bar at bottom on mobile PredictPage

---

### P2 - Depth & Delight (v1.5+)

#### P2-1: Probability Chart (Price History)
**What**: Line chart showing YES probability over time since market creation.
**Why**: Polymarket's most-used feature. Shows how consensus has shifted.
**Technical dependency**: Requires indexer storing `OrderFilled` events with timestamp. Currently we poll events but don't store history. Options:
  - Option A: Use existing chat-server DB to store price snapshots every 5 min (cheap)
  - Option B: Dedicated indexer service (expensive, overkill for v1)
**Recommendation**: Option A - schedule a lightweight "price snapshot" cron in chat-server. Store (marketId, timestamp, yesBestBid, yesBestAsk) on a 5-min interval. Query last 7 days for chart.
**Chart**: Recharts area chart, y-axis 0-100%, x-axis timeline. Green shaded area = YES probability.

#### P2-2: Liquidity Depth Visualization
**What**: Depth chart showing cumulative bid/ask liquidity as a function of price.
**Why**: Shows traders where liquidity concentration is. Polymarket has this.
**Implementation**: Recharts AreaChart with bids in green (right-to-left) and asks in red (left-to-right). Computed from current orderbook data (no new data needed).

#### P2-3: Resolved Market P&L Summary
**What**: On resolved markets, show "You won +$X.XX" or "You lost -$X.XX" prominently.
**Why**: Clear feedback loop. Encourages return visits.
**Implementation**: In PositionList for resolved markets, show P&L = (claim amount - cost basis) with color-coded pill.

#### P2-4: Market Comments / Discussion
**What**: Simple threaded comments on each market page.
**Why**: Discussion around the resolution criteria and news is core to prediction market culture.
**Technical dependency**: Chat server already handles threaded messages. New `market_discussion` channel type per marketId.

#### P2-5: Public Market Creation UI
**What**: Allow any user (not just admin) to create prediction markets via a form UI.
**Why**: Community-generated markets are the growth engine. Polymarket curates but also allows community proposals.
**Technical dependency**: Move contract requires AdminCap for market creation. Options:
  - Option A: Add a separate "MarketProposalCap" to the contract (requires contract upgrade)
  - Option B: Proxy creation: user submits form, admin reviews + creates on-chain
  - Option C: Decentralized trust: any address can create, outcomes verified by oracle
**Recommendation**: Start with Option B as a stepping stone. Add CreateMarketForm visible to all users that submits a proposal. Admin approves in /predict/admin.

#### P2-6: Keyboard Shortcuts for Power Users
| Shortcut | Action |
|---|---|
| `B` | Focus BUY order form |
| `S` | Focus SELL order form |
| `Y` | Switch to YES |
| `N` | Switch to NO |
| `Esc` | Cancel / close modal |
| `Enter` | Confirm order (when form focused) |

---

## UX Design Principles for This Feature

1. **Prices are probabilities first**: Always display YES price as "35%" not "$0.35". Novice users think in probabilities, not prices. Show both but lead with %.

2. **Payout clarity before commitment**: The user must see "If YES wins: +$X.XX" before they tap confirm. Never make them calculate it.

3. **Resolution transparency**: The resolution source URL and exact criteria must be visible on every market page without scrolling. Trust is the entire product.

4. **Activity signals liquidity**: Show recent trades and volume prominently. An empty-looking market drives users away even if it's functional.

5. **One-tap from discovery to position**: Market list -> market page -> trade should require at most 3 taps on mobile.

6. **Never leave users in ambiguous state**: Closed but unresolved markets need clear messaging. Pending transactions need spinners + expected wait time.

---

## Suggested Implementation Order

1. **P0-1** Trade History Panel (1 day - hook exists, UI only)
2. **P0-2** Market Activity Feed (0.5 day - hook exists)
3. **P0-3** Payout Calculator (0.5 day - pure UI calculation)
4. **P0-5** Closed-not-resolved state banner (0.5 day)
5. **P1-2** Onboarding Tour (2 days - first-time UX, highest leverage for new users)
6. **P1-4** Market List improvements + search (1 day)
7. **P0-4** Price impact warning (1 day)
8. **P1-1** Portfolio view (2 days)
9. **P1-5** Share button (0.5 day)
10. **P1-6** Mobile bottom-sheet overhaul (2 days)
11. **P2-1** Probability chart (3 days including chat-server snapshots)
12. **P2-3** Resolved P&L summary (1 day)
13. **P2-5** Public market creation (3 days)
