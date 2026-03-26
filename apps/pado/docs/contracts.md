# Pado Smart Contracts & Technical Specs

> Last Updated: 2026-03-26

## Network Configuration

| Spec | Value |
|------|-------|
| Network | Nasun Devnet |
| Chain ID | `272218f1` (2026-02-04 V7 reset) |
| RPC Endpoint | https://rpc.devnet.nasun.io |
| Faucet | https://faucet.devnet.nasun.io |
| Base Technology | DeepBook V3 CLOB |

## Trading Pairs (4 Pools)

| Pool | Base | Quote | Tick Size | Lot Size | Maker Fee | Taker Fee |
|------|------|-------|-----------|----------|-----------|-----------|
| NBTC/NUSDC | NBTC (8d) | NUSDC (6d) | 100,000 ($0.10) | 1,000 (0.00001 BTC) | 5 bps | 10 bps |
| NASUN/NUSDC | NASUN (9d) | NUSDC (6d) | 10,000 ($0.01) | 1e9 (1.0 NASUN) | 5 bps | 10 bps |
| NETH/NUSDC | NETH (8d) | NUSDC (6d) | 100,000 ($0.10) | 1,000 (0.00001 ETH) | 5 bps | 10 bps |
| NSOL/NUSDC | NSOL (9d) | NUSDC (6d) | 10,000 ($0.01) | 1e9 (1.0 SOL) | 5 bps | 10 bps |

---

## Deployed Contracts (V7, 2026-02-04 Reset)

> Full contract addresses: `packages/devnet-config/devnet-ids.json`

**DeepBook V3**:
| Item | Value |
|------|-------|
| Package | `0xb4a100f26550fe84d8134e9e97ef1569e8f2e63cd864adf4774249ee05178134` |
| Registry | `0x0a6ba6378a30598f1487e193865bfa387f177f82660400a5eace887cfe5a6b7b` |
| AdminCap | `0xe0b017bb62d572415c447e37008cea68bc8bb5bd4e47f12e672924b05ba651eb` |

**Unified Tokens (devnet_tokens)**:
| Item | Value |
|------|-------|
| Original Package (types) | `0x96adf476d488ffb588d0bfdb5c422355f065386a2e7124e66746fb7078816731` |
| Current Package (calls) | `0x7f8dba64318adb8042b266d52d372b4b876778aa7f27f7e37847cc15611f75b2` |
| TokenFaucet | `0x7cc75ad1f00f65589074ba9a8f0ad4922b2be3bfef31c22c66d137bc8dbced92` |
| NBTC Type | `{OriginalPackage}::nbtc::NBTC` |
| NUSDC Type | `{OriginalPackage}::nusdc::NUSDC` |

**Prediction Market**:
| Item | Value |
|------|-------|
| Package | `0x98765cc3765324148db9815da8bce85e6ca895e94eed910b6cc9bec55cc22895` |

**Lottery**:
| Item | Value |
|------|-------|
| Package | `0xd56f405af7127a15e30a5104ec91574a7483699e5ac1d74383ed5478aee43900` |

**DevOracle (pado_oracle)**:
| Item | Value |
|------|-------|
| Package | `0x8a0acb40e5546a01e276a367e583df32b134306ebce6118cc01d9e164edf4c1c` |

**Unified Margin (unified_margin)**:
| Item | Value |
|------|-------|
| Package | `0x5bdbf3aaa5999674bea412f2dd7dce417a188343f7213cb7105d9c1eaacce31d` |

**Perpetuals DEX (pado_perp)**:
| Item | Value |
|------|-------|
| Package | `0x6821a73cfc3cd45dc6318db379c2c88f0acb61ec6a26060f4de8cbe4718d3658` |

**Lending (pado_lending)**:
| Item | Value |
|------|-------|
| Package | `0xdd1e36881a1d47ad4f0f331b6a949948f308ded71c1d46802f23e258ca1ebafe` |

**Nasun Smart Account (nasun_smart_account)**:
| Item | Value |
|------|-------|
| Original Package (types) | `0x097e96d5e0c09915b6ba2ed744fe2d4ee0bd21df1d453e6528d4d82c96c1c44b` |
| Current Package (calls) | `0x566eb1ba9e403dcd46c33c45d9a023570f09327b35bde4b8d6fd8b63e70012f3` |

---

## Smart Contracts

### contracts/ (pado_tokens)

NBTC, NUSDC test tokens + Faucet.

| Module | Description |
|--------|-------------|
| `nbtc.move` | NBTC token (8 decimals, 21M max supply) |
| `nusdc.move` | NUSDC stablecoin (6 decimals, unlimited mint) |
| `faucet.move` | Token Faucet (NBTC: 1/claim, NUSDC: 100K/claim, 24h cooldown) |

### contracts-prediction/ (pado_prediction)

Binary YES/NO prediction markets.

| Module | Description |
|--------|-------------|
| `prediction_market.move` | NUSDC collateral orderbook, admin-based market resolution, price basis points (0-10000), CTF-like token model (mint/trade/resolve/redeem) |

### contracts-oracle/ (pado_oracle)

Admin-controlled price feed (Devnet only, replaced by Pyth/Switchboard on mainnet).

| Module | Description |
|--------|-------------|
| `dev_oracle.move` | 3 symbols (BTC=1, ETH=2, NASUN=3), 8 decimals, staleness check, batch_update support |

### contracts-lottery/ (pado_lottery)

Weekly lottery system.

| Module | Description |
|--------|-------------|
| `lottery.move` | 5 numbers (1-32), Sui Random drawing, 3-tier prizes, round state machine (OPEN -> CLOSED -> DRAWN -> SETTLED) |

### contracts-margin/ (unified_margin)

Unified margin system.

| Module | Version | Description |
|--------|---------|-------------|
| `unified_margin.move` | v0.6 | Multi-collateral margin account (NUSDC 0% + NBTC 5% haircut, admin-adjustable), Owned MarginAccount |
| `risk_engine.move` | v1.0 | 4-tier risk management (IM 10%, Warning 8%, MM 5%, FC 3%), Oracle price based |
| `account_positions.move` | v0.1 | Position registry (Spot max 50, Prediction NFT max 100), Owned object |
| `liquidation.move` | v1.0 | Partial liquidation (max 50%), 5% bonus, min 1 NUSDC, Permissionless |

### contracts-perp/ (pado_perp)

Perpetual futures trading.

| Module | Version | Description |
|--------|---------|-------------|
| `perpetual.move` | v1.1 | 20x leverage, IM 5%, MM 2.5%, maker 2bps / taker 5bps, max OI cap, insurance fund |
| `funding.move` | v1.0 | 8h funding rate (max 1.25%/8h), Oracle staleness 2min, EWMA based |
| `liquidation.move` | v1.1 | Position liquidation, 5% bonus, Oracle price verification (manipulation prevention), balance -> insurance fund |

### contracts-lending/ (pado_lending)

Lending protocol (Phase 12).

| Module | Description |
|--------|-------------|
| `lending_pool.move` | NUSDC pool, interest model (base 2%, multiplier 20%, jump 100%, kink 80%), reserve factor 10%, index-based interest calculation |

### contracts-nsa/ (nasun_smart_account)

Nasun Smart Account (Multi-signer + Social Recovery).

| Module | Description |
|--------|-------------|
| `smart_account.move` | Multi-signer (max 5, weight-based), 2-phase signer add, Guardian-based account recovery, Nonce protection, dynamic asset storage (Bag) |
| `recovery.move` | Social recovery: 48h timelock, pre-approved recovery_owner only, multi-Guardian approval |

### deepbookv3/

DeepBook V3 CLOB engine (Rust + Move).

```
deepbookv3/
├── crates/
│   ├── indexer/          # On-chain event indexer
│   ├── schema/           # DB schema
│   └── server/           # REST API server
├── packages/
│   ├── deepbook/         # Core CLOB engine
│   ├── deepbook_margin/  # Margin trading
│   ├── token/            # Token utilities
│   └── margin_liquidation/ # Liquidation logic
└── scripts/              # TX utilities, config, transaction templates
```
