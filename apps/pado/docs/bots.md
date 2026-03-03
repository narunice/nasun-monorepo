# Pado Bots (Automation)

> Last Updated: 2026-03-03

## Bot Overview

| Bot | Script | Description |
|-----|--------|-------------|
| LP Bot | `bots/lp-bot.ts` | Grid market making (Binance price based), 30 bid + 30 ask (configurable), multi-market (NBTC/NETH/NSOL), inventory skew, arbitrage, auto-recovery circuit breaker, auto faucet refill (10s interval) |
| Price Updater | `bots/price-updater.ts` | Binance/CoinGecko BTC/ETH/NASUN price polling -> DevOracle batch_update (30s interval) |
| Liquidation Keeper | `bots/liquidation-keeper.ts` | Perpetual position monitoring -> Liquidation trigger below MM(2.5%), 5% bonus collection (10s interval) |
| TP/SL Keeper | `bots/tpsl-keeper.ts` | Take-profit/Stop-loss order monitoring -> Auto-close position on price trigger (HTTP + WS, port 4001) |

## Support Libraries (`bots/lib/`)

- `config.ts` - Multi-market pool/order/spread config (NBTC, NETH, NSOL), contract addresses
- `balance-manager.ts` - Gas, Base/Quote token balance tracking
- `order-manager.ts` - Order create/cancel (atomic)
- `strategy.ts` - Quote calculation (with inventory skew)
- `faucet.ts` - Auto faucet refill (V1 + V2)
- `tpsl-store.ts` - TP/SL state storage
- `tpsl-executor.ts` - TP/SL execution logic

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

5 processes managed by PM2 `ecosystem.config.cjs`: `lp-bot-nbtc`, `lp-bot-neth`, `lp-bot-nsol`, `price-updater`, `tpsl-keeper`.

> **Note**: `liquidation-keeper` is available as a local script but is **not** included in the PM2 config. Run it manually or add to PM2 when needed.

**Environment Separation**: Staging and Production use **separate LP_PRIVATE_KEY** to prevent BalanceManager on-chain object contention.

| Environment | Server | LP Wallet Address | LP Alias |
|-------------|--------|-------------------|----------|
| Staging | `ec2-15-165-19-180...` (ubuntu) | `0x69377697...432952cd` | `musing-euclase` |
| Production | `43.200.67.52` (ec2-user) | `0xe1c4c90b...6dfb3d90` | `hopeful-malachite` |

**Required `.env` (server)**: `LP_PRIVATE_KEY`, `ORACLE_ADMIN_KEY`, `KEEPER_PRIVATE_KEY`, `TPSL_API_KEY`

**PM2 + .env Mechanism**: PM2 does NOT auto-read `.env`. Secrets are stored in `.env`, and the deploy script (`deploy-pado-bots.sh`) runs `set -a && source .env` before starting PM2 to inject as shell env vars. Non-secret config (contract addresses, RPC URL) is specified in `ecosystem.config.cjs` `env:` blocks.

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

| Script | Description |
|--------|-------------|
| `scripts/create-perp-market.ts` | BTC-PERP perpetual futures market creation (PTB pattern, Sui CLI integration) |
