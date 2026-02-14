# Pado Bots

Automated bots for the Pado trading platform on Nasun Devnet.

## Available Bots

| Bot | Script | Description | Interval |
|-----|--------|-------------|----------|
| LP Bot | `lp-bot.ts` | Grid market making on DeepBook V3 (NBTC, NETH, NSOL) | 10s |
| Price Updater | `price-updater.ts` | Updates DevOracle with BTC/ETH/NASUN prices from Binance/CoinGecko | 30s |
| Liquidation Keeper | `liquidation-keeper.ts` | Monitors perpetual positions and triggers liquidations | 10s |
| TP/SL Keeper | `tpsl-keeper.ts` | Monitors take-profit/stop-loss orders and executes them on price trigger | Continuous |

## LP Bot

Provides liquidity to DeepBook V3 orderbooks by placing grid orders around real-time prices from Binance.

### Features

- **Multi-market**: NBTC/NUSDC, NETH/NUSDC, NSOL/NUSDC (one instance per market)
- **Grid orders**: 30 bid + 30 ask orders per side (configurable via `LP_ORDER_LEVELS`)
- **Per-market tuning**: Spread, level spacing, order size configured independently
- **Auto-refill**: Requests faucet tokens when balance drops below threshold
- **Inventory skew**: Widens spread on heavy side to rebalance
- **Arbitrage**: Detects and captures price discrepancies vs Binance
- **Circuit breaker**: Auto-recovery with exponential cooldown (max 60s)
- **Gas management**: Auto-refills gas when below threshold

### Quick Start (Local)

```bash
cd apps/pado/bots

# 1. Set private key in .env
echo 'LP_PRIVATE_KEY=suiprivkey1...' > .env

# 2. Run single market once
pnpm lp-bot:once

# 3. Run continuously (single market)
LP_MARKET=NBTC pnpm lp-bot

# 4. Run all markets
pnpm lp-bot:all
```

### Per-Market Configuration

| Variable | NBTC | NETH | NSOL | Description |
|----------|------|------|------|-------------|
| `LP_SPREAD_BPS` | 20 | 30 | 40 | Base spread in basis points |
| `LP_LEVEL_SPACING_BPS` | 8 | 12 | 15 | Price spacing between levels |
| `LP_ORDER_SIZE` | 0.005 | 0.2 | 3 | Base token quantity per level |
| `LP_MAX_ORDER_SIZE` | 0.05 | 2.0 | 30 | Maximum single order size |
| `LP_MAX_ARB_QUANTITY` | 0.01 | 0.5 | 10 | Max arbitrage trade size |
| `LP_MIN_PRICE` | 50000 | 1000 | 10 | Sanity check lower bound |
| `LP_MAX_PRICE` | 200000 | 10000 | 1000 | Sanity check upper bound |

### Common Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `LP_PRIVATE_KEY` | (required) | Ed25519 private key (bech32 `suiprivkey1...` or hex) |
| `LP_MARKET` | `NBTC` | Market to operate: `NBTC`, `NETH`, or `NSOL` |
| `NASUN_RPC_URL` | `https://rpc.devnet.nasun.io` | RPC endpoint |
| `LP_ORDER_LEVELS` | 30 | Orders per side |
| `LP_UPDATE_INTERVAL` | 10000 | Update interval (ms) |
| `LP_REQUOTE_THRESHOLD` | 50 | Re-quote at 0.5% price move |
| `LP_MIN_SPREAD_BPS` | 10 | Minimum allowed spread |
| `LP_MAX_FAILURES` | 5 | Failures before cooldown starts |
| `LP_GAS_REFILL_THRESHOLD` | 0.5 | Gas refill trigger (NASUN) |

## Price Updater

Updates DevOracle contract with BTC, ETH, and NASUN prices from Binance/CoinGecko.

```bash
# Required env
export ORACLE_ADMIN_KEY=<hex-key>

# Run
pnpm price-updater
pnpm price-updater:once
```

Contract addresses are hardcoded in `price-updater.ts` (lines 29-31).

## Liquidation Keeper

Monitors perpetual positions and triggers liquidations when margin ratio drops below MM (2.5%).

```bash
export KEEPER_PRIVATE_KEY=<hex-key>
pnpm liquidation-keeper
pnpm liquidation-keeper:once
```

## TP/SL Keeper

HTTP + WebSocket server that monitors take-profit/stop-loss orders and executes position closures when price triggers are hit.

```bash
# Required env
export KEEPER_PRIVATE_KEY=<hex-key>
export TPSL_API_KEY=<api-key>

# Run (listens on port 4001)
pnpm tsx tpsl-keeper.ts
```

### TP/SL Keeper Environment Variables

| Variable | Description |
|----------|-------------|
| `KEEPER_PRIVATE_KEY` | Hex-encoded Ed25519 key for executing liquidations |
| `TPSL_API_KEY` | Bearer token for API authentication |
| `TPSL_PORT` | HTTP/WS port (default: 4001) |
| `NASUN_RPC_URL` | RPC endpoint |
| `ORACLE_REGISTRY_ID` | Oracle registry object ID |
| `ORACLE_PACKAGE_ID` | Oracle package ID |
| `DEEPBOOK_PACKAGE` | DeepBook V3 package ID |
| `TPSL_ALLOWED_ORIGIN` | CORS allowed origin |

---

## Production Deployment (PM2)

All bots run via PM2 using `ecosystem.config.cjs`. The deploy script handles code sync, dependency install, and PM2 restart.

### Architecture

```
┌──────────────────────────────────────────────────────────┐
│  ecosystem.config.cjs (PM2 process manager)              │
├──────────────────────────────────────────────────────────┤
│  lp-bot-nbtc   │ LP market making for NBTC/NUSDC        │
│  lp-bot-neth   │ LP market making for NETH/NUSDC        │
│  lp-bot-nsol   │ LP market making for NSOL/NUSDC        │
│  price-updater │ Oracle price feed (BTC/ETH/NASUN)      │
│  tpsl-keeper   │ TP/SL order execution (port 4001)      │
├──────────────────────────────────────────────────────────┤
│  .env (secrets)                                          │
│  ├── LP_PRIVATE_KEY       (LP bots)                      │
│  ├── ORACLE_ADMIN_KEY     (price-updater)                │
│  ├── KEEPER_PRIVATE_KEY   (tpsl-keeper)                  │
│  └── TPSL_API_KEY         (tpsl-keeper)                  │
└──────────────────────────────────────────────────────────┘
```

### Environment Separation

Staging and production use **separate LP private keys** to avoid on-chain object contention (BalanceManager lock conflicts on shared DeepBook Pool objects).

| Environment | Server | User | LP Wallet Address | LP Alias |
|-------------|--------|------|-------------------|----------|
| Staging | `ec2-15-165-19-180.ap-northeast-2.compute.amazonaws.com` | `ubuntu` | `0x69377697cebb6a6a748b9a5492de51b2d0f67413551d87f62cc17899432952cd` | `musing-euclase` |
| Production | `43.200.67.52` | `ec2-user` | `0xe1c4c90bd18d22d5d8fbc9ab7994bdcf1ac717714c0f5375528c229d6dfb3d90` | `hopeful-malachite` |

> **Important**: Never use the same `LP_PRIVATE_KEY` on both staging and production simultaneously. Concurrent access to the same BalanceManager from multiple instances causes "Object already locked" errors from the Sui validator.

### Required `.env` File on Server

```env
LP_PRIVATE_KEY=suiprivkey1...     # LP bots (bech32 or hex)
ORACLE_ADMIN_KEY=<hex>            # price-updater (AdminCap owner)
KEEPER_PRIVATE_KEY=<hex>          # tpsl-keeper
TPSL_API_KEY=<api-key>            # tpsl-keeper API auth
```

### Deploy Commands

```bash
# From monorepo root
pnpm deploy:pado:bots:staging     # Deploy to staging
pnpm deploy:pado:bots:prod        # Deploy to production

# Or directly
./scripts/deploy-pado-bots.sh --staging
./scripts/deploy-pado-bots.sh --production

# Operations
./scripts/deploy-pado-bots.sh --staging --status    # PM2 status
./scripts/deploy-pado-bots.sh --staging --logs       # PM2 logs
./scripts/deploy-pado-bots.sh --staging --stop       # Stop all
./scripts/deploy-pado-bots.sh --staging --restart    # Restart all
```

### How PM2 + .env Works

PM2 does **not** read `.env` files automatically. The mechanism:

1. **Non-secret config** (contract addresses, RPC URLs) is set in `ecosystem.config.cjs` `env:` blocks
2. **Secrets** (private keys, API keys) are stored in `.env` on the server
3. The deploy script runs `set -a && source .env && set +a` before `pm2 start`, injecting secrets into the shell environment
4. PM2 inherits those shell environment variables at process spawn time

### Manual Server Setup

```bash
# SSH to server
ssh -i <key.pem> <user>@<host>

# Install PM2 (if not present)
npm install -g pm2

# Configure auto-restart on reboot
pm2 startup
# Run the command it outputs (sudo env PATH=...)
pm2 save

# View status
pm2 status
pm2 logs --lines 50
pm2 logs lp-bot-nbtc --lines 20
```

---

## Contract Addresses (DevNet V7)

| Contract | Address |
|----------|---------|
| DeepBook Package | `0xb4a100f26550fe84d8134e9e97ef1569e8f2e63cd864adf4774249ee05178134` |
| NBTC/NUSDC Pool | `0xa2b755aebb88f9d249e22d58f7ac5e2e003ce53f4d5bbb30c03be50966d01cd0` |
| NETH/NUSDC Pool | `0xb6c960985711cf5a9cc5063cec8c7ad148794e4cb3c1ad1cea224911cd68e7b7` |
| NSOL/NUSDC Pool | `0x577f81bb5dae12aac57103ed0231aae200af3ac1c5db3d523b679b09ac88c769` |
| Tokens Package (NBTC, NUSDC) | `0x96adf476d488ffb588d0bfdb5c422355f065386a2e7124e66746fb7078816731` |
| Token Faucet (V1) | `0x7cc75ad1f00f65589074ba9a8f0ad4922b2be3bfef31c22c66d137bc8dbced92` |
| NETH Package | `0xe672843fd6e5388ca1248200059c6ef50e82a68689f42f7b9efb3e70dcabdf31` |
| NSOL Package (V2) | `0xcc65166f76b0aed75f8c94527405cec82bb4b416483c7bcdd7725490179601b2` |
| Oracle Package | `0x8a0acb40e5546a01e276a367e583df32b134306ebce6118cc01d9e164edf4c1c` |
| Oracle Registry | `0xdd4b9ac16342bb2b4d8cd7ad3556f025122914a69450f72563e733d4a477e7f1` |

## Troubleshooting

### "LP_PRIVATE_KEY environment variable not set"

Set in `.env` file (for PM2) or export directly:
```bash
echo 'LP_PRIVATE_KEY=suiprivkey1...' >> .env
# or
export LP_PRIVATE_KEY=<bech32-or-hex>
```

Supports both bech32 (`suiprivkey1...`) and raw hex formats.

### "Object already locked by a different transaction"

Two LP bot instances are using the same `LP_PRIVATE_KEY`, creating BalanceManager contention. Ensure staging and production use different keys. See Environment Separation above.

### "Failed to create BalanceManager"

Wallet needs NASUN for gas. Request from faucet:
```bash
curl -X POST https://faucet.devnet.nasun.io/gas -H 'Content-Type: application/json' \
  -d '{"FixedAmountRequest":{"recipient":"<address>"}}'
```

### Circuit breaker / auto-recovery

Current implementation uses exponential cooldown (not permanent pause). After `LP_MAX_FAILURES` consecutive errors, the bot waits with increasing delay (max 60s) before retrying. No manual restart needed.

### price-updater or tpsl-keeper crash loop (high restart count)

Check that secrets are present in the shell environment:
```bash
ssh <server>
pm2 env 0 | grep -E 'ORACLE_ADMIN_KEY|KEEPER_PRIVATE_KEY|TPSL_API_KEY'
```

If missing, ensure `.env` has the keys and restart with:
```bash
cd /path/to/pado-bots
set -a && source .env && set +a
pm2 delete price-updater tpsl-keeper
pm2 start ecosystem.config.cjs --only price-updater
pm2 start ecosystem.config.cjs --only tpsl-keeper
pm2 save
```

## Development

```bash
cd apps/pado/bots

# Install dependencies
pnpm install

# Type check
npx tsc --noEmit

# Run single bot locally
LP_MARKET=NBTC pnpm lp-bot:once
pnpm price-updater:once
```

## Source Structure

```
bots/
├── lp-bot.ts              # LP market maker (main loop)
├── price-updater.ts       # Oracle price feed updater
├── liquidation-keeper.ts  # Perp position liquidator
├── tpsl-keeper.ts         # TP/SL order executor (HTTP + WS)
├── ecosystem.config.cjs   # PM2 process configuration
├── package.json           # Dependencies (tsx must be in dependencies for PM2)
├── tsconfig.json
├── .env                   # Secrets (gitignored)
├── lib/
│   ├── config.ts          # Multi-market config, contract addresses, helpers
│   ├── balance-manager.ts # Gas/token balance tracking
│   ├── order-manager.ts   # Order creation/cancellation (atomic)
│   ├── strategy.ts        # Grid price calculation + inventory skew
│   ├── faucet.ts          # Auto faucet refill (V1 + V2)
│   ├── tpsl-store.ts      # TP/SL state persistence
│   └── tpsl-executor.ts   # TP/SL execution logic
└── logs/                  # PM2 log files (gitignored)
```
