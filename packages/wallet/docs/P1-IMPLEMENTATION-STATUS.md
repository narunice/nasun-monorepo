# @nasun/wallet - Implementation Status

> Last Updated: 2026-02-18
> Package: @nasun/wallet
> Version: 0.7.x

---

## Overview

Universal Web3 wallet library supporting Sui/Move and EVM chains. Provides core cryptography, signer abstraction, hardware wallet integration, account abstraction, payment UX, zkLogin authentication, and Nasun Smart Account (NSA) with Trinity Recovery.

**Related Docs:**
- [README](../README.md) — Package overview, feature summary, hooks reference
- [Developer Guide](./WALLET-GUIDE.md) — Integration guide with code examples
- [UI Improvement Plan](./WALLET_UI_IMPROVEMENT_PLAN.md) — UX improvement roadmap

---

## Module Map

```
src/
├── config/                    Chain, network, token registries
├── core/
│   ├── aa/                    ERC-4337 Account Abstraction
│   │   └── session-keys/     Session key management
│   ├── clear-signing/         Transaction decoding & formatting
│   ├── evm/                   EVM client, wallet, ERC-20
│   ├── ledger/                Ledger hardware wallet
│   ├── link/                  Nasun Link (token distribution URLs)
│   ├── nsa/                   Nasun Smart Account (on-chain client, backup, recovery)
│   ├── payment/               Payment intent, QR, validation
│   ├── portfolio/             Price provider, portfolio aggregation
│   ├── signer/                Signer abstraction layer
│   │   └── adapters/          8 signer implementations
│   ├── walletconnect/         WalletConnect v2 SignClient
│   ├── zkid/                  Zero-knowledge identity (age, KYC, sybil)
│   ├── crypto.ts              Mnemonic, AES, secure memory
│   ├── keystore.ts            Encrypted key storage
│   ├── passkey.ts             WebAuthn/Passkey (biometrics)
│   ├── rate-limit.ts          Brute-force lockout
│   └── zklogin.ts             zkLogin OAuth + ZK proof
├── hooks/                     40+ React hooks
├── schemas/                   Zod RPC validation
├── stores/                    Zustand state stores
├── sui/                       Sui-specific utilities
├── types/                     Shared type definitions
└── index.ts                   Package exports
```

---

## Core Modules

### Signer Abstraction (`core/signer/`)

| File | Description | Status |
|------|-------------|--------|
| `types.ts` | SignerAdapter interface, SignerType union (8 types) | ✅ Stable |
| `SignerManager.ts` | Active signer state management | ✅ Stable |
| `adapters/LocalSigner.ts` | Ed25519 keypair (Sui native) | ✅ Stable |
| `adapters/ZkLoginSigner.ts` | zkLogin ZK proof signer | ✅ Stable |
| `adapters/EVMSigner.ts` | EVM secp256k1 signer | ✅ Stable |
| `adapters/LedgerSigner.ts` | Ledger hardware wallet (Sui + EVM) | ✅ Stable |
| `adapters/SmartAccountSigner.ts` | ERC-4337 Smart Account (EVM) | ✅ Stable |
| `adapters/SessionKeySigner.ts` | ERC-4337 session key (EVM) | ✅ Stable |
| `adapters/NsaSigner.ts` | Nasun Smart Account (wraps underlying signer) | ✅ Stable |
| `adapters/PasskeySigner.ts` | WebAuthn/Passkey biometric signer | ✅ Stable |

### Nasun Smart Account (`core/nsa/`)

| File | Description | Status |
|------|-------------|--------|
| `types.ts` | Operation parameter types | ✅ Stable |
| `client.ts` | On-chain query + TX builders | ✅ Stable |
| `backup.ts` | Tier 2: PBKDF2 600K + AES-256-GCM encrypted backup | ✅ Stable |
| `recovery.ts` | Tier 3: Guardian recovery status, timelock, validation | ✅ Stable |

**Deployed (Devnet V7):**
- **Package ID:** `0x566eb1ba9e403dcd46c33c45d9a023570f09327b35bde4b8d6fd8b63e70012f3`
- **Registry:** `0x00bdb8c97ea5670c5e5708daeadcb46291e54e178d126954a6f1c06fab90386a`

### Multi-Chain & EVM (`core/evm/`, `config/chains.ts`)

- **EVM Chains (11):** Ethereum, Base, Arbitrum, Optimism, Polygon, Avalanche, BSC, Fantom, Gnosis, Celo, zkSync Era.
- **Account Abstraction:** Bundler (Pimlico/Alchemy), Paymaster sponsorship, Session keys implemented.

### WalletConnect v2 (`core/walletconnect/`)

- **Status:** ✅ Fully functional.
- **Namespaces:** EIP-155 (EVM) and Sui supported.
- **UI:** Integrated in `@nasun/wallet-ui` with session management and request approval flows.

### Clear Signing & Safety (`core/clear-signing/`)

- **Status:** ✅ Integrated into transaction flows.
- **Functionality:** Human-readable decoding of Move and EVM transactions with Safety Score (High/Med/Low).

---

## Hooks Reference (40+ hooks)

### Wallet & Signer
- `useWallet`, `useWalletStatus`, `useWalletAccount`, `useSigner`, `useSignerAddress`.

### Assets & Portfolio
- `useBalance`, `useMultiBalance`, `useNativeBalance`, `useTokenBalance`.
- `usePortfolio`, `usePortfolioTotalValue`, `useEVMBalance`, `useERC20Balances`.
- `useNFTs`, `useNFTTransfer`.

### Transactions & Staking
- `useTransaction`, `useTokenTransaction`, `useEVMTransaction`, `useGaslessTransaction`.
- `useValidators`, `useStaking`, `useStakeTransaction`.
- `useTransactionHistory`.

### Authentication
- `useZkLogin`, `useZkLoginCallback`, `useZkLoginUser`.
- `usePasskey`, `hasPasskeyWallet`.
- `useLedger`, `useIsLedgerActive`.

### Advanced Web3
- `useNasunSmartAccount`, `useNsaRecovery`, `useNsaBackup`.
- `useWalletConnect`, `useWalletConnectSessionCount`.
- `useSmartAccount`, `useSessionKey`.
- `useNasunLink`, `useClaimFromUrl`.
- `usePayment`, `usePaymentIntent`, `usePaymentQR`.
- `useZKID`.

---

## Infrastructure

### Security defaults
- **Rate Limiting:** 8/12/16 attempts -> 30s/5m/30m lockouts (survives refreshes via localStorage).
- **Encryption:** AES-256-GCM + PBKDF2 (100K iterations for keystore, 600K for NSA backup).

### Tests
- **Status:** ✅ 18 test files covering all core modules, utility functions, and hooks.
