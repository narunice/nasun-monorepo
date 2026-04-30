# Handoff: Uju ETH balance ↔ NetworkBadge "Testnet" alignment

## Context

The uju Wallet Integration card surfaces all external chain rows
(SUI / ETH / SOL) with a `NetworkBadge` that reads **"Testnet"** —
this matches the broader product direction (devnet/testnet posture
across the uju section).

The ETH row is the only one that's still inconsistent: the badge says
Testnet but `useEthBalance` queries **mainnet** (chainId hardcoded to
`mainnet.id`). A user with no mainnet ETH but funded sepolia will see
"0 ETH" under a "Testnet" badge — confusing and incorrect.

This doc captures everything needed to bring the ETH row in line in a
follow-up PR.

---

## Current state

### What's already there

[apps/nasun-website/frontend/src/config/wagmiConfig.ts](../../frontend/src/config/wagmiConfig.ts)
**already supports sepolia** when the `VITE_ETHEREUM_CHAIN_ID` env var
is not `1`:

```ts
const chainId = Number(import.meta.env.VITE_ETHEREUM_CHAIN_ID);
const chains = chainId === 1
  ? ([mainnet] as const)
  : ([mainnet, sepolia] as const);
```

Sepolia transports (Alchemy + several public RPCs) are wired. So the
chain itself is not the gap — only the per-call `chainId` argument in
balance hooks.

### Where the inconsistency lives

| File | Line | Issue |
|------|------|-------|
| [apps/nasun-website/frontend/src/sections/uju/dashboard/WalletBalanceCard.tsx](../../frontend/src/sections/uju/dashboard/WalletBalanceCard.tsx) | ~119 | `useEthBalance({ address: ethAddress, chainId: mainnet.id })` — hardcoded mainnet |
| [apps/nasun-website/frontend/src/sections/uju/dashboard/WalletBalanceCard.tsx](../../frontend/src/sections/uju/dashboard/WalletBalanceCard.tsx) | ETH row badge | `<NetworkBadge label="Testnet" />` — text says testnet |
| [apps/nasun-website/frontend/src/sections/uju/dashboard/staking/eth/useEthLst.ts](../../frontend/src/sections/uju/dashboard/staking/eth/useEthLst.ts) | (full file) | Lido stETH/wstETH read also mainnet; currently dormant (Coming Soon row) but will need the same alignment if/when re-enabled |

### Where the badges already match data

- **SUI** badge "Testnet" + `useSuiMainnetBalance` → still mainnet RPC
  but the historical decision was to surface a testnet-style label
  globally. Out of scope for this PR; track as a separate cleanup if
  product wants real testnet balance reads.
- **SOL** badge "Testnet" + `useSolMainnetBalance` → same as SUI.

This PR is **scoped to ETH only** unless the team explicitly broadens
it.

---

## Decisions before starting

1. **Which testnet?** Sepolia is the only one wired in
   `wagmiConfig.ts`. Holesky / Hoodi would require new transports.
   Default: **sepolia**.
2. **Single source of truth for the ETH chain** — pick one:
   - **(A)** Read `VITE_ETHEREUM_CHAIN_ID` env at module load and pick
     `mainnet.id` vs `sepolia.id` accordingly. Same env var that
     already drives `wagmiConfig`.
   - **(B)** Hardcode `sepolia.id` in the balance hook. Simpler but
     diverges from the env-driven config.

   Recommend **(A)** so prod/dev parity stays in one place.
3. **Behavior when the user's MetaMask is on mainnet but the app is
   sepolia-mode**: the wagmi `useBalance({ chainId: sepolia.id })`
   call will read sepolia regardless of the wallet's connected chain
   (it's a transport-driven RPC read, not a signer call). No prompt to
   switch is needed for display. If we later add a *transaction* path
   we'll need a separate "switch network" UX.

---

## Implementation

### 1. Helper: derive the active EVM chain from env

Add a tiny module so the ETH chain is decided once:

```ts
// apps/nasun-website/frontend/src/config/evmChain.ts
import { mainnet, sepolia } from "wagmi/chains";

const envChainId = Number(import.meta.env.VITE_ETHEREUM_CHAIN_ID);

/** The EVM chain the uju surfaces should read from. */
export const ACTIVE_EVM_CHAIN = envChainId === 1 ? mainnet : sepolia;
export const IS_EVM_TESTNET = ACTIVE_EVM_CHAIN.id !== mainnet.id;
```

### 2. WalletBalanceCard ETH row

```diff
- import { mainnet } from "wagmi/chains";
+ import { ACTIVE_EVM_CHAIN, IS_EVM_TESTNET } from "@/config/evmChain";

  // ETH balance
- const { data: ethBalance } = useEthBalance({
-   address: ethAddress,
-   chainId: mainnet.id,
- });
+ const { data: ethBalance } = useEthBalance({
+   address: ethAddress,
+   chainId: ACTIVE_EVM_CHAIN.id,
+ });

  // ETH row badge
- <NetworkBadge label="Testnet" />
+ <NetworkBadge label={IS_EVM_TESTNET ? "Testnet" : "Mainnet"} />
```

Drop the existing TODO comment in WalletBalanceCard once aligned.

### 3. (Optional) StakingCard / useEthLst

Currently the ETH staking row is "Coming Soon" so `useEthLst` is not
called. When the row is re-enabled, route the same way:

```diff
- // useEthLst implementation pinned to mainnet
+ // pass ACTIVE_EVM_CHAIN.id through and adjust Lido contract addresses
+ // for the chosen testnet (Lido has a sepolia deployment).
```

Note: Lido's `stETH` / `wstETH` contract addresses differ between
mainnet and sepolia. Don't ship the testnet flip for staking until the
contract address mapping is updated. Track this as a separate
sub-task if/when Coming Soon → Live.

### 4. RainbowKit modal default chain (if relevant)

`useWalletAuth({ mode: "link" })` opens the RainbowKit connect modal,
which respects the wagmi `chains` array. With both `mainnet` and
`sepolia` in the array (current behavior when `VITE_ETHEREUM_CHAIN_ID
!== 1`), the user can sign on either. The link/verify backend
(`prepareChallenge` → `connectVerify`) authenticates on signed
*message* not on chain id, so chain choice in the modal does not
affect linking. Confirm this still holds after this change in QA.

---

## Verification

### Local

1. `.env.development` (or local override): set
   `VITE_ETHEREUM_CHAIN_ID=11155111` (sepolia).
2. `pnpm dev:nasun-website` (port 5174).
3. Sign in to uju, open the dashboard.
4. Wallet Integration ETH row:
   - Badge reads "Testnet".
   - Click "Connect MetaMask" → RainbowKit modal → connect.
   - With a sepolia-funded address: balance shows the sepolia number.
   - With a mainnet-only address: balance shows `0.0000 ETH` (correct
     for sepolia).
5. Flip env to `VITE_ETHEREUM_CHAIN_ID=1` → restart dev → badge reads
   "Mainnet", balance reads from mainnet.

### Build / typecheck

```bash
pnpm --filter @nasun/nasun-website exec -- tsc --noEmit
pnpm --filter @nasun/nasun-website exec -- eslint \
  src/sections/uju/dashboard/WalletBalanceCard.tsx \
  src/config/evmChain.ts
```

### Regression

- Battalion NFT allowlist flow (`Step4WalletConnectCard` + Genesis Pass
  ownership reads) **still needs mainnet** for production. Verify
  those paths read `mainnet.id` directly (they do today via the
  always-included `mainnet` chain in `wagmiConfig`) and are *not*
  routed through `ACTIVE_EVM_CHAIN`. Quick grep:

  ```bash
  grep -rn "mainnet\.id\|chainId:\s*1\b" apps/nasun-website/frontend/src/
  ```

- Confirm `useWalletAuth` link flow still produces a valid signature
  on either chain by linking once each in dev.

---

## Out of scope

- **SUI / SOL** balance vs. badge alignment (still mainnet RPC under a
  Testnet label). Track separately if product wants real testnet reads.
- **Migrating Lido stETH/wstETH** addresses to sepolia. Required only
  when the ETH staking row leaves Coming Soon.
- **Genesis Pass / Battalion NFT** flows — they intentionally pin to
  mainnet regardless of `VITE_ETHEREUM_CHAIN_ID` because allowlists
  reference mainnet ownership.

---

## Files touched (estimated)

- New: `apps/nasun-website/frontend/src/config/evmChain.ts` (~6 lines)
- Modified: `apps/nasun-website/frontend/src/sections/uju/dashboard/WalletBalanceCard.tsx` (~5 lines, drop TODO comment)
- Optional: `apps/nasun-website/frontend/src/sections/uju/dashboard/staking/eth/useEthLst.ts` (only when ETH staking row goes Live)

Total: a small, contained PR.
