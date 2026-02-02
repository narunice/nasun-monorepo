# Nasun Wallet - Developer Guide

> Last Updated: 2026-02-02
> Package: `@nasun/wallet`
> Version: 0.1.0

---

## What is Nasun Wallet?

Nasun Wallet is a universal Web3 wallet library built for the Nasun Network (Sui fork). It provides a complete authentication and asset management stack as a React hooks library, designed to be embedded into any frontend application.

**Key differentiators:**
- **Multi-path authentication**: Local keypair, zkLogin (Google/Apple), Passkey (Face ID/fingerprint), Ledger
- **Smart Account (NSA)**: Separates account identity from keys, enabling key rotation without asset migration
- **Trinity Recovery**: Three-tier recovery system that eliminates single points of failure
- **Multi-chain ready**: Sui/Move native + EVM (11 chains) with Account Abstraction
- **Full-featured**: Staking, NFTs, payment links, WalletConnect, token faucets

---

## Quick Start

### Installation

```bash
pnpm add @nasun/wallet
```

### Basic Setup

```typescript
import { configureWallet, useWallet, useBalance } from '@nasun/wallet';

// Configure once at app startup
configureWallet({
  rpcUrl: 'https://rpc.devnet.nasun.io',
  faucetUrl: 'https://faucet.devnet.nasun.io',
});

function App() {
  const { status, account, createWallet, unlockWallet } = useWallet();
  const { data: balance } = useBalance();

  if (status === 'empty') {
    return <button onClick={() => createWallet('password123')}>Create Wallet</button>;
  }

  if (status === 'locked') {
    return <button onClick={() => unlockWallet('password123')}>Unlock</button>;
  }

  return (
    <div>
      <p>Address: {account?.address}</p>
      <p>Balance: {balance?.formatted} NASUN</p>
    </div>
  );
}
```

---

## Authentication Methods

### 1. Local Keypair (Ed25519)

Traditional wallet creation with mnemonic backup.

```typescript
import { useWallet } from '@nasun/wallet';

const { createWallet, unlockWallet, lockWallet, exportMnemonic } = useWallet();

// Create (generates Ed25519 keypair, encrypts with password)
await createWallet('user-password');

// Backup mnemonic
const mnemonic = exportMnemonic('user-password');
```

### 2. zkLogin (OAuth)

Login with Google, Apple, or Twitch. No seed phrase required.

```typescript
import { useZkLogin, initZkLogin } from '@nasun/wallet';

// Configure zkLogin (once)
initZkLogin({
  saltApiUrl: 'https://your-api.com/salt',
  proverUrl: 'https://prover.example.com',
  providers: {
    google: {
      provider: 'google',
      clientId: 'YOUR_GOOGLE_CLIENT_ID',
      redirectUri: 'https://your-app.com/callback',
    },
  },
});

function LoginButton() {
  const { startLogin, handleCallback, isConnected, state } = useZkLogin();

  const handleGoogleLogin = () => {
    startLogin('google'); // Redirects to Google OAuth
  };

  if (isConnected) {
    return <p>Logged in as: {state?.email}</p>;
  }

  return <button onClick={handleGoogleLogin}>Login with Google</button>;
}
```

### 3. Passkey (WebAuthn)

Biometric authentication via Face ID, fingerprint, or security key.

```typescript
import { usePasskey } from '@nasun/wallet';

const { createCredential, authenticate } = usePasskey();

// Register passkey
const credential = await createCredential({
  rpName: 'Nasun Wallet',
  userName: 'user@example.com',
});

// Authenticate
const assertion = await authenticate(credential.id);
```

### 4. Ledger (Hardware Wallet)

Sign transactions with Ledger Nano via USB or Bluetooth.

```typescript
import { useLedger } from '@nasun/wallet';

const { connect, getAddress, signTransaction } = useLedger();

await connect('usb');
const address = await getAddress(0); // BIP-44 path index
```

---

## Nasun Smart Account (NSA)

NSA provides enterprise-grade account security by separating the asset-holding account from the signing keys.

### Why NSA?

| Without NSA | With NSA |
|-------------|----------|
| Lose Google account = lose assets | Lose Google? Use Passkey instead |
| Lose phone = lose assets | Lose all devices? Restore from backup |
| No recovery path | Guardian social recovery as last resort |
| Single address = single point of failure | SmartAccount = permanent vault |

### Create a Smart Account

```typescript
import { useNasunSmartAccount, useSigner } from '@nasun/wallet';

const { signer } = useSigner();
const { createAccount, isInitialized } = useNasunSmartAccount();

// Create SmartAccount (registers current signer as first key)
if (!isInitialized && signer) {
  const objectId = await createAccount('zklogin', 'google-key', signer);
  console.log('SmartAccount created:', objectId);
}
```

### Deposit & Withdraw

```typescript
const { deposit, withdraw } = useNasunSmartAccount();

// Deposit tokens into SmartAccount
await deposit('0x2::sui::SUI', coinObjectId, signer);

// Withdraw from SmartAccount
await withdraw('0x2::sui::SUI', 1_000_000_000n, recipientAddress, signer);
```

### Add a Second Signer (Multipath)

```typescript
const { addSigner } = useNasunSmartAccount();

// Register passkey as second signer (Tier 1 recovery)
await addSigner(
  passkeyDerivedAddress,
  'passkey',
  1,          // weight
  'face-id',  // label
  signer,
);
```

### Set Up Guardians

```typescript
const { setGuardians } = useNasunSmartAccount();

// Configure 3 guardians with 2-of-3 threshold
await setGuardians(
  [friend1Address, friend2Address, friend3Address],
  2,                    // threshold (minimum 2 must approve)
  recoveryOwnerAddress, // pre-approved recovery target
  signer,
);
```

### Create Encrypted Backup (Tier 2)

```typescript
import { useNsaBackup } from '@nasun/wallet';

const { createNsaBackup, downloadBackup, restoreNsaBackup } = useNsaBackup();

// Create and download
const backup = await createNsaBackup(privateKeyBase64, signerAddress, userPin);
downloadBackup(backup); // Browser file download

// Restore (from uploaded file)
const { signerPrivateKey, accountObjectId } = await restoreNsaBackup(uploadedBackup, userPin);
```

### Guardian Recovery (Tier 3)

```typescript
import { useNsaRecovery } from '@nasun/wallet';

const {
  status,
  timelockDisplay,
  approvalsNeeded,
  initiateRecovery,
  approveRecovery,
  executeRecovery,
  cancelRecovery,
  canExecute,
} = useNsaRecovery();

// Guardian initiates recovery
await initiateRecovery(recoveryOwnerAddress, guardianSigner);

// Another guardian approves
await approveRecovery(anotherGuardianSigner);

// After 48 hours + enough approvals
if (canExecute) {
  await executeRecovery(anyoneSigner);
}

// Owner can cancel during timelock
await cancelRecovery(ownerSigner);
```

---

## Multi-Chain Support

### Chain Selection

```typescript
import { useChain, CHAINS } from '@nasun/wallet';

const { chain, setChain, isEVM, isMove, availableChains } = useChain();

// Switch to Ethereum
setChain(CHAINS.ethereum.chainId);

// Check chain type
if (isEVM) {
  // EVM-specific UI
} else if (isMove) {
  // Sui/Move-specific UI
}
```

### EVM Transactions

```typescript
import { useEVMBalance, useEVMTransaction } from '@nasun/wallet';

const { data: balance } = useEVMBalance();
const { sendTransaction, isLoading } = useEVMTransaction();

await sendTransaction({
  to: '0x123...',
  value: '1000000000000000000', // 1 ETH in wei
});
```

### Account Abstraction (ERC-4337)

```typescript
import { useSmartAccount, useGaslessTransaction } from '@nasun/wallet';

const { state, sendTransaction } = useSmartAccount('PIMLICO_API_KEY');
const { sendGasless } = useGaslessTransaction();

// Gasless transaction (sponsored by paymaster)
await sendGasless({
  to: '0x123...',
  data: '0x...',
});
```

---

## Payments & Links

### Nasun Link (Token Distribution)

```typescript
import { useNasunLink } from '@nasun/wallet';

const { createLink, claim, parseUrl } = useNasunLink();

// Create a claimable link
const { url } = await createLink({
  type: 'single',
  coinType: '0x2::sui::SUI',
  amount: 1_000_000_000n,
});
// Share: url.fullUrl

// Claim
const { linkId, secret } = parseUrl(receivedUrl);
await claim(linkData, secret);
```

### Payment QR Codes

```typescript
import { usePaymentQR, usePaymentLink } from '@nasun/wallet';

const { generateQR } = usePaymentQR();
const { createPaymentLink } = usePaymentLink();

const link = createPaymentLink({
  recipient: '0x...',
  amount: 1_000_000_000n,
  coinType: '0x2::sui::SUI',
});

const qrDataUrl = await generateQR(link);
```

---

## NFTs & Staking

### NFTs

```typescript
import { useNFTs, useNFTTransfer } from '@nasun/wallet';

const { data: nfts } = useNFTs();
const { transferNFT } = useNFTTransfer();

await transferNFT(nftObjectId, recipientAddress);
```

### Staking

```typescript
import { useValidators, useStakeTransaction } from '@nasun/wallet';

const { data: validators } = useValidators();
const { stake, unstake } = useStakeTransaction();

// Stake 10 NASUN
await stake(validatorAddress, 10_000_000_000n);
```

---

## WalletConnect v2

```typescript
import { useWalletConnect } from '@nasun/wallet';

const { init, pair, approveSession, state } = useWalletConnect();

// Initialize
await init({
  projectId: 'YOUR_WALLETCONNECT_PROJECT_ID',
  metadata: {
    name: 'Nasun Wallet',
    description: 'Universal Web3 Wallet',
    url: 'https://nasun.io',
    icons: ['https://nasun.io/icon.png'],
  },
});

// Pair with dApp QR code
await pair(wcUri);

// Approve session proposal
await approveSession(proposal.id);
```

### WalletConnect UI Components (`@nasun/wallet-ui`)

The `@nasun/wallet-ui` package provides ready-to-use UI components for the full WalletConnect flow:

```typescript
import { WCViewRouter, WalletConnectPanel } from '@nasun/wallet-ui';

// WCViewRouter routes wc-* ViewModes automatically.
// Access via MoreMenu → "WalletConnect" in the wallet dropdown.
```

| Component | Purpose |
|-----------|---------|
| `WalletConnectPanel` | Session list, init, pending notifications |
| `WCPairingView` | QR code + URI paste for dApp pairing |
| `WCSessionProposal` | Approve/reject session with namespace display |
| `WCRequestApproval` | Approve/reject sign/TX requests |
| `WCSessionDetail` | Session info + disconnect |

---

## Security Model

### Encryption
- **Key storage**: AES-256-GCM + PBKDF2 (100K iterations)
- **NSA backup**: PBKDF2 (600K iterations) + AES-256-GCM
- **Memory safety**: Private keys zeroed after use (`secureZero`)

### Brute-Force Protection
| Failed Attempts | Lockout Duration |
|----------------|-----------------|
| 8 | 30 seconds |
| 12 | 5 minutes |
| 16+ | 30 minutes |

### zkLogin Security
- Ephemeral keypair per session (not persisted)
- Salt managed by backend Lambda (deterministic, server-side)
- ZK proof generated client-side via Mysten Labs prover
- JWT expiration enforced (session-scoped)

### NSA Security
- 48-hour timelock on guardian recovery (hardcoded, no admin override)
- Sovereign recovery: target address pre-set by owner
- Guardian/signer overlap prevention (contract-enforced)
- Maximum 5 signers, 5 guardians (contract-enforced)

---

## Network Configuration

| Parameter | Value |
|-----------|-------|
| Network | Nasun Devnet |
| RPC | `https://rpc.devnet.nasun.io` |
| Faucet | `https://faucet.devnet.nasun.io` |
| Explorer | `https://explorer.nasun.io/devnet` |
| Chain ID | `12bf3808` |
| Native Token | NASUN (unit: SOE) |

### Supported EVM Chains

Ethereum, Base, Arbitrum, Optimism, Polygon, Avalanche, BSC, Fantom, Gnosis, Celo, zkSync Era

---

## API Reference

### Configuration

| Function | Description |
|----------|-------------|
| `configureWallet(config)` | Set RPC URL, faucet URL, network |
| `initZkLogin(config)` | Configure zkLogin providers and API endpoints |

### Core Hooks

| Hook | Primary Use |
|------|-------------|
| `useWallet()` | Wallet lifecycle (create, unlock, lock) |
| `useWalletStatus()` | Status selector ('disconnected' \| 'locked' \| 'unlocked') |
| `useWalletAccount()` | Account info (address, publicKey) |
| `useSigner()` | Active signer management |
| `useBalance()` | Native token balance |
| `useMultiBalance()` | All registered token balances |
| `useTokenBalance(symbol)` | Specific token balance |
| `useTransaction()` | Transaction signing + submission |
| `useTokenTransaction()` | Any registered token transfer |
| `useTransactionHistory()` | TX history with cursor pagination |
| `useNetwork()` | Network configuration |
| `useAddressBook()` | Address book CRUD |
| `useAddressStatus(addr)` | Check if address is known/trusted |
| `useZkLogin()` | OAuth + ZK proof authentication |
| `usePasskey()` | WebAuthn credential management |
| `useChain()` | Chain selection (Move + EVM) |
| `useNFTs()` | NFT gallery query |
| `useNFTTransfer()` | NFT transfer operations |
| `useValidators()` | Validator list with APY/commission |
| `useStaking()` | Staking positions and rewards |
| `useStakeTransaction()` | Stake/unstake TX builder |
| `useEVMBalance()` | EVM native + ERC-20 balance |
| `useEVMTransaction()` | EVM transaction sending |
| `useSmartAccount()` | ERC-4337 Smart Account state |
| `useGaslessTransaction()` | Gasless TX via paymaster |
| `useSessionKey()` | Session key create/revoke |
| `useWalletConnect()` | dApp connection |
| `useNasunSmartAccount()` | NSA account operations |
| `useNsaRecovery()` | Guardian recovery flow |
| `useNsaBackup()` | Encrypted backup management |
| `useNasunLink()` | Token distribution links |
| `usePayment()` | Unified payment flow |
| `usePaymentIntent()` | WalletConnect payment requests |
| `usePaymentLink()` | Payment URL creation/parsing |
| `usePaymentQR()` | QR code generation |
| `usePortfolio()` | Portfolio value tracking |
| `useLedger()` | Ledger connection and signing |
| `useZKID()` | ZK-ID proof/verify |
| `useTokenFaucet()` | Token faucet requests |
| `useSecuritySettings()` | Security configuration |

### Signer Types

| Type | Class | Chain | Description |
|------|-------|-------|-------------|
| `local` | `LocalSigner` | Move | Ed25519 keypair |
| `zklogin` | `ZkLoginSigner` | Move | OAuth + ZK proof |
| `nsa` | `NsaSigner` | Move | SmartAccount wrapper |
| `evm` | `EVMSigner` | EVM | secp256k1 |
| `ledger` | `LedgerSigner` | Both | Hardware wallet |
| `smart-account` | `SmartAccountSigner` | EVM | ERC-4337 |
| `session-key` | `SessionKeySigner` | EVM | Delegated signing |
| `mpc` | - | - | Reserved |

---

## File Structure

```
packages/wallet/
├── src/
│   ├── config/                    Chain, network, token registries
│   ├── core/
│   │   ├── aa/                    ERC-4337 Account Abstraction + Session Keys
│   │   ├── clear-signing/         Transaction decoding & risk assessment
│   │   ├── evm/                   EVM client, HD wallet, ERC-20
│   │   ├── ledger/                Ledger hardware wallet (Sui + EVM)
│   │   ├── link/                  Nasun Link (token distribution URLs)
│   │   ├── nsa/                   Nasun Smart Account (multi-signer, recovery)
│   │   ├── payment/               Payment intent, QR, validation
│   │   ├── portfolio/             Price provider, portfolio aggregation
│   │   ├── signer/                Signer abstraction (7 adapters)
│   │   ├── walletconnect/         WalletConnect v2 SignClient
│   │   ├── zkid/                  Zero-knowledge identity (age, KYC, sybil)
│   │   ├── crypto.ts              BIP39 mnemonic, AES-256-GCM, secure memory
│   │   ├── keystore.ts            Encrypted key storage (PBKDF2 100K)
│   │   ├── passkey.ts             WebAuthn/Passkey (biometric auth)
│   │   ├── rate-limit.ts          Brute-force progressive lockout
│   │   └── zklogin.ts             OAuth + ZK proof authentication
│   ├── hooks/                     36 React hooks
│   ├── schemas/                   Zod RPC validation
│   ├── stores/                    Zustand state stores
│   ├── sui/                       Sui-specific utilities (faucet, NFT, staking)
│   ├── types/                     Shared type definitions
│   └── index.ts                   Package exports
├── docs/                          This documentation
└── __tests__/                     18 test files
```

---

## Related Documents

- [README](../README.md) - Package overview, feature summary, hooks reference
- [Implementation Status](./P1-IMPLEMENTATION-STATUS.md) - Full module map and file reference
- [UI Improvement Plan](./WALLET_UI_IMPROVEMENT_PLAN.md) - UX improvement roadmap
