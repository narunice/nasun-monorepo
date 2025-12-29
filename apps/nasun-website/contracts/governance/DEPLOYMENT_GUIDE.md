# Governance Package Deployment Guide

## Current Status (v2 - 2025-12-28)

- **Package ID**: `0xfa3437de2df8faf064c5b77d6be4f0e6cb61f30f9d53df7bd6d838ab36d58e13`
- **Dashboard ID**: `0xb117dd5ddd67ae1625b20b0129840ecfaed0738a6471e5550b164d7a1407f6d5`
- **AdminCap**: `0xd9784a4a9757b5e5dcd0a28484159f07d90e5980c3f02a20f33981929f242037`
- **UpgradeCap**: `0xb78f64beee0138fecc9ef8d92eef6bfd41841f0b7869577473b5037f9daefc66`
- **DelegationRegistry**: `0xd4dcb9801964c094db4f73ba49cdb3aa2bd5345753b79a2c227765b61e2a97c4`
- **Owner Address**: `0x374345304db69fedcdff5170cf295c5a2b4c7d4680956032255010cb8a1dfbfb`

## Modules

| Module | Description |
|--------|-------------|
| `dashboard` | Main governance dashboard, proposal listing |
| `proposal` | Proposal creation and voting (with voting power) |
| `delegation` | Voting power delegation system |

---

## delegation.move Module

The `delegation.move` module supports voting power delegation.

### Features

- `DelegationRegistry` - Shared object tracking all delegations
- `delegate(registry, to)` - Delegate voting power to another address
- `revoke(registry)` - Revoke an existing delegation
- View functions: `has_delegated()`, `get_delegate()`, `get_delegators()`, `delegator_count()`

### Security

- Self-delegation prevented
- Circular delegation detected (1-level)
- Must revoke before re-delegating

---

## Fresh Deployment Steps

### 1. Clean build artifacts

```bash
cd apps/nasun-website/contracts/governance
rm -rf build Pub.nasun-devnet.toml
```

### 2. Switch to Admin Account

```bash
nasun client switch --address 0x374345304db69fedcdff5170cf295c5a2b4c7d4680956032255010cb8a1dfbfb
```

### 3. Publish Package

```bash
nasun client test-publish --build-env nasun-devnet --gas-budget 100000000
```

### 4. Initialize DelegationRegistry

After publishing, call `init_registry` to create the shared DelegationRegistry:

```bash
nasun client call \
  --package <NEW_PACKAGE_ID> \
  --module delegation \
  --function init_registry \
  --args <ADMIN_CAP_ID> \
  --gas-budget 10000000
```

### 5. Update Frontend Constants

Update `apps/nasun-website/frontend/src/constants/suiPackageConstants.ts`:

```typescript
export const NASUN_DEVNET_PACKAGE_ID = "<NEW_PACKAGE_ID>";
export const NASUN_DEVNET_DASHBOARD_ID = "<DASHBOARD_ID>";
export const NASUN_DEVNET_ADMIN_CAP = "<ADMIN_CAP_ID>";
export const NASUN_DEVNET_UPGRADE_CAP = "<UPGRADE_CAP_ID>";
export const NASUN_DEVNET_DELEGATION_REGISTRY_ID = "<DELEGATION_REGISTRY_ID>";
```

---

## Upgrade Steps (existing package)

### 1. Clean build artifacts

```bash
rm -rf build
```

### 2. Upgrade Package

```bash
nasun client upgrade \
  --upgrade-capability 0xb78f64beee0138fecc9ef8d92eef6bfd41841f0b7869577473b5037f9daefc66 \
  --gas-budget 100000000
```

---

## Troubleshooting

### Environment Detection Error

If you see "Your active environment nasun-devnet is not present in Move.toml":

1. Clean all build artifacts: `rm -rf build Pub.nasun-devnet.toml`
2. Use `test-publish` with `--build-env` flag
3. Ensure Move.toml has the environments section:

```toml
[environments]
nasun-devnet = "6681cdfd"
```

### Insufficient Gas

```bash
curl -X POST https://faucet.devnet.nasun.io/gas -d '{"FixedAmountRequest":{"recipient":"0x374345304db69fedcdff5170cf295c5a2b4c7d4680956032255010cb8a1dfbfb"}}'
```

---

## Post-Deployment Verification

1. Verify the DelegationRegistry object exists:

```bash
nasun client object 0xd4dcb9801964c094db4f73ba49cdb3aa2bd5345753b79a2c227765b61e2a97c4
```

2. Test delegation from frontend at `/protocol/governance`

---

## Previous Deployments

### v1 (2025-12-27)

- Package ID: `0xd6bf281276f34f3fd9e267e3faf00518350a0e5daa043d74185bb183a6c788c8`
- Dashboard ID: `0x84b53292a8133a886a27c2c5a8255635d219f07e50e1f747a7b869907eedc037`
- AdminCap: `0xe3a82a5c29e55b2286da9c4a17c33c07a3350f7a40b313c881e98aa375cd7fb5`
- UpgradeCap: `0xc2dd5e374a71fb4997aa0738130010be456a6b1bc4c93c355b47af9b65c1797e`
