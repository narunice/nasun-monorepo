# Pado Bots (Automation)

> Last Updated: 2026-05-18

## Token / Faucet Invariant (READ BEFORE EDITING `lib/config.ts`)

For every market the bots trade, the faucet object the bot calls must hold a
`TreasuryCap` whose minted coin type **equals** the market's configured
`baseType`. If they diverge (most commonly after a token package re-publish
that forgets to update faucet wiring), the bot mints stale-type coins forever,
DeepBook refuses them, and trading inventory never refills even though the
logs cheerfully say `REFILLED: +N TOKEN`.

The 2026-05-18 NETH liquidity incident is exactly that failure: `MARKETS.NETH`
was pointed at the shared `TOKEN_FAUCET_V2` (which still holds the legacy
`0xcc65…::neth::NETH` TreasuryCap from before the NETH republish), so 11 days
of refills landed in the wrong coin type while the orderbook stayed empty.

### Current pairings (all three MUST stay aligned)

| Market | `baseType` package         | Faucet package           | Faucet object         | No-cooldown fn   |
|--------|----------------------------|--------------------------|-----------------------|------------------|
| NBTC   | `TOKENS_PACKAGE`           | `TOKENS_PACKAGE` (v1)    | `TOKEN_FAUCET`        | `request_tokens` |
| NETH   | `NETH_PACKAGE`             | `NETH_FAUCET_PACKAGE`    | `NETH_FAUCET_V2`      | `request_tokens` |
| NSOL   | `TOKENS_V2_PACKAGE`        | `TOKENS_V2_FAUCET_PACKAGE` | `TOKEN_FAUCET_V2`   | `request_nsol`   |

> NETH's dedicated faucet does NOT expose a no-cooldown `request_neth`; use
> `request_tokens` (mints NETH + NSOL together). The shared `TOKEN_FAUCET_V2`
> does expose `request_neth` but mints the legacy NETH type — never use it for
> NETH.

### Enforcement: startup preflight

`lib/preflight.ts::verifyMarketFaucet` reads the on-chain faucet object,
extracts every `TreasuryCap<…>` type it holds, and aborts the bot if the
market's `baseType` is not among them. The check is wired into:

- `lp-bot.ts` (per-market, after the address banner)
- `scripts/balance-watchdog.ts` (all three markets, before the first cycle)
- `scripts/prefund-bot.ts` (the targeted market, before submitting any TX)

When you re-publish a token package or add a new market, run
`pnpm tsx scripts/prefund-bot.ts --market <X> --rounds 1 --dry-run` (or just
boot the bot in staging) — preflight will fail with a diff of expected vs.
actual TreasuryCap types if the wiring is wrong. Do not bypass it.

---


## Bot Overview

| Bot | Script | Description |
|-----|--------|-------------|
| LP Bot | `bots/lp-bot.ts` | Grid market making (Binance price based), 30 bid + 30 ask (configurable), multi-market (NBTC/NETH/NSOL), inventory skew, arbitrage, auto-recovery circuit breaker, auto faucet refill (10s interval) |
| Price Updater | `bots/price-updater.ts` | Binance/CoinGecko BTC/ETH/NASUN price polling -> DevOracle batch_update (30s interval) |
| Liquidation Keeper | `bots/liquidation-keeper.ts` | Perpetual position monitoring -> Liquidation trigger below MM(2.5%), 5% bonus collection (10s interval) |
| TP/SL Keeper | `bots/tpsl-keeper.ts` | Take-profit/Stop-loss order monitoring -> Auto-close position on price trigger (HTTP + WS, port 4001) |

## Prediction Market Resolvers

`bots/prediction-keeper.ts` dispatches to a per-kind resolver based on the
`Kind:` line in `resolution_criteria`. Each resolver returns `resolved` or
`pending`; `pending` past `resolve_deadline + EXPIRE_GRACE_MS` triggers the
permissionless `cancel_expired_market` (full refund).

| Kind | File | Data source | Notes |
|------|------|-------------|-------|
| `crypto` | `prediction-criteria.ts` (legacy path) | Binance + CoinGecko fallback | Price comparison |
| `stock` | `lib/stock-price.ts` | Twelve Data + Yahoo cross-check | Stalls if `TWELVEDATA_API_KEY` missing |
| `space` | `lib/resolvers/space.ts` | The Space Devs (Launch Library 2) | |
| `music` | `lib/resolvers/music.ts` | iTunes | |
| `sports` | `lib/resolvers/sports.ts` | TheSportsDB | Score-based finalCache invariant (Freiburg 2026-05-20) |
| `weather` | `lib/resolvers/weather.ts` | Open-Meteo | |
| `ufc` | `lib/resolvers/ufc.ts` | ESPN core API (MMA) | Single-fight winner; pending on NC/Draw |
| `esports` | `lib/resolvers/esports.ts` | lolesports getSchedule (public x-api-key constant) | LCK series-level home_win. `state=completed` + empty `flags` + stability window + gameWins majority cross-check |

### lolesports observed flags

`match.flags` carries both benign post-game metadata and abnormal markers.
`esports.ts` resolves only when every flag is on the `BENIGN_FLAGS` allowlist;
an unknown entry holds the market pending so `cancel_expired_market` refunds
at the deadline. As new flags surface in production, classify them here AND
in `BENIGN_FLAGS` (lower-case) inside `lib/resolvers/esports.ts`.

| Observed `flags` value | Verdict | Notes |
|------------------------|---------|-------|
| `hasVod` | benign | Stamped on every normal completion once the VOD is published. Live LCK data 2026-05-25. |
| `hasHighlights` | benign | Pre-classified by analogy with `hasVod`. Not yet observed on LCK at allowlist time; remove if it turns out to mean something else. |

The public x-api-key constant lives in `lib/resolvers/esports.ts`; if Riot
rotates it, override via `LOLESPORTS_API_KEY`. The key can be extracted from
lolesports.com browser devtools (network tab, any persisted/gw call).

### Batch creator scripts

| Script | Purpose |
|--------|---------|
| `scripts/create-ufc-batch.ts` | UFC fight cards (ESPN pre-flight, on-chain create) |
| `scripts/create-lck-batch.ts` | LCK series (lolesports pre-flight, on-chain create) |
| `scripts/create-sports-batch.ts` / `create-soccer-batch-*.ts` / etc. | Other sport / category batches |

Run with `--dry-run` first; the script aborts before touching the chain if
pre-flight verification (team/fighter id mismatch, TBD teams, wrong bestOf)
fails.

## Support Libraries (`bots/lib/`)

- `config.ts` - Multi-market pool/order/spread config (NBTC, NETH, NSOL), contract addresses
- `balance-manager.ts` - Gas, Base/Quote token balance tracking
- `order-manager.ts` - Order create/cancel (atomic)
- `strategy.ts` - Quote calculation (with inventory skew)
- `faucet.ts` - Auto faucet refill (V1 + V2), disable via `LP_DISABLE_TOKEN_FAUCET`
- `retry.ts` - Transaction retry with non-retriable error detection (LockConflict, equivocation)
- `tpsl-store.ts` - TP/SL state storage
- `tpsl-executor.ts` - TP/SL execution logic

## Scripts (`bots/scripts/`)

| Script | Description |
|--------|-------------|
| `prefund-bot.ts` | Batch faucet calls in PTB (up to 200 rounds per transaction) for pre-funding bot wallets |

## Local Execution

```bash
cd apps/pado/bots
LP_MARKET=NBTC pnpm lp-bot                            # NBTC market continuous
pnpm lp-bot:once                                      # Single run
pnpm lp-bot:all                                       # All 3 markets simultaneously
pnpm price-updater                                    # Oracle price update
pnpm liquidation-keeper                               # Liquidation monitoring
pnpm tpsl-keeper                                      # TP/SL conditional order execution
```

## Production Deployment (PM2)

7 processes managed by PM2 `ecosystem.config.cjs`: `lp-bot-nbtc`, `lp-bot-neth`, `lp-bot-nsol`, `price-updater`, `balance-watchdog`, `tpsl-keeper`, `lottery-keeper`.

> **Note**: `liquidation-keeper` is available as a local script but is **not** included in the PM2 config. Run it manually or add to PM2 when needed.

**Environment Separation**: Staging and Production use **separate LP_PRIVATE_KEY** to prevent BalanceManager on-chain object contention.

| Environment | Server | LP Wallet Address | LP Alias |
|-------------|--------|-------------------|----------|
| Staging | `ec2-15-165-19-180...` (ubuntu) | `0x69377697...432952cd` | `musing-euclase` |
| Production | `43.200.67.52` (ec2-user) | `0xe1c4c90b...6dfb3d90` | `hopeful-malachite` |

### Per-Market Keypairs (Recommended)

To avoid gas coin contention between LP bot instances, each market can use a separate private key:

| Variable | Description | Fallback |
|----------|-------------|----------|
| `LP_PRIVATE_KEY_NBTC` | NBTC market LP key | `LP_PRIVATE_KEY` |
| `LP_PRIVATE_KEY_NETH` | NETH market LP key | `LP_PRIVATE_KEY` |
| `LP_PRIVATE_KEY_NSOL` | NSOL market LP key | `LP_PRIVATE_KEY` |

If per-market keys are not set, all markets fall back to the shared `LP_PRIVATE_KEY`.

**Required `.env` (server)**: `LP_PRIVATE_KEY` (or per-market keys), `ORACLE_ADMIN_KEY`, `KEEPER_PRIVATE_KEY`, `TPSL_ALLOWED_ORIGIN`

**Optional `.env`**: `LP_DISABLE_TOKEN_FAUCET=true` (skip auto faucet refill for pre-funded deployments)

**PM2 + .env Mechanism**: PM2 does NOT auto-read `.env`. Secrets are stored in `.env`, and the deploy script (`deploy-pado-bots.sh`) runs `set -a && source .env` before starting PM2 to inject as shell env vars. Non-secret config (contract addresses, RPC URL) is specified in `ecosystem.config.cjs` `env:` blocks.

### Non-Retriable Error Detection

The retry logic (`lib/retry.ts`) detects and fails fast on errors that should not be retried:
- `LockConflict` / `already locked by a different transaction`
- `equivocation` / `not available for consumption`

This prevents cascading fullnode memory exhaustion caused by retrying inherently failing transactions (e.g., dual price-updater instances using the same AdminCap).

```bash
# Deploy (from monorepo root)
pnpm deploy:pado:bots:staging     # Staging deploy
pnpm deploy:pado:bots:prod        # Production deploy

# Operations
./scripts/deploy-pado-bots.sh --staging --status     # PM2 status
./scripts/deploy-pado-bots.sh --production --logs    # PM2 logs
```

> Detailed docs: [bots/README.md](../bots/README.md)

---

## Scripts

### Additional Scripts

| Script | Description |
|--------|-------------|
| `scripts/create-perp-market.ts` | BTC-PERP perpetual futures market creation (PTB pattern, Sui CLI integration) |
| `bots/scripts/prefund-bot.ts` | Batch faucet calls for pre-funding bot wallets (up to 200 rounds/tx) |
