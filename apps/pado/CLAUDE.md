# CLAUDE.md (apps/pado)

> Last Updated: 2026-03-26
> Common rules (language, UI language rules): see root [CLAUDE.md](../../CLAUDE.md)

---

## Vision: Unified Onchain Finance

**Pado** is a **self-custodial unified financial application** running on Nasun Network.

> *"Unified, self-custodial spot, derivatives, lending, staking, prediction markets, and payments through a single smart account on the Nasun Network."*

### Core Philosophy

| Principle | Description |
|-----------|-------------|
| **Single Smart Account** | All financial activities (trading, lending, staking, payments) managed through one account |
| **Unified Margin System** | Portfolio-level unified margin -- assets serve as collateral across all products |
| **Self-Custodial Control** | Users maintain full control over assets, no private key exposure |
| **Object-Based Architecture** | Nasun's object-based state model natively models complex financial interactions on-chain |
| **CEX-Grade UX, DEX-Level Transparency** | CEX-level user experience + on-chain verifiability |

---

## Core Architecture

### Account Model: Smart Account

```
┌─────────────────────────────────────────────────────────────┐
│                    Nasun Smart Account                       │
├─────────────────────────────────────────────────────────────┤
│  Authentication                                              │
│  ├── zkLogin (ZK proof + Google OAuth)                      │
│  ├── Passkey (Device credentials)                           │
│  └── Embedded Wallet (Current primary)                      │
├─────────────────────────────────────────────────────────────┤
│  Single Account → All Products                               │
│  ├── Spot Trading (DeepBook V3 CLOB)                        │
│  ├── Perpetual Futures (20x leverage)                       │
│  ├── Prediction Markets (Binary YES/NO)                     │
│  ├── Lottery (Weekly draw)                                  │
│  ├── Lending/Borrowing [Partial - contracts deployed]       │
│  ├── Staking [Partial - UI stub]                             │
│  └── Payments (QR code transfer)                            │
└─────────────────────────────────────────────────────────────┘
```

### Unified Margin & Risk Engine (v1)

- **Multi-Collateral**: NUSDC (0% haircut) + NBTC (5% haircut, admin-adjustable)
- **4-Tier Threshold**: IM(10%), Warning(8%), MM(5%), FC(3%)
- **Liquidation**: 5% bonus, 50% max liquidation ratio, permissionless
- **Benefits**: Capital silo removal, composable yields, enhanced capital efficiency

---

## Development Commands

```bash
# From monorepo root
pnpm dev:pado              # Dev server (port 5176)
pnpm dev:pado:with-bot     # Dev server + LP Bot + Price Updater + TP/SL Keeper
pnpm build:pado            # Production build

# Move contracts
cd apps/pado/contracts-margin
nasun move build
nasun client publish --gas-budget 100000000

# Tests
cd apps/pado/frontend && pnpm test
cd apps/pado/frontend && pnpm test:coverage
```

---

## Known Issues & Pending Work

1. **Env var mismatch**: Some `.env.local` addresses may differ from `devnet-ids.json` (partial update after V7 reset)
2. **Staging Chain ID difference**: Staging uses a separate chain, development uses `272218f1`
3. **Lending UI activation pending**: Contract V7 deployed, pool creation + .env integration + pool UI needed
4. **Market Narrator pool name hardcoding**: `formatAlert` hardcodes "NBTC", needs update when adding other pools
5. **Sui SDK version split**: Frontend uses @mysten/sui 1.45.2, bots use 1.21.1 (intentional for bot stability)
6. **Single-instance constraint**: price-updater and tpsl-keeper must run as single instances (LockConflict on shared AdminCap/TradeCap)

---

## Reference Documentation

| Document | Contents |
|----------|----------|
| [docs/roadmap.md](docs/roadmap.md) | Product roadmap (phases) + feature completeness matrix |
| [docs/architecture.md](docs/architecture.md) | Project structure + architecture patterns (state, data fetching, contracts, UI) |
| [docs/frontend.md](docs/frontend.md) | Routes + feature modules + frontend libraries (lib/) |
| [docs/contracts.md](docs/contracts.md) | Network config, trading pairs, deployed contract addresses, Move contract specs |
| [docs/bots.md](docs/bots.md) | LP Bot, Price Updater, Liquidation Keeper, TP/SL Keeper + deployment |
| [docs/environment.md](docs/environment.md) | All environment variables (network, DeepBook, tokens, pools, oracle, zkLogin, chat) |
| [docs/PADO_NEXT_STEPS.md](docs/PADO_NEXT_STEPS.md) | Next feature priorities + post-launch improvements |
| [docs/COMPETITIVE_ANALYSIS.md](docs/COMPETITIVE_ANALYSIS.md) | Competitive analysis and improvement roadmap |
| [docs/SOCIAL_LAYER_DISCUSSION.md](docs/SOCIAL_LAYER_DISCUSSION.md) | Social layer strategy (finance-first social thesis) |
| [docs/LOTTERY.md](docs/LOTTERY.md) | Lottery system design and mechanisms |
| [docs/MANUAL_E2E_CHECKLIST.md](docs/MANUAL_E2E_CHECKLIST.md) | Manual E2E test checklist |
| [docs/SPOT_TRADING_UX_BENCHMARK.md](docs/SPOT_TRADING_UX_BENCHMARK.md) | Spot Trading & Account UX competitive benchmark analysis |
| [bots/README.md](bots/README.md) | Bot documentation (LP Bot, Price Updater, Liquidation Keeper, TP/SL Keeper) |
| [contracts-prediction/README.md](contracts-prediction/README.md) | Prediction Market contract overview |
