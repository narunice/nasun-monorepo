# @nasun/wallet

> Last Updated: 2026-02-15

Nasun Wallet Core Package — A production-grade, multi-chain wallet library for the Nasun Network. Provides 23 core modules, 39 React hooks, and 8 signer adapters spanning Move and EVM chains.

## Architecture

```
src/
├── config/                    Chain, network, token registries
├── core/
│   ├── aa/                    ERC-4337 Account Abstraction + Session Keys
│   ├── clear-signing/         Transaction decoding & risk assessment
│   ├── evm/                   EVM client, HD wallet, ERC-20
│   ├── ledger/                Ledger hardware wallet (Sui + EVM)
│   ├── link/                  Nasun Link (token distribution URLs)
│   ├── nsa/                   Nasun Smart Account (multi-signer, recovery)
│   ├── payment/               Payment intent, QR, validation
│   ├── portfolio/             Price provider, portfolio aggregation
│   ├── signer/                Signer abstraction (8 adapters)
│   ├── walletconnect/         WalletConnect v2 SignClient
│   ├── zkid/                  Zero-knowledge identity (age, KYC, sybil)
│   ├── crypto.ts              BIP39 mnemonic, AES-256-GCM, secure memory
│   ├── keystore.ts            Encrypted key storage (PBKDF2 100K)
│   ├── passkey.ts             WebAuthn/Passkey (biometric auth + password fallback)
│   ├── rate-limit.ts          Brute-force progressive lockout
│   └── zklogin.ts             OAuth + ZK proof authentication
├── hooks/                     39 React hooks
├── schemas/                   Zod RPC validation
├── stores/                    Zustand state stores (wallet, zkLogin, passkey, nsa, zkid)
├── sui/                       Sui-specific utilities (faucet, NFT, staking)
├── types/                     Shared type definitions
└── index.ts                   Package exports
```

## Feature Summary

| Category | Features |
|----------|----------|
| **Core Wallet** | Create, lock/unlock, delete, BIP39 mnemonic backup, import/export private key (Bech32), session persistence, auto-lock |
| **Security** | AES-256-GCM encryption, PBKDF2 100K iterations, secure memory zeroing, progressive brute-force lockout (8/12/16+ attempts) |
| **Authentication** | Embedded wallet (password), zkLogin (Google/Apple/Twitch/Facebook/Kakao OAuth), Passkey (WebAuthn biometric + password fallback for non-PRF browsers) |
| **Signer Abstraction** | 8 adapters: Local, ZkLogin, EVM, SmartAccount, SessionKey, Ledger, NSA, Passkey |
| **Multi-chain** | Move (Nasun) + EVM (Ethereum, Sepolia, Arbitrum, Polygon) with chain switching |
| **Multi-token** | NSN/NBTC/NUSDC token registry, balance queries, transfers, per-token faucets |
| **NFT** | Gallery with sorting/pagination, detail view, transfer, IPFS support, Display standard |
| **Staking** | Validator list (APY, commission), delegation, unstaking, reward tracking |
| **EVM** | ERC-20 balance/transfer, gas estimation, BIP-44 HD key derivation |
| **Account Abstraction** | ERC-4337, Bundler/Paymaster, gasless transactions, session keys with scoped permissions |
| **WalletConnect v2** | dApp pairing, multi-chain sessions, EVM + Sui request handling |
| **Nasun Smart Account** | Multi-signer (max 5, weighted), guardian social recovery, 48h timelock, encrypted backup |
| **Nasun Link** | URL-based token distribution, QR codes, batch creation, encrypted payloads, claim validation |
| **Clear Signing** | Transaction decoding (Move + EVM), human-readable summaries, risk assessment, balance preview |
| **ZK-ID** | Age verification, KYC proofs, sybil-resistant nullifiers, credential storage |
| **Payment** | Intent-based flow, QR generation, multi-chain, WalletConnect compatible |
| **Portfolio** | Total value calculation, 24h change tracking, multi-chain aggregation |
| **Address Book** | Trusted address management, labels, new-address warnings |
| **Ledger** | WebHID transport, Sui/EVM derivation paths, transaction signing (implemented, UI hidden) |
| **TX History** | Past transaction queries, cursor-based pagination |

## Quick Start

```tsx
import { useWallet, useBalance, configureWallet } from '@nasun/wallet';

configureWallet({
  rpcUrl: 'https://rpc.devnet.nasun.io',
  faucetUrl: 'https://faucet.devnet.nasun.io',
});

function WalletComponent() {
  const { status, account, createWallet, unlockWallet, lockWallet } = useWallet();
  const { data: balance } = useBalance();

  if (status === 'disconnected') {
    return <button onClick={() => createWallet('mypassword')}>Create Wallet</button>;
  }
  if (status === 'locked') {
    return <button onClick={() => unlockWallet('mypassword')}>Unlock</button>;
  }
  return (
    <div>
      <p>Address: {account?.address}</p>
      <p>Balance: {balance?.formatted} NASUN</p>
      <button onClick={lockWallet}>Lock</button>
    </div>
  );
}
```

## Hooks Reference (39 hooks)

### Wallet Core
| Hook | Description |
|------|-------------|
| `useWallet()` | Main wallet state and actions (Zustand) |
| `useWalletStatus()` | Status selector ('disconnected' \| 'locked' \| 'unlocked') |
| `useWalletAccount()` | Account info (address, publicKey) |
| `useWalletLoading()` | Loading/error state |
| `useSecuritySettings()` | Security configuration |
| `useBalance()` | Native token balance (TanStack Query, 30s poll) |
| `useMultiBalance()` | All registered token balances (10s poll) |
| `useTokenBalance(symbol)` | Specific token balance |
| `useNativeBalance()` | Native token balance (alias) |
| `useTransaction()` | Native token transfer |
| `useTokenTransaction()` | Any registered token transfer |
| `useTransactionHistory()` | TX history with cursor pagination |
| `useNetwork()` | Network configuration |
| `useAddressBook()` | Address book CRUD |
| `useAddressStatus(addr)` | Check if address is known/trusted |
| `useWalletLabel()` | Wallet alias management |

### Signer & Authentication
| Hook | Description |
|------|-------------|
| `useSigner()` | Active signer selection (priority: NSA > Local > Passkey > ZkLogin) |
| `useSignerAddress()` | Chain-aware address from active signer |
| `useZkLogin()` | zkLogin flow (init, callback, sign, session check) |
| `usePasskey()` | WebAuthn register/authenticate, password for non-PRF wallets |
| `useChain()` | Chain selection (Move + 11 EVM chains) |

### NFT & Staking
| Hook | Description |
|------|-------------|
| `useNFTs()` | NFT gallery query with sorting/pagination |
| `useNFTTransfer()` | NFT transfer operations |
| `useValidators()` | Validator list with APY/commission |
| `useStaking()` | User's staking positions and rewards |
| `useStakeTransaction()` | Stake/unstake TX builder |

### EVM & Account Abstraction
| Hook | Description |
|------|-------------|
| `useEVMBalance()` | EVM native balance |
| `useERC20Balances()` | ERC-20 token balances |
| `useEVMTransaction()` | EVM transaction sending |
| `useEVMGasEstimate()` | EVM gas estimation |
| `useSmartAccount()` | ERC-4337 Smart Account state |
| `useGaslessTransaction()` | Gasless TX via paymaster |
| `useSessionKey()` | Session key create/revoke |

### Advanced Features
| Hook | Description |
|------|-------------|
| `useWalletConnect()` | WalletConnect v2 session management |
| `useNasunSmartAccount()` | NSA creation, deposit, withdraw, signer/guardian management |
| `useNsaRecovery()` | Guardian recovery flow (initiate, approve, execute) |
| `useNsaBackup()` | Encrypted backup create/restore |
| `useNasunLink()` | Token distribution link creation/claiming |
| `usePayment()` | Unified payment flow |
| `usePaymentIntent()` | WalletConnect payment requests |
| `usePaymentLink()` | Payment URL creation/parsing |
| `usePaymentQR()` | QR code generation |
| `usePortfolio()` | Portfolio value tracking |
| `useLedger()` | Ledger connection and signing |
| `useZKID()` | ZK-ID proof generation/verification |
| `useTokenFaucet()` | Token faucet requests |

## Signer Adapters (8)

The `SignerManager` provides a unified signing interface across all authentication methods with automatic priority-based selection: **NSA > Local > Passkey > ZkLogin**.

| Adapter | Auth Method | Transaction Signing |
|---------|-------------|---------------------|
| `LocalSigner` | Password-encrypted keypair | Ed25519 |
| `ZkLoginSigner` | OAuth + ZK proof | Ephemeral Ed25519 |
| `PasskeySigner` | WebAuthn biometric + optional password | Ed25519 (from encrypted mnemonic) |
| `EVMSigner` | HD-derived EVM key | ECDSA (secp256k1) |
| `SmartAccountSigner` | ERC-4337 UserOp | Bundler relay |
| `SessionKeySigner` | Scoped session key | Ed25519 (limited permissions) |
| `LedgerSigner` | Hardware device (WebHID) | Device-side Ed25519/ECDSA |
| `NsaSigner` | Multi-signer smart account | Threshold Ed25519 |

## Security Model

### Encryption
- **AES-256-GCM** (AEAD) with random 12-byte IV and 16-byte salt per operation
- **PBKDF2** key derivation with SHA-256, 100,000 iterations
- **Secure memory clearing** — `secureZero()` overwrites buffer with random then zeros

### Brute Force Protection
| Failed Attempts | Lockout Duration |
|-----------------|------------------|
| 8               | 30 seconds       |
| 12              | 5 minutes        |
| 16+             | 30 minutes       |

Counter persists in localStorage (survives page refresh). Resets on successful unlock.

### Auto-Lock
Configurable inactivity timeout (5min / 15min / 30min / 1hr / disabled). Checked every 30 seconds.

### Passkey Key Derivation

Passkey wallets encrypt the private key using one of three key derivation methods, depending on browser capabilities:

| Method | Browser Support | Key Material | Security Level |
|--------|----------------|--------------|----------------|
| `prf` | Chrome 120+, Safari 18+ | Hardware-derived 32-byte secret (WebAuthn PRF extension) | Highest — secret never leaves authenticator |
| `credential-id-password` | All WebAuthn browsers | `PBKDF2(credentialId + password, salt, 100K)` | High — requires user password not stored anywhere |
| `credential-id` | Legacy (deprecated) | `PBKDF2(credentialId, salt, 100K)` | Low — credential ID is public, kept for backward compat |

New wallets created on non-PRF browsers automatically use `credential-id-password`. The `needsPassword` flag from `usePasskey()` indicates whether the wallet requires a password to unlock.

### Authentication Comparison

| Feature | Mnemonic Wallet | zkLogin | Passkey |
|---------|-----------------|---------|---------|
| Key storage | Encrypted locally | Ephemeral + ZK proof | Encrypted locally (WebAuthn-protected) |
| Key derivation | PBKDF2(password) | N/A (ephemeral) | PRF hardware secret or PBKDF2(credentialId + password) |
| Export private key | Yes | No | Yes (biometric re-auth) |
| Biometric | No | No | Yes (Face ID, Touch ID, Windows Hello) |
| Social login | No | Yes (5 OAuth providers) | No |
| Lock/Unlock | Password | Session-based | Biometric (+ password on non-PRF browsers) |
| Mnemonic backup | At creation | N/A | At creation |
| Session persistence | localStorage | sessionStorage (tab-scoped) | localStorage (passkeyStore) |

### Zustand Stores (5)

| Store | Persistence | Purpose |
|-------|-------------|---------|
| Wallet store | localStorage | Core wallet state (status, account, keystore) |
| `useZkLoginStore` | sessionStorage | zkLogin session (ephemeral key, JWT, proof) |
| `usePasskeyStore` | In-memory | Passkey wallet metadata, unlocked keypair, address |
| `useNsaStore` | localStorage | NSA account state (signers, guardians, proposals) |
| `useZKIDStore` | In-memory | ZK-ID proofs and verification state |

## Network Configuration

Default: Nasun Devnet

| Property | Value |
|----------|-------|
| RPC Endpoint | `https://rpc.devnet.nasun.io` |
| Faucet | `https://faucet.devnet.nasun.io` |
| Explorer | `https://explorer.nasun.io/devnet` |
| Chain ID | `272218f1` |
| Native Token | NASUN (decimals: 9) |

## Storage Keys

| Key | Storage | Description |
|-----|---------|-------------|
| `nasun_wallet_keystore` | localStorage | Encrypted private key (AES-256-GCM) |
| `nasun_wallet_unlock_attempts` | localStorage | Rate limiting state |
| `nasun_address_book` | localStorage | Saved addresses |
| `nasun_security_settings` | localStorage | Security configuration |
| `nasun-wallet-chain` | localStorage | Selected chain (Zustand persist) |
| `nasun-wallet-nsa` | localStorage | NSA account state (Zustand persist) |
| `nasun:passkey:wallet` | localStorage | Passkey wallet metadata (encrypted key, credentials, derivation method) |
| zkLogin session | sessionStorage | Ephemeral keypair + nonce (clears on tab close) |
| zkLogin state | sessionStorage | Authenticated state (jwt, salt, proof) |
| OAuth CSRF state | sessionStorage | CSRF protection token |

## Related Packages

- **@nasun/wallet-ui** — React UI components (60+ components, 175+ exports)
  - WalletConnect dropdown, BalanceDisplay, SendTransaction, NFTGallery
  - WalletConnect v2 UI: WalletConnectPanel, WCPairingView, WCSessionProposal, WCRequestApproval, WCSessionDetail
  - MnemonicBackup, ImportWallet, ExportPrivateKey, StakingPanel
  - SocialLoginButtons, PasskeySetupView (with password fields), LedgerConnect
  - Clear Signing TransactionPreview, NasunLinkWizard, PortfolioPanel
  - NetworkSelector, AddressBookPanel, SecuritySettings
- **@nasun/tailwind-config** — Nasun brand colors for Tailwind CSS
- **@nasun/devnet-config** — Contract addresses (auto-imported for token types)

## Documentation

| Document | Description |
|----------|-------------|
| [WALLET-GUIDE.md](docs/WALLET-GUIDE.md) | Developer integration guide with code examples |
| [P1-IMPLEMENTATION-STATUS.md](docs/P1-IMPLEMENTATION-STATUS.md) | Detailed module map and architecture reference |
| [WALLET_UI_IMPROVEMENT_PLAN.md](docs/WALLET_UI_IMPROVEMENT_PLAN.md) | UX improvement roadmap |

## License

Private - Nasun Project
