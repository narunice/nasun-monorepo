# Nasun Wallet - Developer Guide

> Last Updated: 2026-02-18
> Package: `@nasun/wallet` & `@nasun/wallet-ui`
> Version: 0.7.x

---

## What is Nasun Wallet?

Nasun Wallet is a production-grade, universal Web3 wallet stack built for the Nasun Network (Sui fork) and EVM ecosystems. It provides a complete authentication, asset management, and smart account infrastructure as a modular library.

**Key capabilities:**
- **Hybrid Auth**: Traditional seed phrases, social login (zkLogin), biometrics (Passkey), and hardware (Ledger).
- **Multi-Chain Native**: Simultaneous support for Nasun/Sui (Move) and 11+ EVM chains (Ethereum, Base, Arbitrum, etc.).
- **Smart Account (NSA)**: Contract-based accounts with multi-signer support, social recovery, and 48-hour timelocks.
- **Account Abstraction (ERC-4337)**: Gasless transactions, paymasters, and session keys on EVM chains.
- **Universal UI**: A drop-in `@nasun/wallet-ui` component with 40+ view modes covering every aspect of Web3 UX.

---

## Quick Start

### Installation

```bash
pnpm add @nasun/wallet @nasun/wallet-ui
```

### Basic Setup

Wrap your application with `WalletProvider` and use the `WalletConnect` component for a complete UI.

```tsx
import { WalletProvider, WalletConnect } from '@nasun/wallet-ui';
import { configureWallet } from '@nasun/wallet';

// Optional: Global config (defaults to Nasun Devnet)
configureWallet({
  rpcUrl: 'https://rpc.devnet.nasun.io',
  faucetUrl: 'https://faucet.devnet.nasun.io',
});

function App() {
  return (
    <WalletProvider>
      <header>
        <nav>
          <WalletConnect 
            variant="filledOutlineC7" 
            dropdownAlign="right" 
          />
        </nav>
      </header>
      <main>
        {/* Your content */}
      </main>
    </WalletProvider>
  );
}
```

---

## Core Authentication Modes

### 1. Local Keypair (Self-Custody)
Standard password-encrypted wallet. Keys are stored in `localStorage` using AES-256-GCM.

```typescript
const { status, createWallet, unlockWallet, lockWallet } = useWallet();

// Status: 'disconnected' | 'locked' | 'unlocked'
if (status === 'locked') {
  await unlockWallet('user-password');
}
```

### 2. zkLogin (Social)
Zero-knowledge login via Google or Apple. No seed phrase required.

```typescript
const { handleSocialLogin, isZkLoggedIn, zkUserInfo } = useZkLogin();

// Start OAuth flow
const startLogin = () => handleSocialLogin('google');

if (isZkLoggedIn) {
  console.log('Logged in as:', zkUserInfo?.email);
}
```

### 3. Passkey (Biometric)
Next-gen authentication using Face ID or Touch ID (WebAuthn).

```typescript
const { passkeyCreateWallet, passkeyUnlock, isPasskeyUnlocked } = usePasskey();

// Create a new passkey-protected wallet
await passkeyCreateWallet('My FaceID Wallet');

// Unlock with biometrics
await passkeyUnlock();
```

### 4. Ledger (Hardware)
Connect via WebHID to sign transactions directly from a hardware device.

```typescript
const { ledgerConnect, ledgerAddress, isLedgerConnected } = useLedger();

await ledgerConnect(); // Triggers WebHID browser prompt
console.log('Ledger Address:', ledgerAddress);
```

---

## Multi-Chain Architecture

Nasun Wallet seamlessly switches between Move-based chains and EVM chains.

### Chain Management
```typescript
const { chain, setChain, isEVM, isMove } = useChain();

// Switch to Base Mainnet
setChain('8453'); 

if (isEVM) {
  // Use EVM hooks
  const { sendTransaction } = useEVMTransaction();
}
```

### Token Support
The wallet includes a built-in registry for native and custom tokens.

```typescript
import { registerToken, useMultiBalance } from '@nasun/wallet';

// Add a custom token to the UI
registerToken({
  symbol: 'NBTC',
  name: 'Nasun Bitcoin',
  decimals: 8,
  type: '0x3::coin::COIN<0x...::nbtc::NBTC>',
});

const { data: balances } = useMultiBalance();
```

---

## Nasun Smart Account (NSA)

NSA separates your identity from your keys, enabling **Social Recovery** and **Key Rotation**.

| Feature | Description |
|---------|-------------|
| **Multi-Signer** | Add up to 5 keys (Passkey + zkLogin + Ledger) to one account. |
| **Social Recovery** | Appoint "Guardians" to recover your account if you lose all keys. |
| **Timelock** | All recovery actions have a mandatory 48-hour delay for security. |
| **Backup** | AES-256-GCM encrypted file backup of your account state. |

### Usage
```typescript
const { nsaIsInitialized, createAccount, deposit, withdraw } = useNasunSmartAccount();

// Create NSA and link it to current signer
if (!nsaIsInitialized) {
  await createAccount('zklogin', 'google-oauth-key');
}
```

---

## Developer Utility Hooks

The `@nasun/wallet` package exports 40+ specialized hooks for deep integration:

| Hook | Purpose |
|------|---------|
| `useTransaction` | Sign and execute Move transactions. |
| `useEVMTransaction` | Sign and execute EVM transactions. |
| `useNFTs` | Fetch and display NFT collections. |
| `useStaking` | Manage staking positions and rewards. |
| `usePortfolio` | Track total asset value across all chains. |
| `useWalletConnect` | Manage dApp connections (v2). |
| `useNasunLink` | Generate claimable token links (e.g., for events). |
| `usePayment` | Unified QR and link-based payment flow. |
| `useAddressBook` | Manage trusted contacts. |
| `useClearSigning` | Human-readable transaction decoding & risk assessment. |

---

## Security Model

### 1. Encryption & Storage
- **Local Keys**: AES-256-GCM with PBKDF2 (100,000 iterations).
- **NSA Backups**: PBKDF2 (600,000 iterations).
- **Memory Safety**: Private keys are held in memory as `Uint8Array` and zeroed immediately after use.

### 2. Brute-Force Protection (Rate Limiting)
Cumulative lockouts on failed unlock attempts:
- **8 attempts**: 30s lockout.
- **12 attempts**: 5m lockout.
- **16+ attempts**: 30m lockout.

### 3. Clear Signing
The wallet decodes Move calls and EVM data into plain English *before* the user signs, highlighting:
- **Balance Changes**: What is leaving and entering your wallet.
- **Risk Assessment**: Flags suspicious contracts or unverified tokens.
- **Permissions**: Clear display of "Approval" vs "Transfer" requests.

---

## UI Customization (`@nasun/wallet-ui`)

The `WalletConnect` component is highly configurable:

```tsx
<WalletConnect
  dropdownPosition="bottom" // 'top' | 'bottom'
  dropdownAlign="right"     // 'left' | 'right' | 'center'
  variant="default"          // 'default' | 'filledOutlineC7'
  size="default"             // 'default' | 'sm'
/>
```

### View Modes
You can programmatically change the UI state using `setViewMode`:
- `main`: Account overview.
- `send`: Transfer UI.
- `receive`: QR code and address.
- `nfts`: NFT gallery.
- `staking`: Staking dashboard.
- `settings`: Security and network settings.

---

## Network Configuration

| Network | Chain ID | RPC Endpoint |
|---------|----------|--------------|
| Nasun Devnet | `272218f1` | `https://rpc.devnet.nasun.io` |
| Faucet | - | `https://faucet.devnet.nasun.io` |
| Explorer | - | `https://explorer.nasun.io/devnet` |

---

## Related Resources

- [Implementation Roadmap](./P1-IMPLEMENTATION-STATUS.md)
- [UI Styling Guide](../../network-explorer/docs/UI_STYLING_GUIDE.md)
- [ZK-ID Specification](../../docs/ZKID_SPEC.md)
