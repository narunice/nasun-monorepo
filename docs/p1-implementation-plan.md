# P1 상세 구현 계획서

> 작성일: 2026-01-11
> 기반: nasun-wallet-improvement-plan.md v2.0
> 상태: Signer 추상화 완료, 나머지 P1 작업 계획

---

## 완료된 작업

### Signer 추상화 레이어 ✅

| 파일 | 설명 |
|------|------|
| `core/signer/types.ts` | SignerAdapter 인터페이스 |
| `core/signer/adapters/LocalSigner.ts` | Ed25519 Signer |
| `core/signer/adapters/ZkLoginSigner.ts` | zkLogin Signer |
| `core/signer/SignerManager.ts` | Signer 상태 관리 |
| `hooks/useSigner.ts` | 통합 Signer 훅 |

**검증**: 단위 테스트 177개 통과, E2E 테스트 성공

---

## P1 남은 작업 개요

| 순서 | 작업 | 의존성 | 핵심 가치 |
|------|------|--------|----------|
| 1 | **멀티체인 지원** | Signer 추상화 | 일반 Web3 사용자 유입 |
| 2 | **WalletConnect v2** | 멀티체인 | DApp 생태계 연결 |
| 3 | **EVM Account Abstraction** | 멀티체인 | 2026년형 UX |
| 4 | **Nasun Link v2** | - (독립) | 온보딩 캠페인 인프라 |

---

## 1. 멀티체인 지원 (EVM)

### 1.1. 목표

Nasun 지갑에서 EVM 체인(Ethereum, Base, Arbitrum) 자산을 관리할 수 있도록 확장.
"지갑 먼저" 전략의 핵심 - 일반 Web3 사용자를 먼저 유입.

### 1.2. 지원 체인 (Phase 1)

| 체인 | Chain ID | RPC | AA 지원 |
|------|----------|-----|---------|
| Nasun Devnet | `6681cdfd` | https://rpc.devnet.nasun.io | ❌ (Move) |
| Ethereum Mainnet | `1` | Alchemy/Infura | ✅ |
| Base | `8453` | https://mainnet.base.org | ✅ |
| Arbitrum One | `42161` | https://arb1.arbitrum.io/rpc | ✅ |

### 1.3. 아키텍처

```
packages/wallet/src/
├── config/
│   └── chains.ts              # 체인 설정 (NEW)
├── core/
│   ├── signer/
│   │   └── adapters/
│   │       ├── LocalSigner.ts      # Nasun/Sui용
│   │       ├── EVMSigner.ts        # EVM용 (NEW)
│   │       └── ZkLoginSigner.ts
│   └── evm/                   # EVM 유틸리티 (NEW)
│       ├── client.ts          # viem PublicClient
│       ├── wallet.ts          # EVM 지갑 생성/복구
│       └── index.ts
├── hooks/
│   ├── useNetwork.ts          # 네트워크 전환 (NEW)
│   ├── useEVMBalance.ts       # EVM 잔액 조회 (NEW)
│   ├── useEVMTransaction.ts   # EVM 트랜잭션 (NEW)
│   └── useSigner.ts           # 기존 (체인별 Signer 선택 로직 추가)
```

### 1.4. 핵심 구현

#### 1.4.1. 체인 설정 (`config/chains.ts`)

```typescript
export type ChainType = 'move' | 'evm';

export interface ChainConfig {
  id: string;
  name: string;
  type: ChainType;
  rpcUrl: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  blockExplorer?: string;
  // EVM specific
  chainId?: number;
  // AA specific
  aa?: {
    bundlerUrl: string;
    paymasterUrl?: string;
    entryPoint: `0x${string}`;
  };
}

export const CHAINS: Record<string, ChainConfig> = {
  'nasun-devnet': {
    id: 'nasun-devnet',
    name: 'Nasun Devnet',
    type: 'move',
    rpcUrl: 'https://rpc.devnet.nasun.io',
    nativeCurrency: { name: 'Nasun', symbol: 'NASUN', decimals: 9 },
    blockExplorer: 'https://explorer.devnet.nasun.io',
  },
  'ethereum': {
    id: 'ethereum',
    name: 'Ethereum',
    type: 'evm',
    chainId: 1,
    rpcUrl: 'https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    blockExplorer: 'https://etherscan.io',
    aa: {
      bundlerUrl: 'https://api.pimlico.io/v2/1/rpc?apikey=${PIMLICO_KEY}',
      entryPoint: '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789',
    },
  },
  'base': {
    id: 'base',
    name: 'Base',
    type: 'evm',
    chainId: 8453,
    rpcUrl: 'https://mainnet.base.org',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    blockExplorer: 'https://basescan.org',
    aa: {
      bundlerUrl: 'https://api.pimlico.io/v2/8453/rpc?apikey=${PIMLICO_KEY}',
      entryPoint: '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789',
    },
  },
  'arbitrum': {
    id: 'arbitrum',
    name: 'Arbitrum One',
    type: 'evm',
    chainId: 42161,
    rpcUrl: 'https://arb1.arbitrum.io/rpc',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    blockExplorer: 'https://arbiscan.io',
    aa: {
      bundlerUrl: 'https://api.pimlico.io/v2/42161/rpc?apikey=${PIMLICO_KEY}',
      entryPoint: '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789',
    },
  },
};

export function getChain(id: string): ChainConfig | undefined {
  return CHAINS[id];
}

export function getEVMChains(): ChainConfig[] {
  return Object.values(CHAINS).filter(c => c.type === 'evm');
}
```

#### 1.4.2. EVM Signer (`core/signer/adapters/EVMSigner.ts`)

```typescript
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import type { SignerAdapter, SignerCapabilities, SignatureResult } from '../types';
import { DEFAULT_CAPABILITIES } from '../types';

export class EVMSigner implements SignerAdapter {
  readonly type = 'evm' as const;
  readonly address: string;
  readonly capabilities: SignerCapabilities = {
    ...DEFAULT_CAPABILITIES,
  };

  private account: PrivateKeyAccount;
  private chainId: number;

  constructor(privateKey: `0x${string}`, chainId: number) {
    this.account = privateKeyToAccount(privateKey);
    this.address = this.account.address;
    this.chainId = chainId;
  }

  async sign(txBytes: Uint8Array): Promise<SignatureResult> {
    // EVM에서는 serialized tx 대신 tx object를 받아야 함
    // 이 메서드는 Move 체인용이므로 EVM에서는 다른 방식 사용
    throw new Error('Use signTransaction for EVM transactions');
  }

  async signPersonal(message: Uint8Array): Promise<SignatureResult> {
    const signature = await this.account.signMessage({
      message: { raw: message },
    });
    return { signature };
  }

  async signTransaction(tx: {
    to: `0x${string}`;
    value?: bigint;
    data?: `0x${string}`;
    gas?: bigint;
    gasPrice?: bigint;
    maxFeePerGas?: bigint;
    maxPriorityFeePerGas?: bigint;
    nonce?: number;
  }): Promise<`0x${string}`> {
    return await this.account.signTransaction({
      ...tx,
      chainId: this.chainId,
    });
  }

  getAccount(): PrivateKeyAccount {
    return this.account;
  }
}
```

#### 1.4.3. useNetwork 훅 (`hooks/useNetwork.ts`)

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ChainConfig } from '../config/chains';
import { CHAINS, getChain } from '../config/chains';

interface NetworkState {
  currentChainId: string;
  setChain: (chainId: string) => void;
}

export const useNetworkStore = create<NetworkState>()(
  persist(
    (set) => ({
      currentChainId: 'nasun-devnet',
      setChain: (chainId) => set({ currentChainId: chainId }),
    }),
    { name: 'nasun-wallet-network' }
  )
);

export interface UseNetworkResult {
  /** 현재 체인 설정 */
  chain: ChainConfig;
  /** 현재 체인 ID */
  chainId: string;
  /** 체인이 EVM인지 여부 */
  isEVM: boolean;
  /** 체인이 Move(Nasun/Sui)인지 여부 */
  isMove: boolean;
  /** 사용 가능한 모든 체인 */
  chains: ChainConfig[];
  /** 체인 전환 */
  switchChain: (chainId: string) => void;
}

export function useNetwork(): UseNetworkResult {
  const { currentChainId, setChain } = useNetworkStore();
  const chain = getChain(currentChainId) || CHAINS['nasun-devnet'];

  return {
    chain,
    chainId: currentChainId,
    isEVM: chain.type === 'evm',
    isMove: chain.type === 'move',
    chains: Object.values(CHAINS),
    switchChain: setChain,
  };
}
```

#### 1.4.4. EVM 잔액 조회 (`hooks/useEVMBalance.ts`)

```typescript
import { useQuery } from '@tanstack/react-query';
import { createPublicClient, http, formatEther } from 'viem';
import { useNetwork } from './useNetwork';
import { useSigner } from './useSigner';

export function useEVMBalance() {
  const { chain, isEVM } = useNetwork();
  const { address } = useSigner();

  return useQuery({
    queryKey: ['evm-balance', chain.id, address],
    queryFn: async () => {
      if (!isEVM || !address || !chain.chainId) return null;

      const client = createPublicClient({
        chain: { id: chain.chainId, name: chain.name, /* ... */ },
        transport: http(chain.rpcUrl),
      });

      const balance = await client.getBalance({ address: address as `0x${string}` });
      return {
        raw: balance,
        formatted: formatEther(balance),
        symbol: chain.nativeCurrency.symbol,
      };
    },
    enabled: isEVM && !!address,
    refetchInterval: 10000,
  });
}
```

### 1.5. 키 관리 전략

**문제**: Nasun은 Ed25519, EVM은 secp256k1 사용.

**해결책**: 단일 니모닉에서 두 체인 키 파생

```typescript
// 니모닉 → 체인별 키 파생
import { mnemonicToAccount } from 'viem/accounts';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

function deriveKeysFromMnemonic(mnemonic: string) {
  // EVM: BIP-44 m/44'/60'/0'/0/0
  const evmAccount = mnemonicToAccount(mnemonic);

  // Nasun/Sui: BIP-44 m/44'/784'/0'/0'/0'
  const nasunKeypair = Ed25519Keypair.deriveKeypair(mnemonic);

  return { evmAccount, nasunKeypair };
}
```

### 1.6. 의존성 추가

```json
{
  "dependencies": {
    "viem": "^2.21.x"
  }
}
```

### 1.7. 구현 단계

| Step | 내용 | 파일 |
|------|------|------|
| 1 | 체인 설정 | `config/chains.ts` |
| 2 | EVM 클라이언트 | `core/evm/client.ts` |
| 3 | EVM Signer | `core/signer/adapters/EVMSigner.ts` |
| 4 | 니모닉→EVM 키 파생 | `core/evm/wallet.ts` |
| 5 | useNetwork 훅 | `hooks/useNetwork.ts` |
| 6 | useEVMBalance 훅 | `hooks/useEVMBalance.ts` |
| 7 | useEVMTransaction 훅 | `hooks/useEVMTransaction.ts` |
| 8 | useSigner 확장 | `hooks/useSigner.ts` (체인별 Signer 선택) |
| 9 | 테스트 | `__tests__/evm/*.test.ts` |

---

## 2. WalletConnect v2

### 2.1. 목표

WalletConnect v2 프로토콜로 외부 DApp과 연결.
멀티체인 지원과 결합하여 EVM DApp 생태계 접근.

### 2.2. 아키텍처

```
packages/wallet/src/
├── core/
│   └── walletconnect/         # WalletConnect 모듈 (NEW)
│       ├── client.ts          # SignClient 초기화
│       ├── sessions.ts        # 세션 관리
│       ├── handlers.ts        # 요청 핸들러
│       └── index.ts
├── hooks/
│   └── useWalletConnect.ts    # WalletConnect 훅 (NEW)
```

### 2.3. 핵심 구현

#### 2.3.1. SignClient 초기화 (`core/walletconnect/client.ts`)

```typescript
import { Core } from '@walletconnect/core';
import { Web3Wallet, type Web3WalletTypes } from '@walletconnect/web3wallet';

let web3wallet: Web3Wallet | null = null;

export async function initWalletConnect(projectId: string): Promise<Web3Wallet> {
  if (web3wallet) return web3wallet;

  const core = new Core({ projectId });

  web3wallet = await Web3Wallet.init({
    core,
    metadata: {
      name: 'Nasun Wallet',
      description: 'Next-generation multi-chain wallet',
      url: 'https://nasun.io',
      icons: ['https://nasun.io/icon.png'],
    },
  });

  return web3wallet;
}

export function getWalletConnect(): Web3Wallet | null {
  return web3wallet;
}
```

#### 2.3.2. 세션 관리 (`core/walletconnect/sessions.ts`)

```typescript
import type { SessionTypes } from '@walletconnect/types';
import { getWalletConnect } from './client';

export async function approveSession(
  proposal: Web3WalletTypes.SessionProposal,
  accounts: string[],
  chains: string[]
): Promise<SessionTypes.Struct> {
  const wc = getWalletConnect();
  if (!wc) throw new Error('WalletConnect not initialized');

  const namespaces = buildNamespaces(proposal, accounts, chains);

  return await wc.approveSession({
    id: proposal.id,
    namespaces,
  });
}

export async function rejectSession(proposalId: number): Promise<void> {
  const wc = getWalletConnect();
  if (!wc) throw new Error('WalletConnect not initialized');

  await wc.rejectSession({
    id: proposalId,
    reason: { code: 4001, message: 'User rejected' },
  });
}

function buildNamespaces(
  proposal: Web3WalletTypes.SessionProposal,
  accounts: string[],
  chains: string[]
): SessionTypes.Namespaces {
  // EIP155 (EVM) 네임스페이스 구성
  return {
    eip155: {
      accounts: accounts.map(addr =>
        chains.map(chain => `eip155:${chain}:${addr}`).flat()
      ).flat(),
      methods: [
        'eth_sendTransaction',
        'eth_signTransaction',
        'eth_sign',
        'personal_sign',
        'eth_signTypedData',
        'eth_signTypedData_v4',
      ],
      events: ['accountsChanged', 'chainChanged'],
    },
  };
}
```

#### 2.3.3. useWalletConnect 훅 (`hooks/useWalletConnect.ts`)

```typescript
import { useState, useEffect, useCallback } from 'react';
import type { SessionTypes } from '@walletconnect/types';
import { initWalletConnect, getWalletConnect } from '../core/walletconnect/client';
import { approveSession, rejectSession } from '../core/walletconnect/sessions';

export interface UseWalletConnectResult {
  /** 초기화 여부 */
  isInitialized: boolean;
  /** 활성 세션 목록 */
  sessions: SessionTypes.Struct[];
  /** 대기 중인 연결 요청 */
  pendingProposal: Web3WalletTypes.SessionProposal | null;
  /** 대기 중인 서명 요청 */
  pendingRequest: Web3WalletTypes.SessionRequest | null;
  /** URI로 연결 시작 */
  pair: (uri: string) => Promise<void>;
  /** 세션 승인 */
  approve: () => Promise<void>;
  /** 세션 거부 */
  reject: () => Promise<void>;
  /** 세션 연결 해제 */
  disconnect: (topic: string) => Promise<void>;
}

export function useWalletConnect(projectId: string): UseWalletConnectResult {
  const [isInitialized, setIsInitialized] = useState(false);
  const [sessions, setSessions] = useState<SessionTypes.Struct[]>([]);
  const [pendingProposal, setPendingProposal] = useState<Web3WalletTypes.SessionProposal | null>(null);
  const [pendingRequest, setPendingRequest] = useState<Web3WalletTypes.SessionRequest | null>(null);

  // 초기화
  useEffect(() => {
    initWalletConnect(projectId).then((wc) => {
      setIsInitialized(true);
      setSessions(Object.values(wc.getActiveSessions()));

      // 이벤트 리스너
      wc.on('session_proposal', setPendingProposal);
      wc.on('session_request', setPendingRequest);
      wc.on('session_delete', () => {
        setSessions(Object.values(wc.getActiveSessions()));
      });
    });
  }, [projectId]);

  const pair = useCallback(async (uri: string) => {
    const wc = getWalletConnect();
    if (!wc) throw new Error('Not initialized');
    await wc.pair({ uri });
  }, []);

  // ... 나머지 메서드

  return {
    isInitialized,
    sessions,
    pendingProposal,
    pendingRequest,
    pair,
    approve,
    reject,
    disconnect,
  };
}
```

### 2.4. 의존성 추가

```json
{
  "dependencies": {
    "@walletconnect/web3wallet": "^1.15.x",
    "@walletconnect/core": "^2.17.x"
  }
}
```

### 2.5. 구현 단계

| Step | 내용 | 파일 |
|------|------|------|
| 1 | SignClient 초기화 | `core/walletconnect/client.ts` |
| 2 | 세션 관리 | `core/walletconnect/sessions.ts` |
| 3 | 요청 핸들러 | `core/walletconnect/handlers.ts` |
| 4 | useWalletConnect 훅 | `hooks/useWalletConnect.ts` |
| 5 | UI 컴포넌트 (wallet-ui) | `WalletConnectModal.tsx` |
| 6 | 테스트 | `__tests__/walletconnect/*.test.ts` |

---

## 3. EVM Account Abstraction (AA)

### 3.1. 목표

ERC-4337 기반 Smart Account로 가스 대납, 세션 키, 배치 트랜잭션 지원.
2026년 EVM 지갑의 필수 UX.

### 3.2. 아키텍처

```
packages/wallet/src/
├── core/
│   ├── signer/adapters/
│   │   └── SmartAccountSigner.ts  # AA Signer (NEW)
│   └── aa/                        # Account Abstraction (NEW)
│       ├── client.ts              # Bundler/Paymaster 클라이언트
│       ├── account.ts             # Smart Account 생성/관리
│       ├── sessionKey.ts          # 세션 키 관리
│       └── index.ts
├── hooks/
│   ├── useSmartAccount.ts         # Smart Account 훅 (NEW)
│   ├── useGasSponsor.ts           # 가스 대납 훅 (NEW)
│   └── useSessionKey.ts           # 세션 키 훅 (NEW)
```

### 3.3. 핵심 구현

#### 3.3.1. Smart Account 생성 (`core/aa/account.ts`)

```typescript
import { createSmartAccountClient } from 'permissionless';
import { signerToSimpleSmartAccount } from 'permissionless/accounts';
import { createPimlicoClient } from 'permissionless/clients/pimlico';
import { type PublicClient, http } from 'viem';

export interface SmartAccountConfig {
  owner: `0x${string}`;
  chainId: number;
  bundlerUrl: string;
  paymasterUrl?: string;
  entryPoint: `0x${string}`;
}

export async function createSmartAccount(
  publicClient: PublicClient,
  ownerAccount: PrivateKeyAccount,
  config: SmartAccountConfig
) {
  // Simple Smart Account 생성
  const simpleAccount = await signerToSimpleSmartAccount(publicClient, {
    signer: ownerAccount,
    entryPoint: config.entryPoint,
    factoryAddress: '0x9406Cc6185a346906296840746125a0E44976454',
  });

  // Bundler 클라이언트
  const bundlerClient = createPimlicoClient({
    transport: http(config.bundlerUrl),
    entryPoint: config.entryPoint,
  });

  // Smart Account Client
  const smartAccountClient = createSmartAccountClient({
    account: simpleAccount,
    chain: publicClient.chain,
    bundlerTransport: http(config.bundlerUrl),
    paymaster: config.paymasterUrl ? {
      getPaymasterData: async (userOp) => {
        // Paymaster API 호출
        return await fetchPaymasterData(config.paymasterUrl!, userOp);
      },
    } : undefined,
  });

  return {
    address: simpleAccount.address,
    client: smartAccountClient,
    isDeployed: await isAccountDeployed(publicClient, simpleAccount.address),
  };
}
```

#### 3.3.2. SmartAccountSigner (`core/signer/adapters/SmartAccountSigner.ts`)

```typescript
import type { SignerAdapter, SignerCapabilities, SignatureResult } from '../types';

export class SmartAccountSigner implements SignerAdapter {
  readonly type = 'smart-account' as const;
  readonly address: string;
  readonly capabilities: SignerCapabilities = {
    sessionKeys: true,
    batchSign: true,
    gasSponsorship: true,
    requiresHardwareConfirm: false,
  };

  private smartAccountClient: SmartAccountClient;

  constructor(smartAccountClient: SmartAccountClient, address: string) {
    this.smartAccountClient = smartAccountClient;
    this.address = address;
  }

  async sign(txBytes: Uint8Array): Promise<SignatureResult> {
    throw new Error('Use sendUserOperation for Smart Accounts');
  }

  async signPersonal(message: Uint8Array): Promise<SignatureResult> {
    const signature = await this.smartAccountClient.signMessage({
      message: { raw: message },
    });
    return { signature };
  }

  async sendUserOperation(calls: Call[]): Promise<`0x${string}`> {
    const txHash = await this.smartAccountClient.sendTransaction({
      calls,
    });
    return txHash;
  }

  async sendSponsoredTransaction(calls: Call[]): Promise<`0x${string}`> {
    // Paymaster를 통한 가스 대납 트랜잭션
    return await this.sendUserOperation(calls);
  }
}
```

#### 3.3.3. useSmartAccount 훅 (`hooks/useSmartAccount.ts`)

```typescript
import { useQuery, useMutation } from '@tanstack/react-query';
import { useNetwork } from './useNetwork';
import { useSigner } from './useSigner';
import { createSmartAccount } from '../core/aa/account';

export interface UseSmartAccountResult {
  /** Smart Account 주소 */
  address: string | null;
  /** 배포 여부 */
  isDeployed: boolean;
  /** 로딩 상태 */
  isLoading: boolean;
  /** Smart Account 배포 */
  deploy: () => Promise<void>;
  /** UserOperation 전송 */
  sendUserOp: (calls: Call[]) => Promise<string>;
}

export function useSmartAccount(): UseSmartAccountResult {
  const { chain, isEVM } = useNetwork();
  const { signer } = useSigner();

  const { data: smartAccount, isLoading } = useQuery({
    queryKey: ['smart-account', chain.id, signer?.address],
    queryFn: async () => {
      if (!isEVM || !chain.aa || !signer) return null;
      // Smart Account 조회 또는 생성
      return await createSmartAccount(/* ... */);
    },
    enabled: isEVM && !!chain.aa && !!signer,
  });

  const deployMutation = useMutation({
    mutationFn: async () => {
      // Smart Account 배포 트랜잭션
    },
  });

  return {
    address: smartAccount?.address ?? null,
    isDeployed: smartAccount?.isDeployed ?? false,
    isLoading,
    deploy: deployMutation.mutateAsync,
    sendUserOp: async (calls) => {
      // UserOperation 전송
    },
  };
}
```

#### 3.3.4. 세션 키 (`hooks/useSessionKey.ts`)

```typescript
export interface SessionKeyConfig {
  /** 유효 기간 (ms) */
  ttl: number;
  /** 허용된 권한 */
  permissions: Permission[];
  /** 최대 트랜잭션 수 */
  maxTransactions?: number;
  /** 최대 전송 금액 */
  maxValue?: bigint;
}

export interface UseSessionKeyResult {
  /** 세션 키 활성 여부 */
  isActive: boolean;
  /** 만료 시간 */
  expiresAt: number | null;
  /** 세션 키 생성 */
  create: (config: SessionKeyConfig) => Promise<void>;
  /** 세션 키 취소 */
  revoke: () => Promise<void>;
}

export function useSessionKey(): UseSessionKeyResult {
  // 세션 키 관리 로직
}
```

### 3.4. 의존성 추가

```json
{
  "dependencies": {
    "permissionless": "^0.2.x",
    "@pimlico/sdk": "^0.2.x"
  }
}
```

### 3.5. 구현 단계

| Step | 내용 | 파일 |
|------|------|------|
| 1 | AA 클라이언트 | `core/aa/client.ts` |
| 2 | Smart Account 생성 | `core/aa/account.ts` |
| 3 | SmartAccountSigner | `core/signer/adapters/SmartAccountSigner.ts` |
| 4 | useSmartAccount 훅 | `hooks/useSmartAccount.ts` |
| 5 | useGasSponsor 훅 | `hooks/useGasSponsor.ts` |
| 6 | useSessionKey 훅 | `hooks/useSessionKey.ts` |
| 7 | 테스트 | `__tests__/aa/*.test.ts` |

---

## 4. Nasun Link v2

### 4.1. 목표

단순 토큰 전송에서 **Web3 온보딩 인프라**로 확장.
zkLogin과 결합하여 Sui 계열에서 유일한 포지션 확보.

### 4.2. v1 vs v2 비교

| 기능 | v1 | v2 |
|------|----|----|
| 토큰 전송 | ✅ | ✅ |
| 링크 만료 | ✅ | ✅ |
| ZK 조건부 수령 | ❌ | ✅ 성인/국가/1인1회 |
| 수령 후 가스 지원 | ❌ | ✅ N건 무료 |
| 캠페인 분석 | ❌ | ✅ 전환율/수령률 |
| 자동 스왑/브릿지 | ❌ | ✅ (Phase 2) |

### 4.3. 아키텍처

```
packages/wallet/src/
├── core/
│   └── nasunlink/             # Nasun Link (NEW)
│       ├── link.ts            # 링크 생성/수령
│       ├── conditions.ts      # 조건부 수령 로직
│       ├── analytics.ts       # 캠페인 분석
│       └── index.ts
├── hooks/
│   ├── useNasunLink.ts        # 링크 생성 훅 (NEW)
│   └── useClaimLink.ts        # 링크 수령 훅 (NEW)
```

### 4.4. 핵심 구현

#### 4.4.1. 링크 데이터 구조

```typescript
export interface NasunLinkConfig {
  /** 토큰 타입 */
  token: string;
  /** 금액 (최소 단위) */
  amount: bigint;

  // v2: 조건부 수령
  conditions?: {
    /** 성인 인증 필요 */
    ageVerification?: boolean;
    /** 허용 국가 목록 */
    countryAllowed?: string[];
    /** 1인 1회 수령 */
    uniqueClaim?: boolean;
    /** 필요한 ZK 증명 유형 */
    zkProofRequired?: ZkProofType;
  };

  // v2: 수령 후 혜택
  onClaim?: {
    /** 무료 가스 지원 횟수 */
    freeGasCount?: number;
    /** 자동 스왑 대상 토큰 */
    autoSwapTo?: string;
  };

  /** 만료 시간 (Unix timestamp) */
  expiresAt?: number;
  /** 캠페인 ID (분석용) */
  campaignId?: string;
}

export interface NasunLink {
  /** 링크 ID */
  id: string;
  /** 링크 URL */
  url: string;
  /** 설정 */
  config: NasunLinkConfig;
  /** 생성자 주소 */
  creator: string;
  /** 비밀 키 (암호화됨) */
  encryptedSecret: string;
  /** 상태 */
  status: 'active' | 'claimed' | 'expired' | 'cancelled';
  /** 생성 시간 */
  createdAt: number;
  /** 수령 정보 (수령된 경우) */
  claimInfo?: {
    claimedBy: string;
    claimedAt: number;
    txDigest: string;
  };
}
```

#### 4.4.2. 링크 생성 (`core/nasunlink/link.ts`)

```typescript
import { Transaction } from '@mysten/sui/transactions';
import { getSuiClient } from '../sui/client';
import { SignerManager } from '../signer/SignerManager';

export async function createNasunLink(config: NasunLinkConfig): Promise<NasunLink> {
  const signer = SignerManager.getCurrent();
  if (!signer) throw new Error('No signer available');

  // 1. 임시 키페어 생성 (링크 비밀)
  const linkKeypair = Ed25519Keypair.generate();
  const linkAddress = linkKeypair.toSuiAddress();

  // 2. 토큰을 링크 주소로 전송
  const tx = new Transaction();
  tx.setSender(signer.address);

  const [coin] = tx.splitCoins(tx.gas, [config.amount]);
  tx.transferObjects([coin], linkAddress);

  const suiClient = getSuiClient();
  const txBytes = await tx.build({ client: suiClient });
  const { signature } = await signer.sign(txBytes);

  const result = await suiClient.executeTransactionBlock({
    transactionBlock: txBytes,
    signature,
  });

  // 3. 링크 데이터 생성
  const linkId = generateLinkId();
  const encryptedSecret = encryptPrivateKey(linkKeypair.getSecretKey());

  const link: NasunLink = {
    id: linkId,
    url: `https://nasun.io/link/${linkId}`,
    config,
    creator: signer.address,
    encryptedSecret,
    status: 'active',
    createdAt: Date.now(),
  };

  // 4. 링크 메타데이터 저장 (오프체인)
  await saveLinkMetadata(link);

  return link;
}
```

#### 4.4.3. 조건부 수령 (`core/nasunlink/conditions.ts`)

```typescript
export async function verifyClaimConditions(
  link: NasunLink,
  claimer: string,
  proofs?: ZkProofs
): Promise<{ valid: boolean; reason?: string }> {
  const { conditions } = link.config;
  if (!conditions) return { valid: true };

  // 1. 성인 인증
  if (conditions.ageVerification) {
    if (!proofs?.ageProof) {
      return { valid: false, reason: 'Age verification required' };
    }
    const verified = await verifyAgeProof(proofs.ageProof);
    if (!verified) {
      return { valid: false, reason: 'Invalid age proof' };
    }
  }

  // 2. 국가 제한
  if (conditions.countryAllowed?.length) {
    if (!proofs?.countryProof) {
      return { valid: false, reason: 'Country verification required' };
    }
    const country = await verifyCountryProof(proofs.countryProof);
    if (!conditions.countryAllowed.includes(country)) {
      return { valid: false, reason: 'Country not allowed' };
    }
  }

  // 3. 1인 1회 수령
  if (conditions.uniqueClaim) {
    const hasClaimed = await checkPreviousClaim(link.id, claimer);
    if (hasClaimed) {
      return { valid: false, reason: 'Already claimed' };
    }
  }

  return { valid: true };
}
```

#### 4.4.4. useNasunLink 훅 (`hooks/useNasunLink.ts`)

```typescript
import { useMutation, useQuery } from '@tanstack/react-query';
import { createNasunLink, claimNasunLink } from '../core/nasunlink/link';
import type { NasunLinkConfig, NasunLink } from '../core/nasunlink/types';

export interface UseNasunLinkResult {
  /** 링크 생성 */
  createLink: (config: NasunLinkConfig) => Promise<NasunLink>;
  /** 링크 생성 중 */
  isCreating: boolean;
  /** 내가 만든 링크 목록 */
  myLinks: NasunLink[];
  /** 링크 정보 조회 */
  getLink: (linkId: string) => Promise<NasunLink | null>;
  /** 링크 취소 */
  cancelLink: (linkId: string) => Promise<void>;
}

export function useNasunLink(): UseNasunLinkResult {
  const createMutation = useMutation({
    mutationFn: createNasunLink,
  });

  const { data: myLinks = [] } = useQuery({
    queryKey: ['my-nasun-links'],
    queryFn: fetchMyLinks,
  });

  return {
    createLink: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    myLinks,
    getLink: fetchLinkById,
    cancelLink: async (linkId) => {
      // 링크 취소 로직
    },
  };
}
```

### 4.5. 백엔드 요구사항

| 컴포넌트 | 설명 | 구현 방식 |
|----------|------|----------|
| 링크 메타데이터 저장 | 링크 설정, 상태 저장 | DynamoDB |
| 캠페인 분석 | 조회수, 전환율 추적 | CloudWatch Metrics |
| ZK 증명 검증 | 성인/국가/1인1회 검증 | Lambda + ZK Verifier |
| 가스 스폰서 | N건 가스 지원 | Sponsor Lambda (기존) |

### 4.6. 구현 단계

| Step | 내용 | 파일 |
|------|------|------|
| 1 | 링크 타입 정의 | `core/nasunlink/types.ts` |
| 2 | 링크 생성 | `core/nasunlink/link.ts` |
| 3 | 조건부 수령 | `core/nasunlink/conditions.ts` |
| 4 | 캠페인 분석 | `core/nasunlink/analytics.ts` |
| 5 | useNasunLink 훅 | `hooks/useNasunLink.ts` |
| 6 | useClaimLink 훅 | `hooks/useClaimLink.ts` |
| 7 | 백엔드 API | Lambda + DynamoDB |
| 8 | 테스트 | `__tests__/nasunlink/*.test.ts` |

---

## 5. 구현 우선순위 및 의존성

```
┌─────────────────────┐
│  Signer 추상화 ✅   │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐     ┌─────────────────────┐
│   멀티체인 (EVM)    │     │   Nasun Link v2     │
│   - chains.ts       │     │   - 독립적 구현 가능 │
│   - EVMSigner       │     │   - 백엔드 필요      │
│   - useNetwork      │     │                     │
└──────────┬──────────┘     └─────────────────────┘
           │
     ┌─────┴─────┐
     ▼           ▼
┌──────────┐ ┌──────────────┐
│ WC v2    │ │    EVM AA    │
│ (DApp)   │ │ (SmartAcct)  │
└──────────┘ └──────────────┘
```

**권장 구현 순서:**

1. **멀티체인 지원** → WalletConnect v2 → EVM AA (순차 의존)
2. **Nasun Link v2** (독립적으로 병렬 진행 가능)

---

## 6. 테스트 전략

### 6.1. 단위 테스트

| 모듈 | 테스트 내용 |
|------|------------|
| `config/chains.ts` | 체인 설정 조회 |
| `EVMSigner` | 서명, 주소 파생 |
| `SmartAccountSigner` | UserOp 생성 |
| `WalletConnect` | 세션 관리 |
| `NasunLink` | 링크 생성/수령 |

### 6.2. 통합 테스트

| 시나리오 | 테스트 방법 |
|----------|------------|
| 멀티체인 전송 | Nasun → Base 잔액 확인 → Base에서 전송 |
| WalletConnect | 테스트 DApp 연결 → 서명 요청 → 승인 |
| AA 가스 대납 | Paymaster로 가스 없이 전송 |
| Nasun Link | 링크 생성 → 다른 계정에서 수령 |

### 6.3. E2E 테스트

- Network Explorer에서 멀티체인 테스트
- Pado 앱에서 AA 트랜잭션 테스트
- Nasun Website에서 Link v2 테스트

---

## 변경 이력

| 버전 | 날짜 | 내용 |
|------|------|------|
| 1.0 | 2026-01-11 | 초안 작성 (Signer 완료 후) |
