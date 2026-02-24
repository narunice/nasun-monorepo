# Baram Environment Variables

## executor-nitro (.env)

> systemd service는 `EnvironmentFile`로 `.env`를 자동 로드함.
> 전체 변수 목록: [.env.example](../executor-nitro/.env.example)

```env
USE_VSOCK=true              # vsock (Nitro only)
ENCLAVE_CID=16
HOST_PORT=3000

# Settlement (Sui)
SUI_RPC_URL=https://rpc.devnet.nasun.io
BARAM_PACKAGE_ID=...
EXECUTOR_PRIVATE_KEY=suiprivkey1q...
COMPLIANCE_PACKAGE_ID=...
ATTESTATION_PACKAGE_ID=...
STAKING_REGISTRY_ID=...
TIER_REGISTRY_ID=...

# Phase F-2: Self-service
EXECUTOR_PACKAGE_ID=...        # baram_executor package ID (v2)
PROCESSED_REQUESTS_ID=...      # ProcessedRequests shared object
EXECUTOR_STAKE_ID=...          # ExecutorStake owned object (for tier refresh)
```
