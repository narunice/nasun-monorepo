# Pado Environment Variables

> Last Updated: 2026-02-23

## Required (Network)

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_RPC_URL` | `https://rpc.devnet.nasun.io` | RPC endpoint |
| `VITE_FAUCET_URL` | `https://faucet.devnet.nasun.io` | Faucet URL |
| `VITE_CHAIN_ID` | `272218f1` | Chain ID |

## Required (DeepBook V3)

| Variable | Description |
|----------|-------------|
| `VITE_DEEPBOOK_PACKAGE` | DeepBook V3 package address |
| `VITE_DEEPBOOK_REGISTRY` | DeepBook registry |
| `VITE_DEEPBOOK_ADMIN_CAP` | DeepBook AdminCap |
| `VITE_DEEP_TOKEN` | DEEP token package |

## Required (Tokens V1)

| Variable | Description |
|----------|-------------|
| `VITE_TOKENS_PACKAGE` | Token package (NBTC, NUSDC) |
| `VITE_NBTC_TYPE` | NBTC type (`{pkg}::nbtc::NBTC`) |
| `VITE_NUSDC_TYPE` | NUSDC type (`{pkg}::nusdc::NUSDC`) |
| `VITE_FAUCET_PACKAGE` | Faucet package |
| `VITE_TOKEN_FAUCET` | TokenFaucet object |

## Required (Tokens V2 -- NETH, NSOL)

| Variable | Description |
|----------|-------------|
| `VITE_TOKENS_V2_PACKAGE` | V2 token package |
| `VITE_NETH_TYPE` | NETH type |
| `VITE_NSOL_TYPE` | NSOL type |
| `VITE_TOKEN_FAUCET_V2` | NSOL Faucet |
| `VITE_CLAIM_RECORD_V2` | NSOL ClaimRecord |
| `VITE_NETH_FAUCET_V2` | NETH Faucet |
| `VITE_NETH_CLAIM_RECORD_V2` | NETH ClaimRecord |

## Optional (Pools)

| Variable | Description |
|----------|-------------|
| `VITE_POOL_NBTC_NUSDC` | NBTC/NUSDC pool |
| `VITE_POOL_NASUN_NUSDC` | NASUN/NUSDC pool |
| `VITE_POOL_NETH_NUSDC` | NETH/NUSDC pool |
| `VITE_POOL_NSOL_NUSDC` | NSOL/NUSDC pool |

## Optional (Prediction Market)

| Variable | Description |
|----------|-------------|
| `VITE_PREDICTION_PACKAGE` | Prediction package |
| `VITE_PREDICTION_GLOBAL_STATE` | GlobalState object |
| `VITE_PREDICTION_ADMIN_CAP` | AdminCap |
| `VITE_PREDICTION_RESOLVER_ADDRESS` | Resolver address |

## Optional (Oracle)

| Variable | Description |
|----------|-------------|
| `VITE_ORACLE_PACKAGE_ID` | DevOracle package |
| `VITE_ORACLE_REGISTRY_ID` | OracleRegistry |
| `VITE_ORACLE_ADMIN_CAP_ID` | Oracle AdminCap |

## Optional (zkLogin)

| Variable | Description |
|----------|-------------|
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth Client ID |
| `VITE_ZKLOGIN_SALT_API_URL` | Salt API (AWS Lambda) |
| `VITE_ZKLOGIN_PROVER_URL` | ZK Prover (default: Mysten Labs) |

## Optional (Chat / Social)

| Variable | Description |
|----------|-------------|
| `VITE_CHAT_WS_URL` | Chat WebSocket URL |
| `VITE_CHAT_HTTP_URL` | Chat HTTP API URL |

## Feature Flags

| Variable | Description |
|----------|-------------|
| `VITE_USE_TRADINGVIEW` | Enable TradingView chart (`true`/`false`) |
