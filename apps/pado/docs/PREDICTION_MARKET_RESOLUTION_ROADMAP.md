# Prediction Market Resolution Roadmap

Last updated: 2026-05-01
Status: Phase 1 (manual keeper) — preparing for prototype launch (target week of 2026-05-08).

---

## Background

Prediction markets require a trustworthy mechanism to determine final outcomes.
The core question is: who decides the result, and how is that decision made
verifiable?

For Pado, this is not a peripheral concern. The resolution layer is the trust
anchor of the entire product. A single incorrect resolution moves user funds
to the wrong side of every position in that market. Order book matching, NUSDC
custody, and position NFTs are all downstream of one boolean decision. The
resolution mechanism is therefore evaluated against the same standard as
custody itself.

### Industry baseline

| Protocol | Resolution mechanism | Trust assumption |
|---|---|---|
| Polymarket | UMA optimistic oracle (proposer + 7-day dispute window) | UMA token holders + economic security from $UMA staked |
| Augur | REP token holders report; multi-round dispute escalation | $REP economic security; long resolution latency |
| Kalshi | Centralized operator with CFTC license | Operator + regulator |
| Pado (Phase 1) | Designated resolver wallet, manual or keeper-driven | Single resolver address (operator) |

Pado starts where Kalshi sits — single trusted operator — but with full
on-chain transparency of the resolver address and resolution criteria. The
multi-phase plan below moves Pado toward a Polymarket-grade trustlessness
without taking on third-party oracle dependencies that don't support Nasun
Network.

---

## Phase 1 — Manual Oracle Keeper (current)

### Architecture

```
Off-chain keeper bot (single instance, prod only)
  - polls external price API (Binance primary, CoinGecko fallback) every minute
  - while now < closeTime: idle
  - while closeTime ≤ now ≤ resolveDeadline: fetch reference price, resolve
  - calls resolve_market(marketId, outcome: bool) signed by resolver wallet
```

### Trust model

Centralized. The resolver address fixed at market creation has unilateral
authority. Users must trust both the operator's honesty and the operator's
operational discipline (keeper uptime, key custody).

### Guarantees

- Resolution data source recorded in `market.resolutionSource` field
- Resolution criteria recorded in `market.resolutionCriteria` field
- Resolver identity is immutable post-creation (no `update_resolver` entry)
- Cancellation path exists: `cancel_expired_market` is permissionless and
  callable by anyone after `resolveDeadline`, returning all locked funds
- Dispute mechanism: none (deferred to Phase 2)

### Resolution method types

Phase 1 keeper can fully automate the following market types. Event-type
markets remain manual until Phase 2 introduces a structured criteria binding.

| Type | Example | Data source | Automation |
|---|---|---|---|
| Price threshold | "BTC > $100k by 2026-05-19 00:00 UTC" | Binance ticker | Trivial |
| Range | "ETH/BTC in [0.025, 0.035] at close" | Binance ticker | Trivial |
| Volume | "Binance 24h BTC spot volume > $30B" | Binance 24hr ticker | Easy |
| On-chain stat | "Sui TVL > $1B at close" | DefiLlama API | Moderate |
| Event boolean | "Mainnet launched by 2026-06-30" | Manual judgment | Not auto |

### When to use

All markets in the prototype phase. Sufficient for demonstrating product
mechanics and for building early community trust through transparent
documentation of every market's source and criteria.

### Implementation

Bot lives at `apps/pado/bots/prediction-keeper.ts` and follows the stateless
polling pattern established by `lottery-keeper.ts`. The chain is the single
source of truth — no local state file.

```
loop every PREDICTION_KEEPER_INTERVAL_MS (default 60s):
  for marketId in PREDICTION_KEEPER_MARKETS:
    market = fetchMarket(marketId)
    if market.status != 'open': continue
    if now < market.closeTime: continue
    if now > market.resolveDeadline: log warn(window expired); continue

    price = fetchPriceWithRetry(market.criteria.symbol)
    outcome = price >= market.criteria.threshold
    tx = buildResolveMarket(marketId, outcome)
    executeAndWait(tx)
```

Operational details:
- **Single instance**: enforced by pm2 ecosystem, staging keeper disabled
  (avoids LockConflict on the resolver wallet's coin objects)
- **Retry**: API and tx execution wrapped in `withRetry` (5x exponential
  backoff)
- **Multi-source fallback**: Binance primary; on 5xx or network failure,
  fall back to CoinGecko for the same symbol
- **Gas**: resolver wallet enrolled in `keeper-gas-watchdog` targets to
  auto-refill below 1k NASUN
- **`--once` mode**: single-pass execution for testing, no restart loop
- **Env**:
  - `PREDICTION_RESOLVER_KEY` — ed25519 hex or suiprivkey
  - `PREDICTION_KEEPER_MARKETS` — comma-separated market IDs
  - `PREDICTION_KEEPER_INTERVAL_MS` — polling cadence
  - `NASUN_RPC_URL` — RPC endpoint

### Failure modes

| Failure | Impact | Mitigation |
|---|---|---|
| Binance API outage | Resolution delay until window closes | CoinGecko fallback, alert on 3 consecutive failures |
| Resolver key lost | Market never resolves | Anyone can call `cancel_expired_market` after resolveDeadline → users get refunds |
| Bot stopped | Same as above | UI surfaces `CancelExpiredMarketCTA` (already implemented) |
| Single-source price manipulation | Wrong outcome | Phase 1 accepts the risk; Phase 2 introduces multi-source median on-chain |
| RPC outage | Tx submission failure | `withRetry`, secondary RPC endpoint optional |
| Resolver wallet drained | Resolve tx fails for gas | `keeper-gas-watchdog` 1h sweep |

---

## Phase 2 — On-chain Oracle Contract (short-term)

### Architecture

```
Off-chain price feeders (1+ permitted addresses)
  - push price data to PriceFeed shared object via post_price entry
  - oracle contract validates feeder authorization

prediction_market::resolve_market_with_oracle(marketId, oracleObjectId)
  - reads current price from oracle object (with staleness check)
  - compares against market's binding criteria (stored on chain)
  - resolves autonomously based on the on-chain comparison
```

### Move struct sketch

```move
struct PriceFeed has key {
    id: UID,
    prices: Table<vector<u8>, PriceEntry>,   // key: symbol bytes, e.g. b"BTCUSDT"
    feeders: vector<address>,
    max_age_ms: u64,
}

struct PriceEntry has store, drop {
    value: u64,                              // scaled integer
    decimals: u8,
    ts_ms: u64,
    source: vector<u8>,                      // e.g. b"binance"
}

public entry fun post_price(
    feed: &mut PriceFeed,
    symbol: vector<u8>,
    value: u64,
    decimals: u8,
    source: vector<u8>,
    clock: &Clock,
    ctx: &mut TxContext,
)
```

### Trust model

Feeder trust. Same trust assumption as Phase 1 (single off-chain operator
posts data), but raw input data and the comparison logic are both on-chain
and fully auditable. Anyone can verify what number was posted, when, and
how the contract concluded YES or NO from it.

### Comparison with UMA optimistic oracle

UMA's pattern (proposer asserts → 7-day dispute window → if no dispute, the
assertion stands; if disputed, vote escalation) requires a token economy
($UMA) for skin-in-the-game and a community of disputers. Pado does not have
either at Phase 2. The on-chain oracle in Phase 2 is a deterministic price
feed, not an optimistic claim. Phase 3+ may layer dispute mechanics on top.

### Scope

- New Move package: `nasun_oracle::price_feed`
- Shared object: `PriceFeed` (single instance, system-deployed)
- New entry in `prediction_market`: `resolve_market_with_oracle`
- Market creation gains optional `oracle_binding: Option<OracleBinding>`
  field (symbol + comparison + threshold), enabling fully autonomous resolve
- Feeder bot: extension of Phase 1 keeper, replacing direct `resolve_market`
  call with `post_price` + `resolve_market_with_oracle`
- Multi-source: feeder bot computes median across Binance, Coinbase,
  CoinGecko before posting

---

## Phase 3 — Protocol-native Oracle (medium-term)

This phase is uniquely enabled by Nasun being a self-operated L1.
Standard prediction market protocols on Ethereum or Sui cannot do this
without relying on Pyth or Chainlink, which are external dependencies.

### Option A: Validator Oracle (Cosmos x/oracle pattern)

Each validator submits a price vote as part of block proposal. The
protocol takes the median of all validator submissions and writes it to a
system state object at each epoch boundary.

```
Validator node (modified client)
  - fetches price from configured data source
  - includes PriceVote in block proposal metadata
  - consensus: median of all validator votes becomes canonical price
  - written to SystemState object at epoch end

Move contract reads SystemState.price_feed[symbol] directly
```

Trust model: decentralized. No single validator can manipulate the result
without controlling a majority of stake. Defaults to consensus-secured
correctness.

Implementation requires: consensus layer modification (Nasun stack:
Mysticeti-based, validator client at `crates/sui-node/`), validator
client patch, system object schema extension. High engineering cost;
appropriate for mainnet.

### Option B: Native Price Feed System Object (pragmatic middle ground)

Without consensus layer changes, a designated set of validators (or a
multisig) posts prices to a system shared object via privileged
transactions. The contract reads this object.

```
N validators (or multisig) run price feeder clients
  - each posts price independently
  - contract takes median of recent M submissions within T time window
  - staleness check: reject prices older than T minutes
```

Trust model: M-of-N validator trust. Better than single resolver;
achievable without consensus changes. Recommended for testnet and
pre-mainnet phase.

### Option C: Epoch-boundary Auto-Settlement

At epoch end, a system transaction automatically settles all markets
whose `closeTime` has passed. This eliminates the liveness dependency on
a keeper bot. Resolution logic runs as a privileged system call, similar
to how Sui handles staking rewards at epoch boundaries.

Requires: system transaction framework, Move system module with
settlement hook, integration with the protocol-native oracle from Option
A or B.

### Option D: Verifiable Randomness (VRF) for non-price markets

For markets that resolve on inherently uncertain events (sports lottery
draws, raffle-style markets, community-vote markets), validators
collectively produce a VRF output. This is the same mechanism as Sui's
`sui::random` module (already present at
`crates/sui-framework/packages/sui-framework/sources/random.move` in the
Nasun fork — usable today without a fork patch).

Markets declare their resolution method at creation:
`price-feed | vrf | manual`. VRF-based markets are resolved by the
protocol without any human input.

---

## Resolution Criteria Writing Guide

Every market's `resolutionCriteria` field must follow a structured format
so the keeper bot can parse it deterministically and so users can audit
the binding. Markets that do not follow this format will not be picked up
by the keeper and remain on the manual-resolve path.

Required template:

```
Source: <fully qualified URL to canonical data point>
Reading time: <YYYY-MM-DD HH:mm:ss UTC>
Comparison: <"price >= 100000" | "price < 100000" | etc.>
Tie-breaking: <NO if exactly equal | YES if exactly equal | N/A>
```

Example:

```
Source: https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT
Reading time: 2026-05-19 00:00:00 UTC
Comparison: price >= 100000
Tie-breaking: NO if exactly equal
```

The keeper bot parses these four fields and uses them as inputs. Anything
outside this format is treated as informational prose and does not affect
resolution.

Phase 2 plan: encode this binding directly in the Move struct
(`OracleBinding`) at market creation, eliminating the parse step.

---

## Monitoring & Alerting

### Phase 1 (current)

- pm2 logs: `pm2 logs prediction-keeper`
- Standard out and structured warning lines on:
  - Polling failures (3 consecutive)
  - resolveDeadline window entry / exit
  - Successful resolve with digest
- Resolver wallet gas: enrolled in `keeper-gas-watchdog` `KEEPER_GAS_TARGETS`
  for 1h sweep, 100k NASUN top-up
- Health check: manual `pm2 status` weekly until automation lands

### Phase 2

- Slack/email alert webhooks on consecutive failures or stale price
- On-chain event subscription for `MarketResolved` to confirm tx finality
- Public-facing keeper status page (uptime, last poll, last resolve)

---

## Recommended Sequencing

| Phase | Trigger | Effort |
|---|---|---|
| Phase 1: keeper bot | Now, for prototype launch | 1-2 days |
| Phase 2: on-chain oracle | After first real market cycle | 1-2 weeks |
| Phase 3A: validator oracle | Mainnet preparation | 4-8 weeks |
| Phase 3B: native price feed | Testnet / pre-mainnet | 2-4 weeks |
| Phase 3C: epoch settlement | Mainnet | 3-5 weeks |
| Phase 3D: VRF markets | Post-mainnet | 4-6 weeks |

---

## First Test Market

BTC price prediction is the recommended first keeper-based market:

- **Question**: "Will BTC/USDT price exceed $100,000 on Binance at
  2026-05-19 00:00:00 UTC?"
- **Data source**: Binance `GET /api/v3/ticker/price?symbol=BTCUSDT`
- **Resolution**: keeper reads price at closeTime, resolves YES if
  `price >= 100000`
- **Verifiable**: anyone can check Binance historical price independently
- **Familiar**: widely understood metric, no explanation required

Operational checklist:
1. Create market via PredictionAdminPanel (resolver = keeper wallet address)
2. Deploy keeper bot with resolver private key
3. Add market ID to `PREDICTION_KEEPER_MARKETS` env
4. At closeTime, keeper auto-resolves
5. Verify resolution event on Nasun Explorer

---

## Open Questions

- **Resolver key custody.** Decided 2026-05-01: single key for prototype.
  Upgrade to multisig as part of Phase 2 rollout (M-of-N feeders implies
  multisig anyway).
- **Disputes.** No on-chain dispute mechanism. UI surfaces resolver
  address and criteria; users self-select whether to participate. Phase
  2 introduces criteria binding via on-chain oracle data, removing
  the off-chain interpretation step. Phase 3+ may layer formal dispute
  windows on top of the validator oracle.
- **Resolution method UI field.** Add at Phase 1.5 alongside keeper
  rollout. Values: `manual`, `keeper-price` (Phase 2 adds
  `oracle-feed`, `vrf`).

---

## Launch Preparation Work Order (Week of 2026-05-08)

### Decided scope

- Keeper bot + LP bot launched together
- Single market: BTC price prediction (per "First Test Market" section above)
- Resolver: single key (current operator wallet `0xe1c4...3d90`)

### Day-by-day plan (D = 2026-05-12 Tue, adjustable)

| Day | Work | Deliverable | Verification |
|---|---|---|---|
| D-7 (Thu) | Implement prediction-keeper bot | `apps/pado/bots/prediction-keeper.ts`, `lib/prediction-config.ts` | `--once` dry-run; one successful devnet resolve |
| D-6 (Fri) | Implement prediction-lp bot (mvp) | `apps/pado/bots/prediction-lp-bot.ts` | 5-minute quote/cancel cycle stable |
| D-5 (Sat) | pm2 + .env wiring | `ecosystem.config.cjs` extended with two new apps; new env keys | `pm2 status` green; `/env-verify pado` clean |
| D-4 (Sun) | Move tests + gas dry-run | 8/8 P0 PASS, max PTB < 50M MIST | `nasun move test`, build log review |
| D-3 (Mon) | Create devnet test market | Market with closeTime D-1 00:00 UTC | Object visible on Explorer |
| D-2 (Tue) | E2E pass 1 | mint → buy taker → buy maker → cancel → resolve → claim/burn | All flows green |
| D-1 (Wed) | Mobile + cross-wallet verification | iOS Safari, Android Chrome; zkLogin + passkey | No UI regressions |
| D-0 (Thu) | Create prod market + announce | Market with closeTime D+7 00:00 UTC | Market ID published; keeper picks up automatically |
| D+7 | First auto-resolve | `resolve_market` tx | Explorer tx confirmed; users can claim |

### Task detail

**T1 — prediction-keeper bot (D-7)**
- Pattern: copy `lottery-keeper.ts` (stateless polling, on-chain status branching)
- Role: iterate registered market IDs, check status/closeTime, fetch price, call resolve
- Env: `PREDICTION_RESOLVER_KEY`, `PREDICTION_KEEPER_MARKETS=<id1>,<id2>`,
  `PREDICTION_KEEPER_INTERVAL_MS=60000`
- LOC estimate: 150-200
- Reuse: `lib/retry.ts`, `lib/config.ts`, `lib/balance-manager.ts`

**T2 — prediction-lp bot (D-6)**
- Role: maintain two-sided quotes on registered markets
- Simplification vs round-6 plan §3 (350 LOC): mvp first (~150 LOC).
  Single quote level per side, no inventory replenishment, no fair-value
  modeling. Just keep symmetric quotes around midpoint.
- Env: `PREDICTION_LP_PRIVATE_KEY`, `PREDICTION_LP_MARKETS`,
  `PREDICTION_LP_SPREAD_BPS=200`, `PREDICTION_LP_DEPTH_NUSDC=100`
- Pricing: midpoint of best bid/ask. If orderbook empty, use 5000 bps
  (50% probability).
- Future expansion: inventory replenishment, multi-level depth, fair
  value from external probability feeds.

**T3 — .env (D-5)**
- New keys: `PREDICTION_RESOLVER_KEY`, `PREDICTION_KEEPER_MARKETS`,
  `PREDICTION_LP_PRIVATE_KEY`, `PREDICTION_LP_MARKETS`,
  `PREDICTION_LP_SPREAD_BPS`, `PREDICTION_LP_DEPTH_NUSDC`
- Backup: PreToolUse hook auto-backs-up `.env*` files
- Verify: `/env-verify pado` reports zero MISSING/STALE

**T4 — ecosystem.config.cjs (D-5)**
- Add two pm2 apps: `prediction-keeper`, `prediction-lp`
- Same options shape as `lottery-keeper`
- Extend `keeper-gas-watchdog` `KEEPER_GAS_TARGETS` with both wallet
  addresses

**T5 — Test market creation (D-3)**
- Optional script: `scripts/create-btc-test-market.ts`. AdminPanel form
  also works.
- question, description, resolutionSource, resolutionCriteria filled per
  the writing guide above
- closeTime, resolveDeadline explicitly set

**T6 — E2E (D-2)**
- Market view, orderbook, price-click handoff to form, mint, buy/sell
  taker, buy/sell maker, cancel, resolve (admin), claim winnings, burn
  losing
- Cross-wallet: zkLogin + passkey
- Mobile: layout intact at <768px and at the lg/xl breakpoints

**T7 — Launch communications (D-0)**
- Verify `ResolverDisclaimerBanner` text is current
- Twitter/Discord announcement copy (KR/EN) — outside this document's scope

### Risk Register (Launch)

| Risk | Probability | Impact | Mitigation | Owner |
|---|---|---|---|---|
| Keeper LockConflict (single-instance violation) | Med | Bot crash | Staging disabled, prod single instance | Ops |
| Resolver key compromise | Low | Arbitrary resolve | `.env` perms 600, EC2 SG locked, key rotation procedure documented | Ops |
| Binance API throttling | Low | Resolve delay | `withRetry` 5x, CoinGecko fallback | T1 |
| LP bot NUSDC depletion | Med | Quotes disappear | Watchdog alerts, daily manual top-up | Ops |
| closeTime price spike controversy | Low | User complaint | resolutionCriteria fixes exact reading time | Market author |
| Latent Move bug | Low | Funds locked | E2E pre-launch + 8/8 P0 retest | T4 |
| User confusion about manual resolution | Med | Distrust | Transparent UI: resolver address, criteria, dispute policy stated upfront | Product |

### Post-Launch Checklist (D+1 ~ D+14)

- D+1: pm2 24h log review; memory and CPU stability check
- D+3: Confirm first user trades; orderbook depth observed
- D+7: First auto-resolve verified end-to-end
- D+14: Collect user feedback; kick off Phase 2 design
