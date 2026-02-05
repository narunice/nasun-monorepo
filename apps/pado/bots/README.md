# Pado Bots

Automated bots for the Pado trading platform on Nasun Devnet.

## Available Bots

| Bot | Description | Interval |
|-----|-------------|----------|
| `lp-bot` | Liquidity Provider - places grid orders around BTC price | 10s |
| `price-updater` | Updates DevOracle with BTC/NASUN prices | 30s |
| `liquidation-keeper` | Monitors and liquidates underwater positions | 10s |

## LP Bot

Provides liquidity to the NBTC/NUSDC orderbook by placing grid orders around the current BTC price from Binance.

### Features

- Fetches real-time BTC/USDT price from Binance API
- Places 5 bid + 5 ask orders (configurable)
- 0.3% spread with 0.1% level spacing
- Auto-refill from faucet when balance is low
- Inventory skew adjustment (widens spread on heavy side)
- Circuit breaker after consecutive failures

### Quick Start

```bash
# 1. Get your private key
sui keytool export --key-identity <your-alias>

# 2. Export it
export LP_PRIVATE_KEY=<hex-without-0x>

# 3. Run once to test
pnpm lp-bot:once

# 4. Run continuously
pnpm lp-bot
```

### Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `LP_PRIVATE_KEY` | (required) | Hex-encoded Ed25519 private key |
| `NASUN_RPC_URL` | https://rpc.devnet.nasun.io | RPC endpoint |
| `LP_SPREAD_BPS` | 30 | Base spread (0.3%) |
| `LP_ORDER_LEVELS` | 5 | Orders per side |
| `LP_ORDER_SIZE` | 0.01 | BTC per order |
| `LP_UPDATE_INTERVAL` | 10000 | Update interval (ms) |
| `LP_REQUOTE_THRESHOLD` | 50 | Re-quote at 0.5% price move |

### Production Deployment (PM2)

```bash
# Install PM2 globally
npm install -g pm2

# Set private key in environment
export LP_PRIVATE_KEY=<hex>

# Start the bot
pm2 start ecosystem.config.cjs --only lp-bot

# View logs
pm2 logs lp-bot

# Stop
pm2 stop lp-bot
```

## Price Updater

Updates the DevOracle contract with BTC and NASUN prices.

```bash
export ORACLE_ADMIN_KEY=<hex>
pnpm price-updater
```

## Liquidation Keeper

Monitors perpetual positions and triggers liquidations.

```bash
export KEEPER_PRIVATE_KEY=<hex>
pnpm liquidation-keeper
```

## Contract Addresses (DevNet V7)

| Contract | Address |
|----------|---------|
| DeepBook Package | `0xb4a100f26550fe84d8134e9e97ef1569e8f2e63cd864adf4774249ee05178134` |
| NBTC/NUSDC Pool | `0xa2b755aebb88f9d249e22d58f7ac5e2e003ce53f4d5bbb30c03be50966d01cd0` |
| Tokens Package | `0x96adf476d488ffb588d0bfdb5c422355f065386a2e7124e66746fb7078816731` |
| Token Faucet | `0x7cc75ad1f00f65589074ba9a8f0ad4922b2be3bfef31c22c66d137bc8dbced92` |

## Troubleshooting

### "LP_PRIVATE_KEY environment variable not set"

Export your private key:
```bash
sui keytool export --key-identity <alias>
export LP_PRIVATE_KEY=<hex>
```

### "Failed to create BalanceManager"

Ensure your wallet has NASUN for gas. Request from https://faucet.devnet.nasun.io

### "Circuit breaker: X consecutive failures"

Check RPC connectivity and contract addresses. Restart the bot after fixing.

### Orders not appearing in orderbook

1. Check bot logs for errors
2. Verify BalanceManager has sufficient NBTC/NUSDC
3. Ensure pool ID is correct

## Development

```bash
# Install dependencies
pnpm install

# Type check
npx tsc --noEmit

# Run in development
pnpm lp-bot:once
```
