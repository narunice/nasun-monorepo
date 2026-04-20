# Pado Bots - Liquidity Provider & Infrastructure

Automated infrastructure and market-making bots for the Pado trading platform on Nasun Devnet.

---

## 1. Overview

The bot suite provides continuous on-chain liquidity for Pado's spot markets (DeepBook V3 CLOB) and keeps the system's operational state consistent without manual intervention.

**Running processes (PM2)**:
| Process | Source | Role |
|---------|--------|------|
| `lp-bot-nbtc` | `lp-bot.ts` | Grid market maker, NBTC/NUSDC |
| `lp-bot-neth` | `lp-bot.ts` | Grid market maker, NETH/NUSDC |
| `lp-bot-nsol` | `lp-bot.ts` | Grid market maker, NSOL/NUSDC |
| `price-updater` | `price-updater.ts` | Oracle price feed to on-chain state |
| `tpsl-keeper` | `tpsl-keeper.ts` | TP/SL order execution |
| `lottery-keeper` | `lottery-keeper.ts` | Weekly lottery automation |
| `balance-watchdog` | `scripts/balance-watchdog.ts` | Gas and token monitoring |

**Supported Markets**:
| Market | Pool | Tick Size | Lot Size | Oracle |
|--------|------|-----------|----------|--------|
| NBTC/NUSDC | `0xa2b755...` | $0.10 | 0.00001 NBTC | Binance BTCUSDT |
| NETH/NUSDC | `0xb6c960...` | $0.10 | 0.00001 NETH | Binance ETHUSDT |
| NSOL/NUSDC | `0x577f81...` | $0.01 | 1.0 NSOL | Binance SOLUSDT |

---

## 2. System Architecture

```
lp-bot.ts (per market)
    |
    +-- lib/price-source.ts     Binance REST API, 5s cache
    +-- lib/config.ts           Market config, env vars, type definitions
    +-- lib/balance-manager.ts  BalanceManager discovery, deposit, balance queries
    +-- lib/faucet.ts           On-chain token faucets (V1/V2) + HTTP gas faucet
    +-- lib/orderbook.ts        Pool state via devInspect
    +-- lib/arbitrage.ts        Crossing-bid/ask detection and IOC execution
    +-- lib/strategy.ts         Grid order generation with inventory skew
    +-- lib/order-manager.ts    TX builders, executeTransaction, syncOrders self-heal
    +-- lib/retry.ts            Exponential backoff with non-retriable error detection

scripts/balance-watchdog.ts     Independent process (5-min interval)
```

**On-chain contracts (Nasun Devnet)**:
- DeepBook V3 Package: `0xb4a100f2...`
- Token Package V1 (NBTC/NUSDC): `0x96adf476...`
- Token Faucet V1: `0x7cc75ad1...`
- Token Package V2 (NETH/NSOL): `0xcc65166f...` / `0xe672843f...`

---

## 3. Initialization Pipeline (`initialize`)

When a bot process starts, it runs a one-time initialization before entering the main loop:

```
1. Gas check
   - Query wallet NASUN balance
   - If < 1,000 NASUN: wait (balance-watchdog will refill)

2. BalanceManager setup
   - Load persisted ID from data/.lp-bot-state-{market}.json
   - If not found: query getOwnedObjects on bot address for BalanceManager type
   - If still not found: create a new BalanceManager via DeepBook V3

3. Inventory check
   - Sum wallet + BalanceManager balances for base and quote tokens
   - Required minimum: orderSize * orderLevels * 1.2 base tokens
   - If below threshold: call on-chain faucet (up to 5 rounds at startup)

4. Deposit
   - Transfer all wallet tokens into BalanceManager
   - Set justInitialized = true (skip one cycle for RPC to index)

5. Staggered startup
   - NBTC: 0s delay
   - NETH: 20s delay
   - NSOL: 40s delay
   (Prevents gas coin contention when restarting all bots simultaneously)
```

Initialization retries up to 20 times (5-minute intervals) before exiting. This prevents PM2 restart loops from flooding the faucet.

---

## 4. Main Loop Cycle (`runBot`)

Runs every `LP_UPDATE_INTERVAL` ms (default: 10s). Each step uses `withRetry` for transient RPC errors.

```
Step 0: Gas check
  - If wallet NASUN < LP_GAS_REFILL_THRESHOLD (1,000): skip cycle
  - balance-watchdog handles the refill independently

Step 1: Oracle price
  - Fetch from Binance REST API (/api/v3/ticker/price)
  - Cache TTL: 5s. Stale fallback: up to 1min old
  - On total failure: use stale price with warning

Step 2: Price validation
  - Reject if price outside [LP_MIN_PRICE, LP_MAX_PRICE]
  - Prevents quoting during flash crashes or data errors

Step 3: BalanceManager check
  - Verify state.balanceManagerId is set (initialize lazily if restarted mid-session)

Step 4: Inventory check and refill
  - If base < LP_REFILL_THRESHOLD_BASE OR quote < LP_REFILL_THRESHOLD_QUOTE:
    * Call on-chain faucet (unless LP_DISABLE_TOKEN_FAUCET=true)
    * Deposit any wallet tokens to BalanceManager

Step 5: Orderbook query
  - Call pool::get_level2_ticks_from_mid via devInspect (100 levels)
  - Returns: bids[], asks[] with price and aggregated quantity per level
  - On failure: returns empty state (handled gracefully downstream)

Step 6: Arbitrage (runs every cycle regardless of requote threshold)
  - Scan bids above oracle price: place IOC ask to sell at their price
  - Scan asks below oracle price: place IOC bid to buy at their price
  - Minimum profit threshold: LP_MIN_ARB_PROFIT_BPS (default: 10bps)
  - Maximum quantity: LP_MAX_ARB_QUANTITY (per-market)
  - After execution: wait 3s, re-fetch orderbook before generating grid

Step 6.5: Requote threshold check
  - If |currentPrice - lastQuotedPrice| < LP_REQUOTE_THRESHOLD_BPS AND no arb ran:
    * Increment skipCount; skip cancel+place (avoids TX churn during stable prices)
    * Force refresh every 3 skips (MAX_SKIP_CYCLES)
  - Exception: if orderbook mid diverges > LP_DIVERGENCE_THRESHOLD_BPS from oracle,
    force requote even if price is stable (clears contaminated book)

Step 7: Order generation
  - calculateOrders() in strategy.ts: grid around oracle price
  - Cap to available inventory (95% of BalanceManager balance)
  - validateOrders(): filter by maxOrderSize and minSpreadBps

Step 8: Atomic cancel+place
  - Single TX: cancel_all_orders + 90x place_limit_order (POST_ONLY)
  - On failure: 3-level self-heal (see Section 6)
```

---

## 5. Order Generation Strategy (`lib/strategy.ts`)

### Grid Structure

Orders are placed symmetrically around the oracle mid-price:

```
ask[44]  ...  oracle * (1 + spread + 44*spacing + skew)
ask[1]         oracle * (1 + spread + 1*spacing + skew)
ask[0]         oracle * (1 + spread + skew)          <- innermost ask
---- oracle mid ----
bid[0]         oracle * (1 - spread - skew)          <- innermost bid
bid[1]         oracle * (1 - spread - 1*spacing - skew)
bid[44]  ...  oracle * (1 - spread - 44*spacing - skew)
```

Where `spread = LP_SPREAD_BPS / 2 / 10000` (half-spread per side).

### Inventory Skew Adjustment

Rebalances inventory by asymmetrically shifting the grid:

- `baseRatio = baseValue / totalPortfolioValue`
- If `baseRatio > 0.6`: too much base token (e.g. too much NBTC)
  - Widen bids (buy less aggressively), tighten asks (sell more)
- If `quoteRatio > 0.6`: too much quote token (e.g. too much NUSDC)
  - Tighten bids (buy more aggressively), widen asks (sell less)
- Adjustment capped at `30% of LP_SPREAD_BPS` to prevent extreme pricing

### Orderbook-Derived Constraints

- `maxBidPrice`: derived from `bestAsk * 0.9999` (bid must not cross existing asks)
- `minAskPrice`: derived from `bestBid * 1.0001` (ask must not cross existing bids)
- Both clamped within 3% of oracle to ignore anomalous stale orders

---

## 6. Order Management & Self-Healing (`lib/order-manager.ts`)

### Transaction Structure

The primary TX (`buildCancelAndPlaceOrders`) is a single PTB:
- Command 0: `generate_proof_as_owner` (trade authorization)
- Command 1: `cancel_all_orders`
- Commands 2..N: pairs of `place_limit_order` + `order_id` (90 orders = 180 commands)

`place_limit_order` parameters for grid orders:
- Order type: `POST_ONLY` (rejects if crossing the book)
- Self-matching: `CANCEL_TAKER`
- Expiry: `Date.now() + 600,000ms` (10 minutes; auto-expires if bot dies)

### 3-Level Self-Healing in `syncOrders`

```
Level 0: Standard atomic cancel+place
  TX: cancel_all + 90x place_limit_order
  |
  +--> success -> done
  |
  +--> "not available for consumption" (object version conflict)
  |     Level 1: Wait 3s, rebuild TX with fresh object versions, retry once
  |
  +--> "assert_execution" code 5 (EPOSTOrderCrossesOrderbook)
        Level 2a: Split cancel+place
          TX1: cancel_all_orders -> success (clears bot's own orders)
          TX2: place_limit_order x90 -> retry
          |
          +--> success -> done
          |
          +--> "assert_execution" again (foreign bid still blocking)
                Level 2b: IOC Sweep
                  Compute: innermostAskPrice = min price across all ask orders
                  Compute: sweepQuantity = sum of all ask quantities
                  TX: IOC ask at innermostAskPrice for sweepQuantity
                    -> Fills any bid >= innermostAskPrice at execution time
                    -> IOC: fills what it can, expires remainder silently
                  Wait 2s for RPC to index sweep TX
                  TX: place_limit_order x90 (retry POST_ONLY placement)
```

**Why IOC sweep works without devInspect**: The IOC order is evaluated against the live book at TX execution time on the fullnode, bypassing the devInspect timing race that caused the bot to miss the crossing bid.

---

## 7. Arbitrage Module (`lib/arbitrage.ts`)

Detects and exploits mispriced orders placed by external users:

**Detection** (runs each cycle from `fullOrderbook.bids/asks`):
- Bid above oracle: SELL opportunity (sell base to user at their high price)
- Ask below oracle: BUY opportunity (buy base from user at their low price)
- Minimum profit: `LP_MIN_ARB_PROFIT_BPS` basis points vs oracle

**Execution**:
- IOC (Immediate-Or-Cancel) order at the user's price
- Fills if the order still exists at execution time; harmless miss otherwise
- Single TX can contain multiple arb trades (one per opportunity)

**Post-arb**:
- Wait 3s for RPC indexing
- Re-fetch orderbook to get post-arb snapshot
- Then generate grid around current oracle (not stale pre-arb mid)

---

## 8. Inventory & Gas Management

### BalanceManager

DeepBook V3 uses a `BalanceManager` object as an on-chain account that holds base and quote tokens for a given bot address. This avoids per-order coin object management.

- Discovery: `getOwnedObjects` filtered by `BalanceManager` type
- Persistence: `.data/lp-bot-state-{market}.json` stores the object ID across restarts
- Deposit: `balance_manager::deposit` moves wallet coins into the manager

### On-Chain Token Faucets

| Market | Faucet Type | Call |
|--------|-------------|------|
| NBTC | V1 (on-chain, no cooldown) | `token_faucet::request_tokens` |
| NUSDC | V1 (on-chain, no cooldown) | `token_faucet::request_tokens` |
| NETH | V2 (on-chain, no cooldown) | `faucet::request_neth` |
| NSOL | V2 (on-chain, no cooldown) | `faucet::request_nsol` |

Faucet calls are throttled by the bot (3s delay between rounds) to avoid RPC object-version conflicts.

### Gas (NASUN) Management

- **Consumption**: ~300-360 NASUN/hour per bot (TX every 10s)
- **`balance-watchdog`** (independent PM2 process, 5-min interval):
  - Queries wallet NASUN balance for each bot address
  - If balance < `WATCHDOG_GAS_THRESHOLD` (default: 5,000 NASUN):
    - POST `https://faucet.devnet.nasun.io/v1/gas` with bot address
    - Bot addresses are in the faucet whitelist: cooldown bypass, unlimited requests
- **Bot self-check (Step 0)**: Skips the cycle if gas < 1,000 NASUN (avoids failed TXs)

---

## 9. Risk Controls

| Control | Mechanism | Config |
|---------|-----------|--------|
| Circuit breaker | After N consecutive failures: exponential cooldown (max 60s), auto-recover | `LP_MAX_FAILURES=5` |
| Price bounds | Reject oracle price outside range; stop quoting | `LP_MIN_PRICE`, `LP_MAX_PRICE` |
| Order TTL | All orders expire after 10 min; book self-cleans if bot dies | Hardcoded in order builder |
| Graceful shutdown | `cancel_all_orders` on SIGINT/SIGTERM; 3s timeout, best-effort | Signal handlers in `main()` |
| Max order size | Per-order size cap; filters at validation stage | `LP_MAX_ORDER_SIZE` |
| Divergence force-requote | If book mid diverges > threshold from oracle, force full refresh | `LP_DIVERGENCE_THRESHOLD_BPS` |
| Inventory cap | Orders capped to 95% of BalanceManager balance (reserves for maker fees) | Computed per cycle |
| Non-retriable detection | `withRetry` skips retry for lock conflicts, equivocation errors | `lib/retry.ts` |

---

## 10. Configuration Reference

### Environment Variables

All variables are set in `ecosystem.config.cjs`. Per-market overrides take precedence over common defaults.

| Variable | Description | NBTC | NETH | NSOL |
|----------|-------------|------|------|------|
| `LP_MARKET` | Market selector | `NBTC` | `NETH` | `NSOL` |
| `LP_PRIVATE_KEY` | Hex or bech32 private key | per-bot | per-bot | per-bot |
| `LP_SPREAD_BPS` | Half-spread per side in bps | 20 | 6 | 6 |
| `LP_LEVEL_SPACING_BPS` | BPS between grid levels | 6 | 12 | 15 |
| `LP_ORDER_LEVELS` | Levels per side | 45 | 45 | 45 |
| `LP_ORDER_SIZE` | Base tokens per order | 0.1 | 2 | 30 |
| `LP_MAX_ORDER_SIZE` | Max base tokens per order | 0.5 | 10 | 1000 |
| `LP_UPDATE_INTERVAL` | Loop interval (ms) | 10000 | 10000 | 10000 |
| `LP_REQUOTE_THRESHOLD` | Min price move to requote (bps) | 20 | 20 | 20 |
| `LP_MIN_PRICE` | Price floor for oracle validation | $50,000 | $1,000 | $10 |
| `LP_MAX_PRICE` | Price ceiling for oracle validation | $200,000 | $10,000 | $1,000 |
| `LP_MAX_FAILURES` | Circuit breaker threshold | 5 | 5 | 5 |
| `LP_GAS_REFILL_THRESHOLD` | Skip cycle if gas below this (NASUN) | 1,000 | 1,000 | 1,000 |
| `LP_ENABLE_ARBITRAGE` | Enable/disable arb module | true | true | true |
| `LP_MIN_ARB_PROFIT_BPS` | Min profit to execute arb | 10 | 10 | 10 |
| `LP_MAX_ARB_QUANTITY` | Max base qty per arb trade | 10 | 5 | 100 |
| `LP_DIVERGENCE_THRESHOLD_BPS` | Force requote if mid deviates this much | 30 | 30 | 30 |
| `LP_MIN_SPREAD_BPS` | Minimum allowed spread (validation) | 10 | 10 | 10 |
| `LP_REFILL_THRESHOLD_BASE` | Trigger token refill below this (base) | 6 | - | - |
| `LP_REFILL_THRESHOLD_QUOTE` | Trigger token refill below this (NUSDC) | 200,000 | 200,000 | 200,000 |
| `LP_DISABLE_TOKEN_FAUCET` | Disable on-chain token faucet | true | true | true |
| `NASUN_RPC_URL` | RPC endpoint | `https://rpc.devnet.nasun.io` | - | - |
| `NASUN_FAUCET_URL` | Gas faucet HTTP endpoint | `https://faucet.devnet.nasun.io` | - | - |

---

## 11. Known Failure Patterns

| Symptom | Root Cause | Resolution |
|---------|-----------|------------|
| `[ALERT] Depth critically low! bid=$0 ask=$0` repeated | Circuit breaker loop; bot failing to place orders | Check error logs for underlying code (see below) |
| `assert_execution code 5` (`EPOSTOrderCrossesOrderbook`) | Foreign bid above bot's innermost ask | Level-2 self-heal fires IOC sweep automatically; if persistent, check pm2 logs for "IOC sweep" messages |
| `Gas exhaustion` in logs | Wallet NASUN below threshold | Check balance-watchdog logs; manually call gas faucet if watchdog is down |
| `Object not available for consumption` | Stale object version after RPC lag | Level-1 self-heal (3s rebuild) handles this automatically |
| `Orderbook empty across all markets` | All bots stopped (gas or crash) | `pm2 restart lp-bot-nbtc lp-bot-neth lp-bot-nsol`; check gas balances |
| `justInitialized` skip on first cycle | Normal: waits one cycle for RPC to index deposit TX | Not an error; resolves on next cycle |
| Bot stuck in initialization loop | Gas too low to initialize | Wait for balance-watchdog to refill, or manually send NASUN |

---

## 12. Operational Commands

```bash
# Check all process status
pm2 status

# Tail logs for a specific bot
pm2 logs lp-bot-nbtc
pm2 logs lp-bot-nbtc --lines 100

# Restart one bot after deploying updated code
pm2 restart lp-bot-nbtc

# Restart all LP bots
pm2 restart lp-bot-nbtc lp-bot-neth lp-bot-nsol

# Check gas and token balances (dry-run, no transactions)
cd ~/pado-bots && pnpm tsx scripts/balance-watchdog.ts --once

# Cancel all stale orders for a market (emergency cleanup)
LP_MARKET=NBTC LP_PRIVATE_KEY=<key> pnpm tsx scripts/sweep-stale-orders.ts

# Pre-fund a bot wallet (from admin source)
LP_PRIVATE_KEY_SOURCE=<admin_key> pnpm tsx scripts/prefund-bot.ts
```

---

## 13. Deployment Notes

The `apps/pado/bots/` directory in the monorepo is the source of truth. The production server at `__PROD_EC2_HOST__:/home/ec2-user/pado-bots/` is a deployed copy.

To deploy changes:
```bash
# Deploy a specific file
scp -i ~/.ssh/<your-prod-key> \
  apps/pado/bots/lib/order-manager.ts \
  ec2-user@__PROD_EC2_HOST__:/home/ec2-user/pado-bots/lib/order-manager.ts

# Then restart affected bots
ssh -i ~/.ssh/<your-prod-key> ec2-user@__PROD_EC2_HOST__ \
  "pm2 restart lp-bot-nbtc lp-bot-neth lp-bot-nsol"
```
