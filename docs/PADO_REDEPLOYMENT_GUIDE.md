# Pado Smart Contract Redeployment Guide

This guide documents the complete redeployment procedure for Pado smart contracts on Nasun Devnet.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Nasun CLI Setup](#nasun-cli-setup)
3. [Phase 1: Deploy pado_tokens Package](#phase-1-deploy-pado_tokens-package)
4. [Phase 2: Deploy prediction Package](#phase-2-deploy-prediction-package)
5. [Phase 3: Create Prediction Markets](#phase-3-create-prediction-markets)
6. [Phase 4: Update Frontend Configuration](#phase-4-update-frontend-configuration)
7. [Phase 5: DeepBook V3 Pool Creation](#phase-5-deepbook-v3-pool-creation)
8. [Troubleshooting](#troubleshooting)

---

## Prerequisites

- Access to Nasun Devnet RPC: `https://rpc.devnet.nasun.io`
- Nasun CLI binary at `/home/naru/my_apps/nasun-devnet/sui/target/release/sui`
- Sufficient NASUN tokens for gas (get from faucet: `https://faucet.devnet.nasun.io/gas`)
- Working directory: `/home/naru/my_apps/nasun-monorepo`

---

## Nasun CLI Setup

### 1. Set up alias

```bash
alias nasun='/home/naru/my_apps/nasun-devnet/sui/target/release/sui'
```

### 2. Add nasun-devnet environment

```bash
nasun client new-env --alias nasun-devnet --rpc https://rpc.devnet.nasun.io
```

### 3. Switch to nasun-devnet

```bash
nasun client switch --env nasun-devnet
```

### 4. Verify environment

```bash
nasun client envs
# Should show nasun-devnet as active

nasun client active-address
# Should show your wallet address
```

### 5. Get gas from faucet

```bash
curl -X POST https://faucet.devnet.nasun.io/gas \
  -H "Content-Type: application/json" \
  -d '{"FixedAmountRequest":{"recipient":"YOUR_WALLET_ADDRESS"}}'
```

---

## Phase 1: Deploy pado_tokens Package

This package contains NBTC, NUSDC tokens and the Token Faucet.

### 1.1 Prepare Move.toml

Edit `apps/pado/contracts/Move.toml`:

```toml
[package]
name = "pado_tokens"
edition = "2024"
version = "0.0.1"
# Remove or comment out published-at for fresh deployment

[dependencies]
Sui = { git = "https://github.com/MystenLabs/sui.git", subdir = "crates/sui-framework/packages/sui-framework", rev = "framework/testnet" }

[addresses]
pado = "0x0"  # Set to 0x0 for fresh deployment

[environments]
devnet = "579d23f7"
nasun-devnet = "6681cdfd"
```

### 1.2 Clean build artifacts

```bash
cd apps/pado/contracts
rm -rf build/
rm -f Move.lock
```

### 1.3 Deploy using test-publish

> **Note**: Due to a SUI CLI v1.63.0 bug, standard `sui move build` and `sui client upgrade` commands fail. Use `test-publish` as a workaround.

```bash
nasun client test-publish --build-env nasun-devnet --gas-budget 100000000
```

### 1.4 Record deployed objects

From the output, record:
- **Package ID**: The new package address
- **UpgradeCap**: For future upgrades
- **TokenFaucet**: Shared object ID (if auto-created, otherwise create in next step)
- **TreasuryCaps**: NBTC and NUSDC TreasuryCap objects

### 1.5 Create TokenFaucet (if not auto-created)

If the token faucet wasn't created during deployment:

```bash
nasun client call \
  --package <PACKAGE_ID> \
  --module faucet \
  --function create_faucet \
  --args <NBTC_TREASURY_CAP> <NUSDC_TREASURY_CAP> \
  --gas-budget 10000000
```

### 1.6 Create ClaimRecord (for rate limiting)

```bash
nasun client call \
  --package <PACKAGE_ID> \
  --module faucet \
  --function create_claim_record \
  --gas-budget 10000000
```

### 1.7 Update Move.toml with deployed address

```toml
[addresses]
pado = "<NEW_PACKAGE_ID>"

# Add published-at for future upgrades
published-at = "<NEW_PACKAGE_ID>"
```

---

## Phase 2: Deploy prediction Package

This package depends on pado_tokens.

### 2.1 Update Move.toml

Edit `apps/pado/contracts-prediction/Move.toml`:

```toml
[package]
name = "pado_prediction"
edition = "2024.beta"
version = "0.0.1"
# Remove published-at for fresh deployment

[dependencies]
pado_tokens = { local = "../contracts" }

[addresses]
prediction = "0x0"
pado = "<PADO_TOKENS_PACKAGE_ID>"  # From Phase 1

[environments]
nasun-devnet = "6681cdfd"
```

### 2.2 Clean and deploy

```bash
cd apps/pado/contracts-prediction
rm -rf build/
rm -f Move.lock

nasun client test-publish --build-env nasun-devnet --gas-budget 100000000
```

### 2.3 Record deployed objects

- **Package ID**: Prediction package address
- **AdminCap**: Required for creating markets
- **GlobalState**: Shared object for order ID generation
- **UpgradeCap**: For future upgrades

### 2.4 Update Move.toml

```toml
[addresses]
prediction = "<NEW_PREDICTION_PACKAGE_ID>"
pado = "<PADO_TOKENS_PACKAGE_ID>"

published-at = "<NEW_PREDICTION_PACKAGE_ID>"
```

---

## Phase 3: Create Prediction Markets

### 3.1 Market creation command

```bash
nasun client call \
  --package <PREDICTION_PACKAGE_ID> \
  --module prediction_market \
  --function create_market \
  --args \
    <ADMIN_CAP_ID> \
    "Market Question" \
    "Market Description" \
    "Category" \
    <CLOSE_TIME_MS> \
    <RESOLVE_DEADLINE_MS> \
    <RESOLVER_ADDRESS> \
    0x6 \
  --gas-budget 50000000
```

### 3.2 Example: Create BTC $150k market

```bash
# Timestamps (milliseconds)
# March 1, 2026 00:00 UTC = 1772438400000
# March 8, 2026 00:00 UTC = 1773043200000

nasun client call \
  --package 0x6754f5806b9bb348f570e350b1309deb5bd9469d0d3000455b1ce368ef4085eb \
  --module prediction_market \
  --function create_market \
  --args \
    0x9e06794a20be24f3be11558351125924aed98a6ac03c1d1ec212c3197fb9a3c6 \
    "Will BTC reach 150000 USD by March 2026?" \
    "Prediction on whether Bitcoin will reach 150000 USD on any major exchange." \
    "Crypto" \
    1772438400000 \
    1773043200000 \
    0x05eef6d318e5a824fdf763270e3a719bb0327ddf814dea29cba6c963ebdb8f21 \
    0x6 \
  --gas-budget 50000000
```

### 3.3 Current test markets (as of 2026-01-01)

| Question | Market ID | Category | Close Time |
|----------|-----------|----------|------------|
| Will BTC reach 150000 USD by March 2026? | 0xdc90e9a3ab8609e7322d711fb56d996622e1119070057b2359449193656d71b8 | Crypto | March 1, 2026 |
| Will TikTok be banned in the US by March 2026? | 0x0a1f9f569660fa89988192c8645dede0928d489d0330c19e63f4a613bd202fe5 | Politics | March 1, 2026 |
| Will HUNTR/X win Song of the Year at 2026 Grammy? | 0xb1859139e2a7c7005ce17434b2d2d11b9930e7bab9b161b5421e7817b2bc577b | Entertainment | Feb 4, 2026 |
| Will there be a Russia-Ukraine ceasefire by June 2026? | 0x7a044386e183bdaf9c1eb802ee88422078af3603cfe6a00b6aab170164af4805 | Geopolitics | June 30, 2026 |

---

## Phase 4: Update Frontend Configuration

### 4.1 Update .env.staging

Edit `apps/pado/.env.staging`:

```env
# Pado Test Tokens Package
VITE_TOKENS_PACKAGE=<NEW_PADO_TOKENS_PACKAGE_ID>

# Token Types
VITE_NBTC_TYPE=<PACKAGE_ID>::nbtc::NBTC
VITE_NUSDC_TYPE=<PACKAGE_ID>::nusdc::NUSDC

# Token Faucet
VITE_FAUCET_PACKAGE=<NEW_PADO_TOKENS_PACKAGE_ID>
VITE_TOKEN_FAUCET=<TOKEN_FAUCET_ID>
VITE_CLAIM_RECORD=<CLAIM_RECORD_ID>

# Trading Pools (TODO: recreate with DeepBook)
# VITE_POOL_NBTC_NUSDC=
# VITE_POOL_NASUN_NUSDC=

# Prediction Market
VITE_PREDICTION_RESOLVER_ADDRESS=<RESOLVER_ADDRESS>
```

### 4.2 Update prediction/constants.ts

Edit `apps/pado/frontend/src/features/prediction/constants.ts`:

```typescript
export const PREDICTION_PACKAGE_ID = '<NEW_PREDICTION_PACKAGE_ID>';
export const PREDICTION_ADMIN_CAP = '<ADMIN_CAP_ID>';
export const PREDICTION_GLOBAL_STATE = '<GLOBAL_STATE_ID>';

export const NUSDC_TYPE = '<PADO_TOKENS_PACKAGE_ID>::nusdc::NUSDC';

export const TEST_MARKETS: string[] = [
  '<MARKET_1_ID>',
  '<MARKET_2_ID>',
  // ...
];
```

---

## Phase 5: DeepBook V3 Pool Creation

> **Note**: DeepBook pool creation requires either AdminCap ownership or DEEP tokens (500 DEEP for permissionless pool).

### 5.1 Check AdminCap ownership

```bash
nasun client object <DEEPBOOK_ADMIN_CAP>
```

Current DeepBook AdminCap owner: `0x374345304db69fedcdff5170cf295c5a2b4c7d4680956032255010cb8a1dfbfb`

### 5.2 Option A: Admin Pool Creation (requires AdminCap)

If you have AdminCap, use the `createPoolAdmin` function via DeepBook SDK scripts.

### 5.3 Option B: Permissionless Pool (requires DEEP tokens)

```typescript
// Using DeepBook SDK
dbClient.deepBook.createPermissionlessPool({
  baseCoinKey: "NBTC",
  quoteCoinKey: "NUSDC",
  tickSize: 0.01,
  lotSize: 0.0001,
  minSize: 0.0001,
})(tx);
```

Requires 500 DEEP tokens as creation fee.

### 5.4 Pool Configuration

| Pool | Base Token | Quote Token | Tick Size | Lot Size |
|------|------------|-------------|-----------|----------|
| NBTC/NUSDC | NBTC (8 decimals) | NUSDC (6 decimals) | $0.01 | 0.0001 BTC |
| NASUN/NUSDC | NASUN (9 decimals) | NUSDC (6 decimals) | $0.001 | 0.01 NASUN |

### 5.5 Created Pools (2026-01-01)

```
NBTC/NUSDC Pool: 0xd19dfb9a51424a2193ef4284a1bf67d3c03b5ef3132446016243f9d394ef7180
NASUN/NUSDC Pool: 0x9022d534d9846cbc32341fe07d4444be142065d0b7b2cc11a16ffe53a2e7d0f2
```

---

## Troubleshooting

### SUI CLI Environment Bug

**Problem**: `sui move build` and `sui client upgrade` fail with "environment not present in Move.toml"

**Solution**: Use `test-publish` instead:
```bash
nasun client test-publish --build-env nasun-devnet --gas-budget 100000000
```

### Wrong Network

**Problem**: Transactions succeed but objects not found

**Solution**: Check active environment:
```bash
nasun client envs  # Check active env
nasun client switch --env nasun-devnet  # Switch if needed
```

### Gas Not Found

**Problem**: "No gas coins found"

**Solution**:
1. Check wallet address: `nasun client active-address`
2. Get gas from faucet
3. Verify: `nasun client gas`

### Object Version Mismatch

**Problem**: "Object version X is less than latest version Y"

**Solution**: Wait a few seconds and retry. The object was recently modified.

---

## Reference: Current Deployed Addresses (2026-01-01)

### pado_tokens Package
```
Package ID:      0xb083f14e6d768d6ccb7bb95b225a06d65fa41a14aea4c8d102ae1a104835c1d7
TokenFaucet:     0x6f40eeee18299bb4f0f56a55f50aa2d844e83e490d03b0f763ec456188719fab
ClaimRecord:     0xb17a4b82ff7bd2d8e01bc04cca01397d343435de10f01647e9ef03582547691c
UpgradeCap:      0x554252adec05b7cdb203cb90aa37cc19571ad4f9b186b04b04cbd3b781f79761
```

### prediction Package
```
Package ID:      0x6754f5806b9bb348f570e350b1309deb5bd9469d0d3000455b1ce368ef4085eb
AdminCap:        0x9e06794a20be24f3be11558351125924aed98a6ac03c1d1ec212c3197fb9a3c6
GlobalState:     0x02bd4975791ee0c2e73aa5f41e596b6a04f7cc5045f3e36a60832dcf8b5ba421
```

### DeepBook V3
```
Package:         0xceaeca5c1a5f31e1282c47000b442289b2aa454f007c1e1e316110414e020757
Registry:        0xf38bd1c809db53656767848a84464ab2a9cdd9283dbb3dd54d82a972c7dab6a4
AdminCap:        0x1010f2ef902c482ffba7c9848d74b209bfcbbef4003f583f5faaadcf4ca883cb
AdminCap Owner:  0x374345304db69fedcdff5170cf295c5a2b4c7d4680956032255010cb8a1dfbfb
```

---

## Commit and Tag

After redeployment:

```bash
git add -A
git commit -m "deploy: pado contracts redeployment

- pado_tokens: <PACKAGE_ID>
- prediction: <PACKAGE_ID>
- TokenFaucet: <FAUCET_ID>
- Test markets: 4 created

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"

git tag -a security-phase3-sc-deployed -m "Phase 3 SC Complete: New deployment"
git push origin main --tags
```
