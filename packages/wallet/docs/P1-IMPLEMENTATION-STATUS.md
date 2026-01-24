# @nasun/wallet - Implementation Status

> Last Updated: 2026-01-24
> Package: @nasun/wallet
> Version: 0.1.0

---

## Overview

Universal Web3 wallet library supporting Sui/Move and EVM chains. Provides core cryptography, signer abstraction, hardware wallet integration, account abstraction, payment UX, and zkLogin authentication.

**Related Docs:**
- [WalletConnect v2](./P2-WALLETCONNECT-V2.md)
- [EVM Account Abstraction](./P3-EVM-ACCOUNT-ABSTRACTION.md)
- [Nasun Link v2](./P4-NASUN-LINK-V2.md)
- [zkLogin Multi-Provider](./ZKLOGIN-MULTI-PROVIDER.md)

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
│   ├── payment/               Payment intent, QR, validation
│   ├── portfolio/             Price provider
│   ├── signer/                Signer abstraction layer
│   │   └── adapters/          6 signer implementations
│   ├── walletconnect/         WalletConnect v2 SignClient
│   ├── zkid/                  Zero-knowledge identity
│   ├── crypto.ts              Mnemonic, AES, secure memory
│   ├── keystore.ts            Encrypted key storage
│   ├── passkey.ts             WebAuthn/Passkey
│   ├── rate-limit.ts          Brute-force lockout
│   └── zklogin.ts             zkLogin OAuth + ZK proof
├── hooks/                     33 React hooks
├── schemas/                   Zod RPC validation
├── stores/                    Zustand state stores
├── sui/                       Sui-specific utilities
├── types/                     Shared type definitions
└── index.ts                   Package exports (1066 lines)
```

---

## Core Modules

### Signer Abstraction (`core/signer/`)

| File | Description |
|------|-------------|
| `types.ts` | SignerAdapter interface, ChainType enum |
| `SignerManager.ts` | Active signer state management |
| `adapters/LocalSigner.ts` | Ed25519 keypair (Sui native) |
| `adapters/ZkLoginSigner.ts` | zkLogin ZK proof signer |
| `adapters/EVMSigner.ts` | EVM secp256k1 signer |
| `adapters/LedgerSigner.ts` | Ledger hardware wallet |
| `adapters/SmartAccountSigner.ts` | ERC-4337 Smart Account |
| `adapters/SessionKeySigner.ts` | ERC-4337 session key |

### EVM (`core/evm/`)

| File | Description |
|------|-------------|
| `client.ts` | viem PublicClient management |
| `wallet.ts` | BIP-44 HD key derivation |
| `keystore.ts` | EVM-specific encrypted keystore |
| `erc20.ts` | ERC-20 balance, metadata, allowance queries |

### Account Abstraction (`core/aa/`)

| File | Description |
|------|-------------|
| `account.ts` | SimpleSmartAccount factory (counterfactual) |
| `bundler.ts` | BundlerClient for UserOperation submission |
| `paymaster.ts` | PimlicoPaymasterClient gas sponsorship |
| `types.ts` | SmartAccount, UserOp types |
| `session-keys/manager.ts` | SessionKeyManager: create, validate, revoke |

### WalletConnect (`core/walletconnect/`)

| File | Description |
|------|-------------|
| `client.ts` | Singleton SignClient wrapper |
| `handlers.ts` | personal_sign, eth_sendTransaction, sui_signTransaction |
| `namespaces.ts` | EIP-155 and Sui namespace builders |
| `types.ts` | Config, request, event types |

### Nasun Link (`core/link/`)

| File | Description |
|------|-------------|
| `generator.ts` | Link creation: ephemeral keypair + fund + encrypt |
| `claim.ts` | Claim processing: decrypt + transfer |
| `crypto.ts` | AES-256-GCM encrypt/decrypt, ephemeral keypair gen |
| `types.ts` | LinkConfig, LinkData, LinkURL, ClaimResult |

### Payment (`core/payment/`)

| File | Description |
|------|-------------|
| `types.ts` | PaymentIntent, PaymentRequest |
| `validation.ts` | Address/amount validation |
| `link.ts` | Payment URL generation/parsing |
| `qr.ts` | QR code generation |

### Ledger (`core/ledger/`)

| File | Description |
|------|-------------|
| `transport.ts` | USB/BLE transport management |
| `evm-ledger.ts` | EVM signing via Ledger |
| `sui-ledger.ts` | Sui signing via Ledger |
| `types.ts` | Transport, device types |

### ZK-ID (`core/zkid/`)

| File | Description |
|------|-------------|
| `prover.ts` | ZK proof generation |
| `verifier.ts` | ZK proof verification |
| `credential.ts` | Credential management |
| `nullifier.ts` | Nullifier computation |
| `types.ts` | ZK-ID types |

### Clear Signing (`core/clear-signing/`)

| File | Description |
|------|-------------|
| `decoder.ts` | Transaction data decoding |
| `formatter.ts` | Human-readable formatting |
| `types.ts` | Decoded transaction types |

### Portfolio (`core/portfolio/`)

| File | Description |
|------|-------------|
| `price-provider.ts` | DefaultPriceProvider for token USD prices |

### Core Utilities

| File | Description |
|------|-------------|
| `crypto.ts` | Mnemonic generation, AES-256-GCM, secure memory zeroing |
| `keystore.ts` | PBKDF2 encrypted key storage (100K iterations) |
| `passkey.ts` | WebAuthn credential create/authenticate |
| `rate-limit.ts` | Brute-force lockout (8/12/16 attempts → 30s/5m/30m) |
| `zklogin.ts` | OAuth URL builder, JWT verify, ZK proof, salt API |

---

## Sui Utilities (`sui/`)

| File | Description |
|------|-------------|
| `client.ts` | Sui RPC client, balance query, address utils |
| `faucet.ts` | Native faucet HTTP API handler |
| `nft.ts` | NFT query (Display), transfer |
| `staking.ts` | Validator query, stake/unstake TX builders |
| `tokenFaucet.ts` | NBTC/NUSDC faucet (Move contract interaction) |

**Auto-registered Token Faucets:**
- `NSN` → nativeFaucetHandler (HTTP API)
- `NBTC` → nbtcFaucetHandler (Move contract)
- `NUSDC` → nusdcFaucetHandler (Move contract)

---

## Hooks Reference (33 hooks)

### Wallet Core
| Hook | Description |
|------|-------------|
| `useWallet` | Wallet state (Zustand): create, unlock, lock, status |
| `useBalance` | SUI native balance query (TanStack Query) |
| `useMultiBalance` | Multi-token balance aggregation |
| `useTransaction` | Transaction signing and submission |
| `useTokenTransaction` | Token-specific transfer |
| `useTransactionHistory` | TX history query |
| `useNetwork` | Network configuration |
| `useAddressBook` | Address book CRUD |

### Signer
| Hook | Description |
|------|-------------|
| `useSigner` | Active signer selection and management |

### NFT & Staking
| Hook | Description |
|------|-------------|
| `useNFTs` | NFT collection query |
| `useNFTTransfer` | NFT transfer operations |
| `useValidators` | Validator list query |
| `useStaking` | Staking state and operations |
| `useStakeTransaction` | Stake/unstake TX builder |

### zkLogin & Passkey
| Hook | Description |
|------|-------------|
| `useZkLogin` | zkLogin flow (init, callback, sign) |
| `usePasskey` | WebAuthn credential management |

### EVM
| Hook | Description |
|------|-------------|
| `useChain` | Chain selection (11 chains) |
| `useEVMBalance` | EVM native + ERC-20 balance |
| `useEVMTransaction` | EVM transaction sending |

### Account Abstraction
| Hook | Description |
|------|-------------|
| `useSmartAccount` | Smart Account state, UserOp submission |
| `useGaslessTransaction` | Gasless TX via paymaster |
| `useSessionKey` | Session key create/revoke |

### WalletConnect
| Hook | Description |
|------|-------------|
| `useWalletConnect` | Session pair, approve, reject, request handling |

### Nasun Link
| Hook | Description |
|------|-------------|
| `useNasunLink` | Create (single/batch), claim, parseUrl, checkBalance |

### Payment
| Hook | Description |
|------|-------------|
| `usePayment` | Unified payment flow |
| `usePaymentIntent` | WalletConnect payment requests |
| `usePaymentLink` | Payment URL creation/parsing |
| `usePaymentQR` | QR code generation |

### Portfolio & Misc
| Hook | Description |
|------|-------------|
| `usePortfolio` | Portfolio value tracking |
| `useLedger` | Ledger connection and signing |
| `useZKID` | ZK-ID proof/verify |
| `useTokenFaucet` | Token faucet requests |

---

## Configuration (`config/`)

| File | Description |
|------|-------------|
| `chains.ts` | Chain registry (11 EVM + Move chains), AA bundler/paymaster URLs |
| `networks.ts` | Network definitions (devnet/testnet/mainnet), RPC URLs |
| `tokens.ts` | Token registry, faucet handler registration |

---

## Infrastructure

### Schemas (`schemas/`)
| File | Description |
|------|-------------|
| `rpc.ts` | Zod validation schemas for RPC responses |

### State Stores (`stores/`)
| File | Description |
|------|-------------|
| `zkLoginStore.ts` | zkLogin session/credential Zustand store |
| `zkidStore.ts` | ZK-ID state store |

### Type Definitions (`types/`)
| File | Description |
|------|-------------|
| `nft.ts` | NFT display, collection types |
| `passkey.ts` | WebAuthn credential types |
| `portfolio.ts` | Portfolio, price types |
| `staking.ts` | Validator, stake types |
| `zklogin.ts` | ZkLoginSession, Provider types |

### Tests (`__tests__/`)
18 test files: aa, addressBook, clear-signing, client, crypto, keystore, ledger, link, nft, payment, portfolio, rate-limit, sanity, staking, tokenTransaction, tokens, zkid
