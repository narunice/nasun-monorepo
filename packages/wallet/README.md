# @nasun/wallet

Nasun Wallet Core Package - A secure, feature-rich wallet library for the Nasun blockchain.

## Features

### Core Wallet
- **Wallet Creation** - Generate new wallets with BIP39 mnemonic backup
- **Wallet Import** - Restore from mnemonic phrase or private key (Bech32 format)
- **Wallet Lock/Unlock** - Password-protected wallet access
- **Session Persistence** - Optional auto-unlock on page refresh

### Multi-Token Support
- **Native Token (NASUN)** - Built-in support for the native token
- **Custom Tokens** - Register and manage NBTC, NUSDC, and other tokens
- **Token Registry** - Centralized token configuration management

### Transactions
- **Token Transfers** - Send any registered token
- **Transaction Simulation** - Preview gas costs and balance changes before signing
- **Explorer Links** - Direct links to transaction details

### NFT Management
- **NFT Gallery** - Fetch and display owned NFTs
- **NFT Transfer** - Send NFTs to other addresses
- **Display Standard** - Support for Sui Display standard with fallback

### Staking
- **Validator List** - View all validators with APY
- **Stake/Unstake** - Delegate NASUN to validators
- **Staking Positions** - Track active stakes and rewards

### Address Book
- **Contact Management** - Save frequently used addresses
- **Transaction History** - Track transactions per recipient
- **First-time Warnings** - Alert when sending to new addresses

## Security

### Encryption
- **AES-256-GCM** - Industry-standard symmetric encryption
- **PBKDF2** - 100,000 iterations for key derivation
- **Secure Memory** - Private keys cleared from memory after use (`secureZero`, `secureZeroString`)

### Rate Limiting (Brute Force Protection)
Progressive lockout policy for failed password attempts:

| Failed Attempts | Lockout Duration |
|-----------------|------------------|
| 8               | 30 seconds       |
| 12              | 5 minutes        |
| 16+             | 30 minutes       |

- Counter resets only on successful unlock
- State persists in localStorage (survives page refresh)

### Auto-Lock
- Configurable timeout (5min / 15min / 30min / 1hr / disabled)
- Automatic wallet lock on inactivity

### Session Persistence Security
When `sessionPersist` is enabled (disabled by default), the wallet can auto-unlock on page refresh:
- **30-minute expiry** - Session automatically expires after 30 minutes
- **Domain binding** - Session cannot be used on other domains
- **XOR obfuscation** - Minimal protection against casual inspection
- **sessionStorage** - Clears automatically when browser tab closes

⚠️ **Note**: Session persistence is a convenience feature with security trade-offs. For maximum security, keep `sessionPersist` disabled.

### Large Transaction Confirmation
- Optional confirmation for large transfers
- Configurable threshold amount

## Installation

```bash
pnpm add @nasun/wallet
```

## Quick Start

```tsx
import { useWallet, useBalance, configureWallet } from '@nasun/wallet';

// Configure wallet (optional, defaults to Nasun Devnet)
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

## API Reference

### Hooks

#### Wallet Management
| Hook | Description |
|------|-------------|
| `useWallet()` | Main wallet state and actions |
| `useWalletStatus()` | Wallet status only ('disconnected' \| 'locked' \| 'unlocked') |
| `useWalletAccount()` | Account info (address, publicKey) |
| `useWalletLoading()` | Loading state |
| `useSecuritySettings()` | Security settings management |

#### Balance
| Hook | Description |
|------|-------------|
| `useBalance()` | Native token balance |
| `useMultiBalance()` | All registered token balances |
| `useTokenBalance(symbol)` | Specific token balance |
| `useNativeBalance()` | Native token balance (alias) |

#### Transactions
| Hook | Description |
|------|-------------|
| `useTransaction()` | Native token transfer |
| `useTokenTransaction()` | Any token transfer |

#### NFTs
| Hook | Description |
|------|-------------|
| `useNFTs()` | Fetch owned NFTs |
| `useNFTTransfer()` | NFT transfer actions |

#### Staking
| Hook | Description |
|------|-------------|
| `useValidators()` | Validator list with APY |
| `useStaking()` | User's staking positions |
| `useStakeTransaction()` | Stake/unstake actions |

#### Address Book
| Hook | Description |
|------|-------------|
| `useAddressBook()` | Address book management |
| `useAddressStatus(address)` | Check if address is known |

### Utilities

#### Configuration
```tsx
import { configureWallet, getWalletConfig, getSuiClient } from '@nasun/wallet';

// Set network
configureWallet({
  rpcUrl: 'https://rpc.devnet.nasun.io',
  faucetUrl: 'https://faucet.devnet.nasun.io',
  explorerUrl: 'https://explorer.devnet.nasun.io',
});

// Get current config
const config = getWalletConfig();

// Get SUI client instance
const client = getSuiClient();
```

#### Token Registry
```tsx
import { registerToken, registerTokens, getToken, getAllTokens } from '@nasun/wallet';

// Register single token
registerToken({
  symbol: 'NBTC',
  name: 'Nasun Bitcoin',
  decimals: 8,
  type: '0x...',
});

// Register multiple tokens
registerTokens([
  { symbol: 'NBTC', name: 'Nasun Bitcoin', decimals: 8, type: '0x...' },
  { symbol: 'NUSDC', name: 'Nasun USDC', decimals: 6, type: '0x...' },
]);

// Get token config
const nbtc = getToken('NBTC');

// Get all registered tokens
const tokens = getAllTokens();
```

#### Formatting
```tsx
import { formatBalance, parseAmount, shortenAddress, isValidAddress } from '@nasun/wallet';

formatBalance(1000000000n, 9);  // "1.00"
parseAmount('1.5', 9);          // 1500000000n
shortenAddress('0x1234...5678'); // "0x1234...5678"
isValidAddress('0x...');         // true/false
```

#### Rate Limiting
```tsx
import { isLockedOut, getLockoutRemainingMs, getUnlockAttemptState } from '@nasun/wallet';

if (isLockedOut()) {
  const remainingMs = getLockoutRemainingMs();
  console.log(`Locked for ${Math.ceil(remainingMs / 1000)} seconds`);
}

const state = getUnlockAttemptState();
console.log(`Failed attempts: ${state.failedAttempts}`);
```

## Storage

The wallet uses localStorage for persistence:

| Key | Description |
|-----|-------------|
| `nasun_wallet_keystore` | Encrypted private key |
| `nasun_wallet_unlock_attempts` | Rate limiting state |
| `nasun_wallet_session` | Session password (optional) |
| `nasun_address_book` | Saved addresses |
| `nasun_security_settings` | Security configuration |

## Network Configuration

Default: Nasun Devnet

| Property | Value |
|----------|-------|
| RPC Endpoint | https://rpc.devnet.nasun.io |
| Faucet | https://faucet.devnet.nasun.io |
| Explorer | https://explorer.devnet.nasun.io |
| Chain ID | `6681cdfd` |
| Native Token | NASUN (decimals: 9) |

## Related Packages

- **@nasun/wallet-ui** - React UI components (WalletConnect, BalanceDisplay, SendTransaction, etc.)
- **@nasun/tailwind-config** - Nasun brand colors for Tailwind CSS

## License

Private - Nasun Project
