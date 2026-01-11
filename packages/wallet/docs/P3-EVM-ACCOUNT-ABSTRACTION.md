# P3 EVM Account Abstraction Implementation Plan

> Created: 2026-01-11
> Status: PLANNING
> Package: @nasun/wallet

---

## 1. Overview

### What is ERC-4337 Account Abstraction?

Account Abstraction (AA) replaces Externally Owned Accounts (EOAs) with smart contract wallets, enabling:

- **Gasless transactions**: Paymasters can sponsor gas fees
- **Batched transactions**: Execute multiple operations atomically
- **Session keys**: Grant limited permissions to dApps
- **Social recovery**: Recover accounts without seed phrases
- **Custom validation**: Multisig, biometrics, etc.

### Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                         Nasun Wallet                            │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                  Smart Account Module                     │  │
│  │  ┌─────────────────┐    ┌───────────────────────────┐   │  │
│  │  │ SmartAccount    │    │    UserOperation          │   │  │
│  │  │ Signer          │    │    Builder                │   │  │
│  │  └─────────────────┘    └───────────────────────────┘   │  │
│  │  ┌─────────────────┐    ┌───────────────────────────┐   │  │
│  │  │ Bundler         │    │    Paymaster              │   │  │
│  │  │ Client          │    │    Client                 │   │  │
│  │  └─────────────────┘    └───────────────────────────┘   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                  │
│                    useSmartAccount()                            │
│                              │                                  │
│                     ┌────────┴────────┐                        │
│                     │                 │                        │
│               EVMSigner         SmartAccountSigner              │
│              (EOA owner)        (executes UserOps)             │
└────────────────────────────────────────────────────────────────┘
                               │
            ┌──────────────────┼──────────────────┐
            │                  │                  │
      EntryPoint          Bundler            Paymaster
      Contract           (Pimlico)          (Sponsor)
```

### ERC-4337 Core Concepts

| Concept | Description |
|---------|-------------|
| **UserOperation** | Pseudo-transaction signed by smart account |
| **EntryPoint** | Singleton contract that executes UserOps |
| **Bundler** | Off-chain service that submits UserOps to EntryPoint |
| **Paymaster** | Contract that sponsors gas for UserOps |
| **Account Factory** | Deploys smart account contracts |

---

## 2. Dependencies

### Required Packages

```bash
pnpm add permissionless
```

`permissionless` provides:
- Smart account implementations (SimpleAccount, Safe, Kernel, etc.)
- Bundler client (ERC-4337 RPC)
- Paymaster client
- UserOperation utilities

### Already Installed

- `viem` - Core Ethereum library
- `@nasun/wallet` signer infrastructure

---

## 3. Implementation Steps

### Step 1: Core Types (Day 1)

**File**: `core/aa/types.ts`

```typescript
import type { Address, Hex } from 'viem';

/** Smart account type */
export type SmartAccountType = 'simple' | 'safe' | 'kernel';

/** UserOperation structure (ERC-4337 v0.6) */
export interface UserOperation {
  sender: Address;
  nonce: bigint;
  initCode: Hex;
  callData: Hex;
  callGasLimit: bigint;
  verificationGasLimit: bigint;
  preVerificationGas: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  paymasterAndData: Hex;
  signature: Hex;
}

/** Smart account state */
export interface SmartAccountState {
  /** Smart account address */
  address: Address;
  /** Whether account is deployed */
  isDeployed: boolean;
  /** Account type */
  type: SmartAccountType;
  /** Owner EOA address */
  owner: Address;
  /** Chain ID */
  chainId: number;
}

/** Paymaster mode */
export type PaymasterMode =
  | 'none'           // User pays gas
  | 'verifying'      // Signature-based sponsorship
  | 'erc20';         // Pay gas with ERC-20 tokens

/** Transaction request for smart account */
export interface SmartAccountTxRequest {
  to: Address;
  value?: bigint;
  data?: Hex;
}
```

### Step 2: Bundler Client (Day 1)

**File**: `core/aa/bundler.ts`

```typescript
import { createPublicClient, http, type Chain } from 'viem';
import {
  createBundlerClient,
  type BundlerClient,
} from 'permissionless';
import type { ChainConfig } from '../../config/chains';

/** Bundler client cache */
const bundlerClients: Map<number, BundlerClient> = new Map();

/**
 * Get or create bundler client for a chain
 */
export function getBundlerClient(chain: ChainConfig): BundlerClient {
  if (!chain.aa) {
    throw new Error(`Chain ${chain.id} does not support Account Abstraction`);
  }

  const chainId = chain.chainId!;

  if (bundlerClients.has(chainId)) {
    return bundlerClients.get(chainId)!;
  }

  const viemChain = {
    id: chainId,
    name: chain.name,
    nativeCurrency: chain.nativeCurrency,
    rpcUrls: {
      default: { http: [chain.rpcUrl] },
    },
  } as Chain;

  const client = createBundlerClient({
    chain: viemChain,
    transport: http(chain.aa.bundlerUrl),
    entryPoint: chain.aa.entryPoint,
  });

  bundlerClients.set(chainId, client);
  return client;
}

/**
 * Clear bundler client cache
 */
export function clearBundlerClients(): void {
  bundlerClients.clear();
}
```

### Step 3: Paymaster Client (Day 2)

**File**: `core/aa/paymaster.ts`

```typescript
import { http } from 'viem';
import {
  createPimlicoPaymasterClient,
  type PimlicoPaymasterClient,
} from 'permissionless/clients/pimlico';
import type { ChainConfig } from '../../config/chains';

/** Paymaster client cache */
const paymasterClients: Map<number, PimlicoPaymasterClient> = new Map();

/**
 * Get or create Pimlico paymaster client
 *
 * Note: Requires PIMLICO_API_KEY environment variable
 */
export function getPaymasterClient(
  chain: ChainConfig,
  apiKey: string
): PimlicoPaymasterClient {
  if (!chain.aa?.paymasterUrl) {
    throw new Error(`Chain ${chain.id} does not have paymaster configured`);
  }

  const chainId = chain.chainId!;

  if (paymasterClients.has(chainId)) {
    return paymasterClients.get(chainId)!;
  }

  // Construct paymaster URL with API key
  const paymasterUrl = `${chain.aa.paymasterUrl}?apikey=${apiKey}`;

  const client = createPimlicoPaymasterClient({
    transport: http(paymasterUrl),
    entryPoint: chain.aa.entryPoint,
  });

  paymasterClients.set(chainId, client);
  return client;
}

/**
 * Check if transaction can be sponsored
 */
export async function canSponsor(
  paymaster: PimlicoPaymasterClient,
  userOp: UserOperation
): Promise<boolean> {
  try {
    await paymaster.sponsorUserOperation({ userOperation: userOp });
    return true;
  } catch {
    return false;
  }
}
```

### Step 4: Smart Account Factory (Day 2)

**File**: `core/aa/account.ts`

```typescript
import type { Address, Chain, Hex } from 'viem';
import { createPublicClient, http } from 'viem';
import {
  signerToSimpleSmartAccount,
  type SimpleSmartAccount,
} from 'permissionless/accounts';
import type { EVMSigner } from '../signer/adapters/EVMSigner';
import type { ChainConfig } from '../../config/chains';

/** Smart account cache (chainId -> account) */
const accountCache: Map<number, SimpleSmartAccount> = new Map();

/**
 * Create or get SimpleSmartAccount from EOA signer
 *
 * SimpleSmartAccount is the default ERC-4337 implementation.
 * It uses the EOA as the single owner with simple ECDSA validation.
 */
export async function getSimpleSmartAccount(
  signer: EVMSigner,
  chain: ChainConfig
): Promise<SimpleSmartAccount> {
  if (!chain.aa) {
    throw new Error(`Chain ${chain.id} does not support Account Abstraction`);
  }

  const chainId = chain.chainId!;

  // Return cached account if exists
  if (accountCache.has(chainId)) {
    return accountCache.get(chainId)!;
  }

  const viemChain = {
    id: chainId,
    name: chain.name,
    nativeCurrency: chain.nativeCurrency,
    rpcUrls: {
      default: { http: [chain.rpcUrl] },
    },
  } as Chain;

  const publicClient = createPublicClient({
    chain: viemChain,
    transport: http(chain.rpcUrl),
  });

  // Create smart account with EOA as owner
  const account = await signerToSimpleSmartAccount(publicClient, {
    signer: signer.getAccount(),
    entryPoint: chain.aa.entryPoint,
    // Factory address is handled by permissionless
  });

  accountCache.set(chainId, account);
  return account;
}

/**
 * Get smart account address (counterfactual)
 *
 * Returns the deterministic address even before deployment
 */
export async function getSmartAccountAddress(
  signer: EVMSigner,
  chain: ChainConfig
): Promise<Address> {
  const account = await getSimpleSmartAccount(signer, chain);
  return account.address;
}

/**
 * Check if smart account is deployed
 */
export async function isAccountDeployed(
  chain: ChainConfig,
  address: Address
): Promise<boolean> {
  const publicClient = createPublicClient({
    transport: http(chain.rpcUrl),
  });

  const code = await publicClient.getBytecode({ address });
  return code !== undefined && code !== '0x';
}

/**
 * Clear account cache
 */
export function clearAccountCache(): void {
  accountCache.clear();
}
```

### Step 5: SmartAccountSigner Adapter (Day 3)

**File**: `core/signer/adapters/SmartAccountSigner.ts`

```typescript
import type { Address, Hex } from 'viem';
import {
  createSmartAccountClient,
  type SmartAccountClient,
} from 'permissionless';
import type { SimpleSmartAccount } from 'permissionless/accounts';
import type { SignerAdapter, SignerCapabilities, SignatureResult } from '../types';
import { DEFAULT_CAPABILITIES } from '../types';
import type { ChainConfig } from '../../../config/chains';
import { getBundlerClient } from '../../aa/bundler';
import { getPaymasterClient } from '../../aa/paymaster';
import type { SmartAccountTxRequest } from '../../aa/types';

/**
 * SmartAccountSigner - ERC-4337 Smart Account Signer
 *
 * Wraps a SimpleSmartAccount to provide SignerAdapter interface.
 * Executes transactions through UserOperations via bundler.
 */
export class SmartAccountSigner implements SignerAdapter {
  readonly type = 'smart-account' as const;
  readonly address: string;
  readonly capabilities: SignerCapabilities = {
    ...DEFAULT_CAPABILITIES,
    sessionKeys: true,
    batchSign: true,
    gasSponsorship: true,
  };

  private smartAccount: SimpleSmartAccount;
  private chain: ChainConfig;
  private client: SmartAccountClient;
  private paymasterApiKey?: string;

  constructor(
    smartAccount: SimpleSmartAccount,
    chain: ChainConfig,
    paymasterApiKey?: string
  ) {
    this.smartAccount = smartAccount;
    this.chain = chain;
    this.address = smartAccount.address;
    this.paymasterApiKey = paymasterApiKey;

    // Create smart account client
    const bundler = getBundlerClient(chain);

    this.client = createSmartAccountClient({
      account: smartAccount,
      bundlerTransport: bundler.transport,
      // Paymaster middleware added if API key provided
      middleware: paymasterApiKey ? {
        sponsorUserOperation: async ({ userOperation }) => {
          const paymaster = getPaymasterClient(chain, paymasterApiKey);
          return paymaster.sponsorUserOperation({ userOperation });
        },
      } : undefined,
    });
  }

  /**
   * Sign raw bytes
   *
   * Note: For smart accounts, this signs with the owner's key.
   * The signature will be wrapped in the UserOperation.
   */
  async sign(txBytes: Uint8Array): Promise<SignatureResult> {
    // Smart accounts sign messages differently
    const signature = await this.smartAccount.signMessage({
      message: { raw: txBytes },
    });
    return { signature };
  }

  /**
   * Sign personal message (EIP-191)
   */
  async signPersonal(message: Uint8Array): Promise<SignatureResult> {
    const signature = await this.smartAccount.signMessage({
      message: { raw: message },
    });
    return { signature };
  }

  /**
   * Execute transaction via UserOperation
   *
   * This is the primary method for smart account transactions.
   * The transaction is bundled into a UserOperation and sent to bundler.
   *
   * @returns Transaction hash
   */
  async sendTransaction(tx: SmartAccountTxRequest): Promise<Hex> {
    const hash = await this.client.sendTransaction({
      to: tx.to,
      value: tx.value ?? 0n,
      data: tx.data ?? '0x',
    });

    return hash;
  }

  /**
   * Execute batch transactions atomically
   */
  async sendBatchTransactions(txs: SmartAccountTxRequest[]): Promise<Hex> {
    const calls = txs.map(tx => ({
      to: tx.to,
      value: tx.value ?? 0n,
      data: tx.data ?? '0x',
    }));

    const hash = await this.client.sendTransactions({ calls });
    return hash;
  }

  /**
   * Get the underlying smart account
   */
  getSmartAccount(): SimpleSmartAccount {
    return this.smartAccount;
  }

  /**
   * Get the smart account client
   */
  getClient(): SmartAccountClient {
    return this.client;
  }

  /**
   * Check if paymaster is configured
   */
  hasPaymaster(): boolean {
    return !!this.paymasterApiKey;
  }
}
```

### Step 6: useSmartAccount Hook (Day 3-4)

**File**: `hooks/useSmartAccount.ts`

```typescript
import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Address, Hex } from 'viem';
import { useSigner } from './useSigner';
import { useChain } from './useChain';
import { EVMSigner } from '../core/signer/adapters/EVMSigner';
import { SmartAccountSigner } from '../core/signer/adapters/SmartAccountSigner';
import {
  getSimpleSmartAccount,
  getSmartAccountAddress,
  isAccountDeployed,
} from '../core/aa/account';
import type { SmartAccountState, SmartAccountTxRequest } from '../core/aa/types';

export interface UseSmartAccountResult {
  /** Smart account state */
  state: SmartAccountState | null;
  /** Whether smart account is loading */
  isLoading: boolean;
  /** Error message if any */
  error: string | null;
  /** SmartAccountSigner instance */
  signer: SmartAccountSigner | null;
  /** Send transaction via smart account */
  sendTransaction: (tx: SmartAccountTxRequest) => Promise<Hex>;
  /** Send batch transactions */
  sendBatchTransactions: (txs: SmartAccountTxRequest[]) => Promise<Hex>;
  /** Whether gas sponsorship is enabled */
  isSponsored: boolean;
  /** Enable/disable sponsorship */
  setSponsored: (enabled: boolean) => void;
}

/**
 * Hook for managing ERC-4337 Smart Account
 *
 * @param paymasterApiKey - Optional Pimlico API key for gas sponsorship
 *
 * @example
 * ```tsx
 * const { state, signer, sendTransaction, isSponsored } = useSmartAccount();
 *
 * // Send sponsored transaction
 * const hash = await sendTransaction({
 *   to: '0x...',
 *   value: parseEther('0.1'),
 * });
 * ```
 */
export function useSmartAccount(
  paymasterApiKey?: string
): UseSmartAccountResult {
  const { signer: baseSigner, hasSigner } = useSigner();
  const { chain, isEVM } = useChain();

  const [state, setState] = useState<SmartAccountState | null>(null);
  const [smartSigner, setSmartSigner] = useState<SmartAccountSigner | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSponsored, setIsSponsored] = useState(!!paymasterApiKey);

  // Initialize smart account when EVM signer is available
  useEffect(() => {
    if (!isEVM || !chain?.aa || !hasSigner('evm')) {
      setState(null);
      setSmartSigner(null);
      return;
    }

    const evmSigner = baseSigner as EVMSigner;
    if (!(evmSigner instanceof EVMSigner)) {
      return;
    }

    const initSmartAccount = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const smartAccount = await getSimpleSmartAccount(evmSigner, chain);
        const deployed = await isAccountDeployed(chain, smartAccount.address);

        setState({
          address: smartAccount.address,
          isDeployed: deployed,
          type: 'simple',
          owner: evmSigner.address as Address,
          chainId: chain.chainId!,
        });

        // Create SmartAccountSigner
        const apiKey = isSponsored ? paymasterApiKey : undefined;
        const signer = new SmartAccountSigner(smartAccount, chain, apiKey);
        setSmartSigner(signer);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to init smart account';
        setError(message);
        setState(null);
        setSmartSigner(null);
      } finally {
        setIsLoading(false);
      }
    };

    initSmartAccount();
  }, [isEVM, chain, baseSigner, hasSigner, isSponsored, paymasterApiKey]);

  // Toggle sponsorship
  const setSponsored = useCallback((enabled: boolean) => {
    if (enabled && !paymasterApiKey) {
      console.warn('[SmartAccount] Cannot enable sponsorship without API key');
      return;
    }
    setIsSponsored(enabled);
  }, [paymasterApiKey]);

  // Send single transaction
  const sendTransaction = useCallback(async (tx: SmartAccountTxRequest): Promise<Hex> => {
    if (!smartSigner) {
      throw new Error('Smart account not initialized');
    }
    return smartSigner.sendTransaction(tx);
  }, [smartSigner]);

  // Send batch transactions
  const sendBatchTransactions = useCallback(async (txs: SmartAccountTxRequest[]): Promise<Hex> => {
    if (!smartSigner) {
      throw new Error('Smart account not initialized');
    }
    return smartSigner.sendBatchTransactions(txs);
  }, [smartSigner]);

  return {
    state,
    isLoading,
    error,
    signer: smartSigner,
    sendTransaction,
    sendBatchTransactions,
    isSponsored,
    setSponsored,
  };
}

/**
 * Hook to get smart account address without full initialization
 */
export function useSmartAccountAddress(): Address | null {
  const { signer, hasSigner } = useSigner();
  const { chain, isEVM } = useChain();
  const [address, setAddress] = useState<Address | null>(null);

  useEffect(() => {
    if (!isEVM || !chain?.aa || !hasSigner('evm')) {
      setAddress(null);
      return;
    }

    const evmSigner = signer as EVMSigner;
    if (!(evmSigner instanceof EVMSigner)) {
      return;
    }

    getSmartAccountAddress(evmSigner, chain)
      .then(setAddress)
      .catch(() => setAddress(null));
  }, [isEVM, chain, signer, hasSigner]);

  return address;
}
```

### Step 7: Update Chain Config for Paymaster (Day 4)

**File**: `config/chains.ts` (update AAConfig)

```typescript
/** Account Abstraction configuration (EVM only) */
export interface AAConfig {
  /** Bundler RPC URL */
  bundlerUrl: string;
  /** Paymaster URL (optional) */
  paymasterUrl?: string;
  /** EntryPoint contract address */
  entryPoint: `0x${string}`;
  /** Account factory address (optional, uses default if not set) */
  factoryAddress?: `0x${string}`;
}

// Update existing chain configs with paymaster URLs
'sepolia': {
  // ... existing config ...
  aa: {
    bundlerUrl: 'https://api.pimlico.io/v2/11155111/rpc',
    paymasterUrl: 'https://api.pimlico.io/v2/11155111/rpc',
    entryPoint: '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789',
  },
},
```

### Step 8: Module Exports (Day 4)

**File**: `core/aa/index.ts`

```typescript
export * from './types';
export * from './bundler';
export * from './paymaster';
export * from './account';
```

**File**: `core/signer/adapters/index.ts` (update)

```typescript
export { LocalSigner } from './LocalSigner';
export { ZkLoginSigner } from './ZkLoginSigner';
export { EVMSigner } from './EVMSigner';
export { SmartAccountSigner } from './SmartAccountSigner';
```

**File**: `index.ts` (update exports)

```typescript
// Account Abstraction
export {
  getBundlerClient,
  getPaymasterClient,
  getSimpleSmartAccount,
  getSmartAccountAddress,
  isAccountDeployed,
} from './core/aa';

export type {
  SmartAccountType,
  SmartAccountState,
  SmartAccountTxRequest,
  PaymasterMode,
} from './core/aa/types';

// Hooks
export { useSmartAccount, useSmartAccountAddress } from './hooks/useSmartAccount';

// Signers (update)
export { SmartAccountSigner } from './core/signer/adapters/SmartAccountSigner';
```

---

## 4. Testing Strategy

### Unit Tests

```typescript
// __tests__/aa/account.test.ts
describe('Smart Account', () => {
  it('creates counterfactual address', async () => {
    const address = await getSmartAccountAddress(evmSigner, chain);
    expect(address).toMatch(/^0x[a-fA-F0-9]{40}$/);
  });

  it('address is deterministic', async () => {
    const addr1 = await getSmartAccountAddress(evmSigner, chain);
    const addr2 = await getSmartAccountAddress(evmSigner, chain);
    expect(addr1).toBe(addr2);
  });

  it('detects deployed account', async () => {
    const deployed = await isAccountDeployed(chain, deployedAddress);
    expect(deployed).toBe(true);
  });
});
```

### Integration Tests (Sepolia)

1. **Account Creation**
   - Create smart account from EOA
   - Verify counterfactual address

2. **First Transaction (Deployment)**
   - Send first UserOp (triggers deployment)
   - Verify account is deployed

3. **Sponsored Transaction**
   - Configure paymaster
   - Send sponsored transaction
   - Verify user paid no gas

4. **Batch Transaction**
   - Send multiple calls in one UserOp
   - Verify all executed atomically

---

## 5. Security Considerations

### Owner Key Protection

- Smart account owner key is the EOA private key
- Same encryption as EVMSigner (AES-256-GCM)
- Loss of owner key = loss of smart account

### Paymaster Trust

- Only use trusted paymaster providers (Pimlico, Stackup)
- Paymaster can reject transactions
- User should be able to bypass paymaster

### UserOperation Validation

- Always verify UserOperation before signing
- Show clear transaction details to user
- Warn about first-time deployment

### EntryPoint Version

- Using v0.6 EntryPoint (`0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789`)
- v0.7 has different interface - not compatible

---

## 6. File Structure

```
packages/wallet/src/
├── core/
│   ├── aa/                       # Account Abstraction [NEW]
│   │   ├── types.ts              # AA types
│   │   ├── bundler.ts            # Bundler client
│   │   ├── paymaster.ts          # Paymaster client
│   │   ├── account.ts            # Smart account factory
│   │   └── index.ts              # Exports
│   ├── signer/
│   │   └── adapters/
│   │       ├── SmartAccountSigner.ts  # [NEW]
│   │       └── index.ts          # Updated
│   └── ...
├── hooks/
│   ├── useSmartAccount.ts        # [NEW]
│   └── ...
└── index.ts                      # Updated exports
```

---

## 7. Dependencies Summary

| Package | Version | Purpose |
|---------|---------|---------|
| `permissionless` | ^0.1.x | AA SDK (accounts, bundler, paymaster) |
| `viem` | existing | Core Ethereum library |

---

## 8. Estimated Effort

| Step | Description | Effort |
|------|-------------|--------|
| 1 | Core types | 0.5 day |
| 2 | Bundler client | 0.5 day |
| 3 | Paymaster client | 0.5 day |
| 4 | Smart account factory | 0.5 day |
| 5 | SmartAccountSigner | 1 day |
| 6 | useSmartAccount hook | 1 day |
| 7 | Chain config updates | 0.5 day |
| 8 | Testing & documentation | 1 day |
| **Total** | | **5-6 days** |

---

## 9. Success Criteria

- [ ] SmartAccountSigner implements SignerAdapter interface
- [ ] useSmartAccount hook works on all AA-enabled chains
- [ ] Counterfactual address matches deployed address
- [ ] Sponsored transactions work with Pimlico
- [ ] Batch transactions execute atomically
- [ ] All existing tests pass
- [ ] New AA tests pass (10+ tests)

---

## 10. Future Enhancements (P4+)

1. **Session Keys**
   - Temporary keys with limited permissions
   - Time-bound or transaction-count limited

2. **Social Recovery**
   - Guardian-based recovery
   - Email/social recovery modules

3. **Safe Account Support**
   - Multi-signature accounts
   - Threshold signatures

4. **ERC-7579 Modules**
   - Modular smart accounts
   - Plugin architecture
