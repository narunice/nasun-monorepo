# Baram Environment Variables

## executor-nitro (.env)

> systemd service는 `EnvironmentFile`로 `.env`를 자동 로드함.
> 전체 변수 목록: [.env.example](../executor-nitro/.env.example)

### Core (settlement + AER)

```env
USE_VSOCK=true              # vsock (Nitro only)
ENCLAVE_CID=16
HOST_PORT=3000

# Settlement (Nasun L1)
SUI_RPC_URL=https://rpc.devnet.nasun.io
BARAM_PACKAGE_ID=...
BARAM_REGISTRY_ID=...
EXECUTOR_PRIVATE_KEY=suiprivkey1q...
COMPLIANCE_PACKAGE_ID=...
ATTESTATION_PACKAGE_ID=...
STAKING_REGISTRY_ID=...
TIER_REGISTRY_ID=...

# Phase F-2: Self-service
EXECUTOR_PACKAGE_ID=...        # baram_executor package ID (v2)
PROCESSED_REQUESTS_ID=...      # ProcessedRequests shared object
EXECUTOR_STAKE_ID=...          # ExecutorStake owned object (for tier refresh)

# Plan B: capability gating
AER_PACKAGE_ID=...             # baram_aer fresh package (post-C3-v2a republish)
AER_REGISTRY_ID=...
CAPABILITY_REGISTRY_ID=...
```

### Plan C C3-v2: delegated spend + /infer split

The host now mints an HMAC inference token at `/infer` and re-verifies it
at `/execute-capability`. For execution AERs, it derives the slippage
floor via `pool::get_quantity_out` devInspect against the registered
Pado pool, so the trader's `min_out` u64 is rebound to a live quote
before the swap is composed.

```env
# Inference token HMAC. 32-byte hex. If unset, a random key is generated
# at boot (warns on stdout). Random-at-boot is acceptable per DV8 (token
# expiry is 30s) but stable across restarts requires this var.
HOST_HMAC_KEY=<32-byte hex>

# Pado DeepBookV3 swap config (host preflight + on-chain quote phase).
# Resolved by config/action-classes.json via $-prefixed env substitution.
PADO_DEEPBOOK_PACKAGE_ID=0xb4a1...     # DeepBookV3 published package id
PADO_NBTC_NUSDC_POOL=0xa2b7...         # Shared Pool<NBTC, NUSDC> object id
NBTC_TYPE=0x...::nbtc::NBTC            # Fully-qualified base asset TypeName
NUSDC_TYPE=0x...::nusdc::NUSDC         # Fully-qualified quote asset TypeName
PADO_DEEP_TYPE=0x...::deep::DEEP       # DEEP fee TypeName (whitelisted pool)
```

`HOST_HMAC_KEY` rotation: stop the host, set the new key, restart. Any
in-flight tokens (≤30s old) invalidate; clients re-call `/infer`. Random
boot keys are also acceptable for staging but produce noisier audit
trails (each restart breaks token continuity).

`PADO_*` env vars MUST be set for any execution AER. Cognition AERs
(HOLD path) don't depend on them. The slippage-floor enforcement
fail-closes at HTTP 502 if any are missing or the pool devInspect
fails.

---

## agent-runner (.env)

Trader preset (set when `PRESET=trader`):

```env
PRESET=trader
HOST_URL=https://<executor-host>      # /infer + /execute-capability endpoint
CAPABILITY_ID=0x...                    # shared Capability object (cap.owner = WALLET_ADDRESS)
WALLET_ADDRESS=0x...
ESCROW_ID=0x...                        # shared AgentEscrow (cap.escrow_id = Some(this))
COIN_NUSDC_TYPE=0x...::nusdc::NUSDC
COIN_NBTC_TYPE=0x...::nbtc::NBTC

# Risk limits (mirror cap.risk_limits client-side so LLM replies are gated locally).
MAX_NOTIONAL_QUOTE_RAW=2000000         # 2 NUSDC (default)
DAILY_MAX_QUOTE_RAW=20000000           # 20 NUSDC (default)
MAX_SLIPPAGE_BPS=100                   # 1.0% (default)
STRATEGY=balanced                       # see presets/strategies.ts
```

Both `CAPABILITY_ID` and `ESCROW_ID` are produced by a one-shot wallet
PTB calling `escrowSdk.buildAtomicSetupTx` (see C3-v2 plan §1.4 / DV5).
The mutual reference is enforced on chain: setting `ESCROW_ID` to an
unrelated escrow object will be rejected by host preflight
(`escrow.capabilityId !== capabilityId`).
