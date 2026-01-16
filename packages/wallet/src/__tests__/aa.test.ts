import { describe, it, expect, vi, beforeEach } from 'vitest';
import './setup';

// Mock viem modules
vi.mock('viem', async () => {
  const actual = await vi.importActual('viem');
  return {
    ...actual,
    http: vi.fn(() => ({ type: 'http' })),
    createPublicClient: vi.fn(() => ({
      chain: { id: 1 },
      transport: { type: 'http' },
      getBytecode: vi.fn().mockResolvedValue('0x1234'),
    })),
  };
});

// Mock viem/account-abstraction
vi.mock('viem/account-abstraction', () => ({
  createBundlerClient: vi.fn(() => ({
    chain: { id: 1 },
    transport: { type: 'http' },
    request: vi.fn(),
  })),
  entryPoint07Address: '0x0000000071727De22E5E9d8BAf0edAc6f37da032' as const,
}));

// Mock permissionless
vi.mock('permissionless', () => ({
  createSmartAccountClient: vi.fn(() => ({
    account: { address: '0x1234567890123456789012345678901234567890' },
    chain: { id: 1 },
    sendTransaction: vi.fn().mockResolvedValue('0xhash'),
    signMessage: vi.fn().mockResolvedValue('0xsignature'),
  })),
}));

vi.mock('permissionless/accounts', () => ({
  toSimpleSmartAccount: vi.fn().mockResolvedValue({
    address: '0x1234567890123456789012345678901234567890',
    signMessage: vi.fn().mockResolvedValue('0xsignature'),
    signTypedData: vi.fn().mockResolvedValue('0xsignature'),
    getInitCode: vi.fn().mockResolvedValue('0x'),
    getNonce: vi.fn().mockResolvedValue(0n),
    getFactory: vi.fn().mockReturnValue('0xfactory'),
    getFactoryData: vi.fn().mockReturnValue('0xdata'),
    encodeCalls: vi.fn().mockReturnValue('0xcalldata'),
    getStubSignature: vi.fn().mockReturnValue('0xstubsig'),
    signUserOperation: vi.fn().mockResolvedValue('0xsig'),
    type: 'local',
    entryPoint: {
      address: '0x0000000071727De22E5E9d8BAf0edAc6f37da032',
      version: '0.7',
    },
  }),
}));

vi.mock('permissionless/clients/pimlico', () => ({
  createPimlicoClient: vi.fn(() => ({
    transport: { type: 'http' },
    getPaymasterData: vi.fn(),
    getPaymasterStubData: vi.fn(),
  })),
}));

import type { ChainConfig } from '../config/chains';
import {
  SmartAccountType,
  SmartAccountState,
  SmartAccountTxRequest,
  PaymasterMode,
  BatchCall,
  UserOperationReceipt,
  // P2: New types
  GasCostEstimate,
  PaymasterContext,
  PaymasterStrategy,
  SponsorshipCondition,
  SessionKeyPermission,
  SessionKeyConfig,
  SessionKeyState,
  SessionKeyValidation,
} from '../core/aa/types';
import { getBundlerClient, formatGasEstimate } from '../core/aa/bundler';
import { getPaymasterClient } from '../core/aa/paymaster';
import {
  getSimpleSmartAccount,
  getSmartAccountAddress,
  isAccountDeployed,
  getSmartAccountState,
  clearAccountCache,
} from '../core/aa/account';
import {
  SessionKeyManager,
  createERC20TransferPermission,
  createNativeTransferPermission,
  createContractPermission,
} from '../core/aa/session-keys';
import { SmartAccountSigner } from '../core/signer/adapters/SmartAccountSigner';
import type { EVMSigner } from '../core/signer/adapters/EVMSigner';

// Test chain configuration with AA support
const TEST_CHAIN: ChainConfig = {
  id: 'sepolia',
  name: 'Sepolia',
  type: 'evm',
  chainId: 11155111,
  rpcUrl: 'https://rpc.sepolia.org',
  nativeCurrency: {
    name: 'Sepolia Ether',
    symbol: 'ETH',
    decimals: 18,
  },
  blockExplorer: 'https://sepolia.etherscan.io',
  testnet: true,
  aa: {
    bundlerUrl: 'https://api.pimlico.io/v2/11155111/rpc',
    entryPoint: '0x0000000071727De22E5E9d8BAf0edAc6f37da032',
  },
};

// Chain without AA support
const NON_AA_CHAIN: ChainConfig = {
  id: 'holesky',
  name: 'Holesky',
  type: 'evm',
  chainId: 17000,
  rpcUrl: 'https://ethereum-holesky-rpc.publicnode.com',
  nativeCurrency: {
    name: 'Holesky Ether',
    symbol: 'ETH',
    decimals: 18,
  },
  testnet: true,
};

// Mock EVMSigner
const createMockEVMSigner = (): EVMSigner =>
  ({
    type: 'evm' as const,
    address: '0xOwner1234567890123456789012345678901234' as `0x${string}`,
    chainId: 11155111,
    capabilities: {
      sessionKeys: false,
      batchSign: true,
      gasSponsorship: false,
      requiresHardwareConfirm: false,
    },
    sign: vi.fn().mockResolvedValue({ signature: '0xsignature' }),
    signPersonal: vi.fn().mockResolvedValue({ signature: '0xsignature' }),
    signEVMTransaction: vi.fn().mockResolvedValue('0xsignedtx'),
    signTypedData: vi.fn().mockResolvedValue({ signature: '0xsignature' }),
    getAccount: vi.fn().mockReturnValue({
      address: '0xOwner1234567890123456789012345678901234',
      type: 'local',
      signMessage: vi.fn().mockResolvedValue('0xsignature'),
      signTransaction: vi.fn().mockResolvedValue('0xsignedtx'),
      signTypedData: vi.fn().mockResolvedValue('0xsignature'),
    }),
  }) as unknown as EVMSigner;

describe('AA Types', () => {
  describe('SmartAccountType', () => {
    it('should accept valid smart account types', () => {
      const types: SmartAccountType[] = ['simple', 'safe', 'kernel'];
      expect(types).toHaveLength(3);
    });
  });

  describe('SmartAccountState', () => {
    it('should define valid state structure', () => {
      const state: SmartAccountState = {
        address: '0x1234567890123456789012345678901234567890',
        isDeployed: false,
        type: 'simple',
        owner: '0xabcdef1234567890123456789012345678901234',
        chainId: 11155111,
      };

      expect(state.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
      expect(state.isDeployed).toBe(false);
      expect(state.type).toBe('simple');
      expect(state.owner).toMatch(/^0x[0-9a-fA-F]{40}$/);
      expect(state.chainId).toBe(11155111);
    });
  });

  describe('SmartAccountTxRequest', () => {
    it('should define valid transaction request', () => {
      const tx: SmartAccountTxRequest = {
        to: '0x1234567890123456789012345678901234567890',
        value: 1000000000000000000n,
        data: '0x',
      };

      expect(tx.to).toMatch(/^0x[0-9a-fA-F]{40}$/);
      expect(tx.value).toBe(1000000000000000000n);
      expect(tx.data).toBe('0x');
    });

    it('should allow optional value and data', () => {
      const tx: SmartAccountTxRequest = {
        to: '0x1234567890123456789012345678901234567890',
      };

      expect(tx.to).toBeDefined();
      expect(tx.value).toBeUndefined();
      expect(tx.data).toBeUndefined();
    });
  });

  describe('PaymasterMode', () => {
    it('should define valid paymaster modes', () => {
      const modes: PaymasterMode[] = ['none', 'verifying', 'erc20'];
      expect(modes).toHaveLength(3);
    });
  });

  describe('BatchCall', () => {
    it('should define valid batch call structure', () => {
      const call: BatchCall = {
        to: '0x1234567890123456789012345678901234567890',
        value: 0n,
        data: '0xabcdef',
      };

      expect(call.to).toMatch(/^0x/);
      expect(call.value).toBe(0n);
      expect(call.data).toBe('0xabcdef');
    });
  });

  describe('UserOperationReceipt', () => {
    it('should define valid receipt structure', () => {
      const receipt: UserOperationReceipt = {
        userOpHash: '0x1234567890123456789012345678901234567890123456789012345678901234',
        transactionHash: '0xabcdef1234567890123456789012345678901234567890123456789012345678',
        blockNumber: 12345678n,
        success: true,
        actualGasUsed: 100000n,
        actualGasCost: 1000000000000000n,
      };

      expect(receipt.userOpHash).toMatch(/^0x[0-9a-fA-F]{64}$/);
      expect(receipt.transactionHash).toMatch(/^0x[0-9a-fA-F]{64}$/);
      expect(receipt.blockNumber).toBe(12345678n);
      expect(receipt.success).toBe(true);
      expect(receipt.actualGasUsed).toBe(100000n);
      expect(receipt.actualGasCost).toBe(1000000000000000n);
    });
  });
});

describe('Bundler Client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create bundler client for AA-enabled chain', () => {
    const client = getBundlerClient(TEST_CHAIN);
    expect(client).toBeDefined();
    expect(client.chain).toBeDefined();
  });

  it('should create bundler client with API key', () => {
    const client = getBundlerClient(TEST_CHAIN, 'test-api-key');
    expect(client).toBeDefined();
  });

  it('should throw error for chain without AA support', () => {
    expect(() => getBundlerClient(NON_AA_CHAIN)).toThrow(
      'Chain holesky does not support Account Abstraction'
    );
  });
});

describe('Paymaster Client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create paymaster client for AA-enabled chain', () => {
    const client = getPaymasterClient(TEST_CHAIN, 'test-api-key');
    expect(client).toBeDefined();
  });

  it('should throw error for chain without AA support', () => {
    expect(() => getPaymasterClient(NON_AA_CHAIN, 'test-api-key')).toThrow(
      'Chain holesky does not support Account Abstraction'
    );
  });
});

describe('Smart Account Factory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAccountCache();
  });

  it('should create simple smart account', async () => {
    const signer = createMockEVMSigner();
    const account = await getSimpleSmartAccount(signer, TEST_CHAIN);

    expect(account).toBeDefined();
    expect(account.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  it('should cache smart account', async () => {
    const signer = createMockEVMSigner();

    const account1 = await getSimpleSmartAccount(signer, TEST_CHAIN);
    const account2 = await getSimpleSmartAccount(signer, TEST_CHAIN);

    expect(account1).toBe(account2);
  });

  it('should throw error for chain without AA support', async () => {
    const signer = createMockEVMSigner();

    await expect(getSimpleSmartAccount(signer, NON_AA_CHAIN)).rejects.toThrow(
      'Chain holesky does not support Account Abstraction'
    );
  });

  it('should get smart account address', async () => {
    const signer = createMockEVMSigner();
    const address = await getSmartAccountAddress(signer, TEST_CHAIN);

    expect(address).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  it('should check if account is deployed', async () => {
    const deployed = await isAccountDeployed(
      TEST_CHAIN,
      '0x1234567890123456789012345678901234567890'
    );

    expect(typeof deployed).toBe('boolean');
  });

  it('should get smart account state', async () => {
    const signer = createMockEVMSigner();
    const state = await getSmartAccountState(signer, TEST_CHAIN);

    expect(state).toBeDefined();
    expect(state.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(state.type).toBe('simple');
    expect(state.chainId).toBe(TEST_CHAIN.chainId);
  });

  it('should clear account cache', async () => {
    const signer = createMockEVMSigner();

    await getSimpleSmartAccount(signer, TEST_CHAIN);
    clearAccountCache();

    // After clearing, a new account should be created
    const account = await getSimpleSmartAccount(signer, TEST_CHAIN);
    expect(account).toBeDefined();
  });
});

describe('SmartAccountSigner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAccountCache();
  });

  it('should create SmartAccountSigner', async () => {
    const evmSigner = createMockEVMSigner();
    const smartAccount = await getSimpleSmartAccount(evmSigner, TEST_CHAIN);

    const signer = new SmartAccountSigner(smartAccount, TEST_CHAIN);

    expect(signer).toBeDefined();
    expect(signer.type).toBe('smart-account');
    expect(signer.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  it('should have correct capabilities', async () => {
    const evmSigner = createMockEVMSigner();
    const smartAccount = await getSimpleSmartAccount(evmSigner, TEST_CHAIN);

    const signer = new SmartAccountSigner(smartAccount, TEST_CHAIN);

    expect(signer.capabilities.sessionKeys).toBe(true);
    expect(signer.capabilities.batchSign).toBe(true);
    expect(signer.capabilities.gasSponsorship).toBe(true);
    expect(signer.capabilities.requiresHardwareConfirm).toBe(false);
  });

  it('should sign message', async () => {
    const evmSigner = createMockEVMSigner();
    const smartAccount = await getSimpleSmartAccount(evmSigner, TEST_CHAIN);

    const signer = new SmartAccountSigner(smartAccount, TEST_CHAIN);
    const result = await signer.sign(new Uint8Array([1, 2, 3]));

    expect(result).toBeDefined();
    expect(result.signature).toMatch(/^0x/);
  });

  it('should sign personal message', async () => {
    const evmSigner = createMockEVMSigner();
    const smartAccount = await getSimpleSmartAccount(evmSigner, TEST_CHAIN);

    const signer = new SmartAccountSigner(smartAccount, TEST_CHAIN);
    const result = await signer.signPersonal(new Uint8Array([1, 2, 3]));

    expect(result).toBeDefined();
    expect(result.signature).toMatch(/^0x/);
  });

  it('should send transaction', async () => {
    const evmSigner = createMockEVMSigner();
    const smartAccount = await getSimpleSmartAccount(evmSigner, TEST_CHAIN);

    const signer = new SmartAccountSigner(smartAccount, TEST_CHAIN);
    const hash = await signer.sendTransaction({
      to: '0x1234567890123456789012345678901234567890',
      value: 1000000000000000000n,
    });

    expect(hash).toMatch(/^0x/);
  });

  it('should send batch transactions', async () => {
    const evmSigner = createMockEVMSigner();
    const smartAccount = await getSimpleSmartAccount(evmSigner, TEST_CHAIN);

    const signer = new SmartAccountSigner(smartAccount, TEST_CHAIN);
    const hash = await signer.sendBatchTransactions([
      { to: '0x1234567890123456789012345678901234567890', value: 100n },
      { to: '0x0987654321098765432109876543210987654321', value: 200n },
    ]);

    expect(hash).toMatch(/^0x/);
  });

  it('should throw error for empty batch', async () => {
    const evmSigner = createMockEVMSigner();
    const smartAccount = await getSimpleSmartAccount(evmSigner, TEST_CHAIN);

    const signer = new SmartAccountSigner(smartAccount, TEST_CHAIN);

    await expect(signer.sendBatchTransactions([])).rejects.toThrow(
      'No transactions to send'
    );
  });

  it('should handle single transaction in batch', async () => {
    const evmSigner = createMockEVMSigner();
    const smartAccount = await getSimpleSmartAccount(evmSigner, TEST_CHAIN);

    const signer = new SmartAccountSigner(smartAccount, TEST_CHAIN);
    const hash = await signer.sendBatchTransactions([
      { to: '0x1234567890123456789012345678901234567890', value: 100n },
    ]);

    expect(hash).toMatch(/^0x/);
  });

  it('should create signer with paymaster', async () => {
    const evmSigner = createMockEVMSigner();
    const smartAccount = await getSimpleSmartAccount(evmSigner, TEST_CHAIN);

    const signer = new SmartAccountSigner(smartAccount, TEST_CHAIN, 'test-api-key');

    expect(signer).toBeDefined();
    expect(signer.hasPaymaster()).toBe(true);
  });

  it('should report no paymaster when not provided', async () => {
    const evmSigner = createMockEVMSigner();
    const smartAccount = await getSimpleSmartAccount(evmSigner, TEST_CHAIN);

    const signer = new SmartAccountSigner(smartAccount, TEST_CHAIN);

    expect(signer.hasPaymaster()).toBe(false);
  });

  it('should throw error for chain without AA support', async () => {
    // Create a mock smart account for testing
    const mockSmartAccount = {
      address: '0x1234567890123456789012345678901234567890',
      signMessage: vi.fn(),
    } as any;

    expect(() => new SmartAccountSigner(mockSmartAccount, NON_AA_CHAIN)).toThrow(
      'Chain holesky does not support Account Abstraction'
    );
  });

  it('should get smart account', async () => {
    const evmSigner = createMockEVMSigner();
    const smartAccount = await getSimpleSmartAccount(evmSigner, TEST_CHAIN);

    const signer = new SmartAccountSigner(smartAccount, TEST_CHAIN);

    expect(signer.getSmartAccount()).toBe(smartAccount);
  });

  it('should get client', async () => {
    const evmSigner = createMockEVMSigner();
    const smartAccount = await getSimpleSmartAccount(evmSigner, TEST_CHAIN);

    const signer = new SmartAccountSigner(smartAccount, TEST_CHAIN);

    expect(signer.getClient()).toBeDefined();
  });

  it('should get chain', async () => {
    const evmSigner = createMockEVMSigner();
    const smartAccount = await getSimpleSmartAccount(evmSigner, TEST_CHAIN);

    const signer = new SmartAccountSigner(smartAccount, TEST_CHAIN);

    expect(signer.getChain()).toBe(TEST_CHAIN);
  });

  it('should get address', async () => {
    const evmSigner = createMockEVMSigner();
    const smartAccount = await getSimpleSmartAccount(evmSigner, TEST_CHAIN);

    const signer = new SmartAccountSigner(smartAccount, TEST_CHAIN);

    expect(signer.getAddress()).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });
});

describe('Chain AA Support', () => {
  it('should identify AA-enabled chains', () => {
    expect(TEST_CHAIN.aa).toBeDefined();
    expect(TEST_CHAIN.aa?.bundlerUrl).toContain('pimlico');
    expect(TEST_CHAIN.aa?.entryPoint).toMatch(/^0x/);
  });

  it('should identify non-AA chains', () => {
    expect(NON_AA_CHAIN.aa).toBeUndefined();
  });
});

describe('Module Exports', () => {
  it('should export all AA types', async () => {
    const types = await import('../core/aa/types');

    // Type exports are available at compile time
    expect(types).toBeDefined();
  });

  it('should export bundler functions', async () => {
    const bundler = await import('../core/aa/bundler');

    expect(bundler.getBundlerClient).toBeDefined();
    expect(typeof bundler.getBundlerClient).toBe('function');
  });

  it('should export paymaster functions', async () => {
    const paymaster = await import('../core/aa/paymaster');

    expect(paymaster.getPaymasterClient).toBeDefined();
    expect(typeof paymaster.getPaymasterClient).toBe('function');
  });

  it('should export account functions', async () => {
    const account = await import('../core/aa/account');

    expect(account.getSimpleSmartAccount).toBeDefined();
    expect(account.getSmartAccountAddress).toBeDefined();
    expect(account.isAccountDeployed).toBeDefined();
    expect(account.getSmartAccountState).toBeDefined();
    expect(account.clearAccountCache).toBeDefined();
    expect(account.getCachedAccount).toBeDefined();
  });

  it('should export SmartAccountSigner', async () => {
    const adapters = await import('../core/signer/adapters');

    expect(adapters.SmartAccountSigner).toBeDefined();
  });

  it('should export from main index', async () => {
    const main = await import('../index');

    // AA exports
    expect(main.getBundlerClient).toBeDefined();
    expect(main.getPaymasterClient).toBeDefined();
    expect(main.getSimpleSmartAccount).toBeDefined();
    expect(main.getSmartAccountAddress).toBeDefined();
    expect(main.isAccountDeployed).toBeDefined();
    expect(main.getSmartAccountState).toBeDefined();
    expect(main.clearAccountCache).toBeDefined();
    expect(main.SmartAccountSigner).toBeDefined();
    expect(main.useSmartAccount).toBeDefined();
    expect(main.useSmartAccountAddress).toBeDefined();
    expect(main.useIsSmartAccountDeployed).toBeDefined();
  });
});

describe('Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAccountCache();
  });

  it('should create end-to-end smart account flow', async () => {
    // 1. Create EOA signer
    const evmSigner = createMockEVMSigner();

    // 2. Create smart account
    const smartAccount = await getSimpleSmartAccount(evmSigner, TEST_CHAIN);
    expect(smartAccount.address).toBeDefined();

    // 3. Create smart account signer
    const signer = new SmartAccountSigner(smartAccount, TEST_CHAIN);
    expect(signer.address).toBe(smartAccount.address);

    // 4. Get smart account state
    const state = await getSmartAccountState(evmSigner, TEST_CHAIN);
    expect(state.type).toBe('simple');
    expect(state.chainId).toBe(TEST_CHAIN.chainId);
  });

  it('should handle sponsored transaction flow', async () => {
    const evmSigner = createMockEVMSigner();
    const smartAccount = await getSimpleSmartAccount(evmSigner, TEST_CHAIN);

    // Create signer with paymaster
    const signer = new SmartAccountSigner(smartAccount, TEST_CHAIN, 'test-api-key');

    expect(signer.hasPaymaster()).toBe(true);

    // Send sponsored transaction
    const hash = await signer.sendTransaction({
      to: '0x1234567890123456789012345678901234567890',
      value: 0n,
      data: '0x',
    });

    expect(hash).toMatch(/^0x/);
  });
});

// ============================================
// P2: AA Enhancement Tests
// ============================================

describe('P2: Gas Estimation Types', () => {
  it('should define valid GasCostEstimate structure', () => {
    const estimate: GasCostEstimate = {
      totalGas: 250000n,
      costInWei: 5000000000000000n,
      costInEth: '0.005',
      costInUsd: 15.5,
      isSponsored: false,
    };

    expect(estimate.totalGas).toBe(250000n);
    expect(estimate.costInWei).toBe(5000000000000000n);
    expect(estimate.costInEth).toBe('0.005');
    expect(estimate.costInUsd).toBe(15.5);
    expect(estimate.isSponsored).toBe(false);
  });

  it('should allow optional costInUsd', () => {
    const estimate: GasCostEstimate = {
      totalGas: 100000n,
      costInWei: 1000000000000000n,
      costInEth: '0.001',
      isSponsored: true,
    };

    expect(estimate.costInUsd).toBeUndefined();
    expect(estimate.isSponsored).toBe(true);
  });
});

describe('P2: Paymaster Types', () => {
  it('should define valid PaymasterStrategy types', () => {
    const strategies: PaymasterStrategy[] = ['always', 'never', 'conditional'];
    expect(strategies).toHaveLength(3);
  });

  it('should define valid SponsorshipCondition structure', () => {
    const condition: SponsorshipCondition = {
      maxValue: 1000000000000000000n,
      allowedContracts: ['0x1234567890123456789012345678901234567890'],
    };

    expect(condition.maxValue).toBe(1000000000000000000n);
    expect(condition.allowedContracts).toHaveLength(1);
  });

  it('should define valid PaymasterContext structure', () => {
    const context: PaymasterContext = {
      isSponsored: true,
      paymasterAddress: '0x1234567890123456789012345678901234567890',
      sponsorReason: 'Test Sponsor',
    };

    expect(context.isSponsored).toBe(true);
    expect(context.paymasterAddress).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(context.sponsorReason).toBe('Test Sponsor');
  });

  it('should allow minimal PaymasterContext', () => {
    const context: PaymasterContext = {
      isSponsored: false,
    };

    expect(context.isSponsored).toBe(false);
    expect(context.paymasterAddress).toBeUndefined();
  });
});

describe('P2: Session Key Types', () => {
  it('should define valid SessionKeyPermission structure', () => {
    const permission: SessionKeyPermission = {
      target: '0x1234567890123456789012345678901234567890',
      selectors: ['0xa9059cbb', '0x23b872dd'],
      maxValue: 1000000000000000000n,
      maxCalls: 100,
    };

    expect(permission.target).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(permission.selectors).toHaveLength(2);
    expect(permission.maxValue).toBe(1000000000000000000n);
    expect(permission.maxCalls).toBe(100);
  });

  it('should allow minimal SessionKeyPermission', () => {
    const permission: SessionKeyPermission = {
      target: '0x1234567890123456789012345678901234567890',
    };

    expect(permission.target).toBeDefined();
    expect(permission.selectors).toBeUndefined();
    expect(permission.maxValue).toBeUndefined();
  });

  it('should define valid SessionKeyConfig structure', () => {
    const config: SessionKeyConfig = {
      permissions: [
        { target: '0x1234567890123456789012345678901234567890' },
      ],
      validityPeriod: 3600,
      maxTransactions: 50,
      name: 'Test Session',
    };

    expect(config.permissions).toHaveLength(1);
    expect(config.validityPeriod).toBe(3600);
    expect(config.maxTransactions).toBe(50);
    expect(config.name).toBe('Test Session');
  });

  it('should define valid SessionKeyState structure', () => {
    const now = Math.floor(Date.now() / 1000);
    const state: SessionKeyState = {
      address: '0x1234567890123456789012345678901234567890',
      encryptedPrivateKey: 'encrypted-data-here',
      permissions: [
        { target: '0x1234567890123456789012345678901234567890' },
      ],
      createdAt: now,
      expiresAt: now + 3600,
      txCount: 5,
      maxTransactions: 50,
      name: 'Test Session',
      smartAccountAddress: '0x0987654321098765432109876543210987654321',
      chainId: 11155111,
      isRevoked: false,
    };

    expect(state.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(state.encryptedPrivateKey).toBeTruthy();
    expect(state.permissions).toHaveLength(1);
    expect(state.txCount).toBe(5);
    expect(state.isRevoked).toBe(false);
  });

  it('should define valid SessionKeyValidation structure', () => {
    const validation: SessionKeyValidation = {
      isValid: true,
      expiresIn: 3500,
      remainingTxs: 45,
    };

    expect(validation.isValid).toBe(true);
    expect(validation.expiresIn).toBe(3500);
    expect(validation.remainingTxs).toBe(45);
  });

  it('should show invalid reason in SessionKeyValidation', () => {
    const validation: SessionKeyValidation = {
      isValid: false,
      reason: 'Session key has expired',
    };

    expect(validation.isValid).toBe(false);
    expect(validation.reason).toBe('Session key has expired');
  });
});

describe('P2: Gas Price Utilities', () => {
  it('should format gas estimate correctly', () => {
    const result = formatGasEstimate({
      callGasLimit: 50000n,
      preVerificationGas: 50000n,
      verificationGasLimit: 100000n,
      maxFeePerGas: 25000000000n,
    });

    expect(result.totalGas).toBe(200000n);
    expect(result.costInWei).toBe(5000000000000000n);
    expect(result.costInEth).toBe('0.005000');
  });

  it('should handle zero gas estimate', () => {
    const result = formatGasEstimate({
      callGasLimit: 0n,
      preVerificationGas: 0n,
      verificationGasLimit: 0n,
      maxFeePerGas: 0n,
    });

    expect(result.totalGas).toBe(0n);
    expect(result.costInWei).toBe(0n);
    expect(result.costInEth).toBe('0.000000');
  });
});

describe('P2: Session Key Permission Helpers', () => {
  it('should create ERC20 transfer permission', () => {
    const tokenAddress = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as const;
    const permission = createERC20TransferPermission(tokenAddress);

    expect(permission.target).toBe(tokenAddress);
    // transfer(address,uint256) selector
    expect(permission.selectors).toContain('0xa9059cbb');
    expect(permission.maxValue).toBe(0n); // ERC20 calls don't send ETH
  });

  it('should create native transfer permission', () => {
    const recipient = '0x1234567890123456789012345678901234567890' as const;
    const permission = createNativeTransferPermission(recipient);

    expect(permission.target).toBe(recipient);
    // Empty selectors means any function (including receive)
    expect(permission.selectors).toEqual([]);
  });

  it('should create native transfer permission with max value', () => {
    const recipient = '0x1234567890123456789012345678901234567890' as const;
    const maxValue = 1000000000000000000n;
    const permission = createNativeTransferPermission(recipient, maxValue);

    expect(permission.target).toBe(recipient);
    expect(permission.maxValue).toBe(maxValue);
  });

  it('should create contract permission', () => {
    const contract = '0xdead000000000000000000000000000000000000' as const;
    const selectors: `0x${string}`[] = ['0xabcd1234', '0xef567890'];
    const permission = createContractPermission(contract, selectors);

    expect(permission.target).toBe(contract);
    expect(permission.selectors).toEqual(selectors);
  });

  it('should create contract permission with max value', () => {
    const contract = '0xdead000000000000000000000000000000000000' as const;
    const selectors: `0x${string}`[] = ['0xabcd1234'];
    const maxValue = 1000000000000000000n;
    const permission = createContractPermission(contract, selectors, maxValue);

    expect(permission.target).toBe(contract);
    expect(permission.maxValue).toBe(maxValue);
  });
});

describe('P2: SessionKeyManager', () => {
  const testPassword = 'test-password-123';
  const testSmartAccount = '0x1234567890123456789012345678901234567890' as const;
  const testChainId = 11155111;

  beforeEach(() => {
    // Clear localStorage for each test
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
  });

  it('should create session key', async () => {
    const manager = new SessionKeyManager(testSmartAccount, testChainId);
    const config: SessionKeyConfig = {
      permissions: [
        { target: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' },
      ],
      validityPeriod: 3600,
      name: 'Test Session',
    };

    const sessionKey = await manager.createSessionKey(config, testPassword);

    expect(sessionKey.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(sessionKey.permissions).toHaveLength(1);
    expect(sessionKey.name).toBe('Test Session');
    expect(sessionKey.isRevoked).toBe(false);
  });

  it('should create session key with max transactions', async () => {
    const manager = new SessionKeyManager(testSmartAccount, testChainId);
    const config: SessionKeyConfig = {
      permissions: [
        { target: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' },
      ],
      validityPeriod: 3600,
      maxTransactions: 100,
    };

    const sessionKey = await manager.createSessionKey(config, testPassword);

    expect(sessionKey.maxTransactions).toBe(100);
    expect(sessionKey.txCount).toBe(0);
  });

  it('should get all session keys', async () => {
    const manager = new SessionKeyManager(testSmartAccount, testChainId);
    const config: SessionKeyConfig = {
      permissions: [
        { target: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' },
      ],
      validityPeriod: 3600,
    };

    await manager.createSessionKey(config, testPassword);
    await manager.createSessionKey(config, testPassword);

    const keys = manager.getAllSessionKeys();
    expect(keys.length).toBe(2);
  });

  it('should get active session keys only (excluding expired)', async () => {
    const manager = new SessionKeyManager(testSmartAccount, testChainId);
    const activeConfig: SessionKeyConfig = {
      permissions: [
        { target: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' },
      ],
      validityPeriod: 3600,
    };

    const expiredConfig: SessionKeyConfig = {
      permissions: [
        { target: '0xdead000000000000000000000000000000000000' },
      ],
      validityPeriod: -10, // Already expired (negative)
    };

    await manager.createSessionKey(activeConfig, testPassword);
    await manager.createSessionKey(expiredConfig, testPassword);

    // getAllSessionKeys without includeExpired filters out expired
    const activeKeys = manager.getAllSessionKeys(false);
    expect(activeKeys.length).toBe(1);

    // getAllSessionKeys with includeExpired shows all
    const allKeys = manager.getAllSessionKeys(true);
    expect(allKeys.length).toBe(2);
  });

  it('should revoke session key', async () => {
    const manager = new SessionKeyManager(testSmartAccount, testChainId);
    const config: SessionKeyConfig = {
      permissions: [
        { target: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' },
      ],
      validityPeriod: 3600,
    };

    const sessionKey = await manager.createSessionKey(config, testPassword);
    expect(sessionKey.isRevoked).toBe(false);

    const revoked = manager.revokeSessionKey(sessionKey.address);
    expect(revoked).toBe(true);

    const session = manager.getSessionKey(sessionKey.address);
    expect(session?.isRevoked).toBe(true);
  });

  it('should validate session key', async () => {
    const manager = new SessionKeyManager(testSmartAccount, testChainId);
    const config: SessionKeyConfig = {
      permissions: [
        { target: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' },
      ],
      validityPeriod: 3600,
      maxTransactions: 10,
    };

    const sessionKey = await manager.createSessionKey(config, testPassword);

    const validation = manager.validateSessionKey(sessionKey.address);
    expect(validation.isValid).toBe(true);
    expect(validation.remainingTxs).toBe(10);
    expect(validation.expiresIn).toBeGreaterThan(0);
  });

  it('should detect expired session key', async () => {
    const manager = new SessionKeyManager(testSmartAccount, testChainId);
    const config: SessionKeyConfig = {
      permissions: [
        { target: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' },
      ],
      validityPeriod: -10, // Already expired
    };

    const sessionKey = await manager.createSessionKey(config, testPassword);

    const validation = manager.validateSessionKey(sessionKey.address);
    expect(validation.isValid).toBe(false);
    expect(validation.reason).toBe('Session key has expired');
  });

  it('should detect revoked session key', async () => {
    const manager = new SessionKeyManager(testSmartAccount, testChainId);
    const config: SessionKeyConfig = {
      permissions: [
        { target: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' },
      ],
      validityPeriod: 3600,
    };

    const sessionKey = await manager.createSessionKey(config, testPassword);
    manager.revokeSessionKey(sessionKey.address);

    const validation = manager.validateSessionKey(sessionKey.address);
    expect(validation.isValid).toBe(false);
    expect(validation.reason).toBe('Session key has been revoked');
  });

  it('should validate transaction permission', async () => {
    const manager = new SessionKeyManager(testSmartAccount, testChainId);
    const tokenAddress = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as const;
    const config: SessionKeyConfig = {
      permissions: [createERC20TransferPermission(tokenAddress)],
      validityPeriod: 3600,
    };

    const sessionKey = await manager.createSessionKey(config, testPassword);

    // Transfer selector (0xa9059cbb)
    const result = manager.validateTransaction(
      sessionKey.address,
      tokenAddress,
      '0xa9059cbb'
    );

    expect(result.allowed).toBe(true);
  });

  it('should reject transaction to unauthorized target', async () => {
    const manager = new SessionKeyManager(testSmartAccount, testChainId);
    const tokenAddress = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as const;
    const config: SessionKeyConfig = {
      permissions: [createERC20TransferPermission(tokenAddress)],
      validityPeriod: 3600,
    };

    const sessionKey = await manager.createSessionKey(config, testPassword);

    const result = manager.validateTransaction(
      sessionKey.address,
      '0xdead000000000000000000000000000000000000',
      '0xa9059cbb'
    );

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('Target contract not allowed');
  });

  it('should record transaction and increment count', async () => {
    const manager = new SessionKeyManager(testSmartAccount, testChainId);
    const config: SessionKeyConfig = {
      permissions: [
        { target: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' },
      ],
      validityPeriod: 3600,
      maxTransactions: 10,
    };

    const sessionKey = await manager.createSessionKey(config, testPassword);
    expect(sessionKey.txCount).toBe(0);

    manager.recordTransaction(sessionKey.address);

    const session = manager.getSessionKey(sessionKey.address);
    expect(session?.txCount).toBe(1);
  });

  it('should detect max transactions exceeded', async () => {
    const manager = new SessionKeyManager(testSmartAccount, testChainId);
    const config: SessionKeyConfig = {
      permissions: [
        { target: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' },
      ],
      validityPeriod: 3600,
      maxTransactions: 1,
    };

    const sessionKey = await manager.createSessionKey(config, testPassword);
    manager.recordTransaction(sessionKey.address);

    const validation = manager.validateSessionKey(sessionKey.address);
    expect(validation.isValid).toBe(false);
    expect(validation.reason).toBe('Transaction limit reached');
  });

  it('should cleanup expired and revoked sessions', async () => {
    const manager = new SessionKeyManager(testSmartAccount, testChainId);
    const activeConfig: SessionKeyConfig = {
      permissions: [{ target: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' }],
      validityPeriod: 3600,
    };

    const expiredConfig: SessionKeyConfig = {
      permissions: [{ target: '0xdead000000000000000000000000000000000000' }],
      validityPeriod: -10, // Already expired
    };

    await manager.createSessionKey(activeConfig, testPassword);
    await manager.createSessionKey(expiredConfig, testPassword);

    const allBefore = manager.getAllSessionKeys(true);
    expect(allBefore.length).toBe(2);

    const removed = manager.cleanupSessions();
    expect(removed).toBe(1);

    const allAfter = manager.getAllSessionKeys(true);
    expect(allAfter.length).toBe(1);
  });

  it('should revoke all session keys', async () => {
    const manager = new SessionKeyManager(testSmartAccount, testChainId);
    const config: SessionKeyConfig = {
      permissions: [
        { target: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' },
      ],
      validityPeriod: 3600,
    };

    await manager.createSessionKey(config, testPassword);
    await manager.createSessionKey(config, testPassword);
    await manager.createSessionKey(config, testPassword);

    manager.revokeAllSessionKeys();

    const keys = manager.getAllSessionKeys(true);
    expect(keys.every((k) => k.isRevoked)).toBe(true);
  });
});

describe('P2: SmartAccountSigner Gas Estimation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAccountCache();
  });

  it('should have estimateGas method', async () => {
    const evmSigner = createMockEVMSigner();
    const smartAccount = await getSimpleSmartAccount(evmSigner, TEST_CHAIN);
    const signer = new SmartAccountSigner(smartAccount, TEST_CHAIN, 'test-api-key');

    expect(typeof signer.estimateGas).toBe('function');
  });

  it('should have estimateBatchGas method', async () => {
    const evmSigner = createMockEVMSigner();
    const smartAccount = await getSimpleSmartAccount(evmSigner, TEST_CHAIN);
    const signer = new SmartAccountSigner(smartAccount, TEST_CHAIN, 'test-api-key');

    expect(typeof signer.estimateBatchGas).toBe('function');
  });

  it('should have getPaymasterContext method', async () => {
    const evmSigner = createMockEVMSigner();
    const smartAccount = await getSimpleSmartAccount(evmSigner, TEST_CHAIN);
    const signer = new SmartAccountSigner(smartAccount, TEST_CHAIN, 'test-api-key');

    expect(typeof signer.getPaymasterContext).toBe('function');
  });

  it('should have sendTransactionWithFallback method', async () => {
    const evmSigner = createMockEVMSigner();
    const smartAccount = await getSimpleSmartAccount(evmSigner, TEST_CHAIN);
    const signer = new SmartAccountSigner(smartAccount, TEST_CHAIN, 'test-api-key');

    expect(typeof signer.sendTransactionWithFallback).toBe('function');
  });

  it('should return default gas estimate on error', async () => {
    const evmSigner = createMockEVMSigner();
    const smartAccount = await getSimpleSmartAccount(evmSigner, TEST_CHAIN);
    const signer = new SmartAccountSigner(smartAccount, TEST_CHAIN, 'test-api-key');

    // The mock doesn't implement estimateUserOperationGas, so it falls back to defaults
    const estimate = await signer.estimateGas({
      to: '0x1234567890123456789012345678901234567890',
      value: 1000000000000000000n,
    });

    expect(estimate).toBeDefined();
    expect(estimate.totalGas).toBeGreaterThanOrEqual(0n);
    expect(estimate.costInWei).toBeGreaterThanOrEqual(0n);
    expect(estimate.costInEth).toBeTruthy();
    expect(typeof estimate.isSponsored).toBe('boolean');
  });
});

describe('P2: Module Exports (Enhancement)', () => {
  it('should export P2 gas utilities from bundler', async () => {
    const bundler = await import('../core/aa/bundler');

    expect(bundler.getGasPrices).toBeDefined();
    expect(bundler.formatGasEstimate).toBeDefined();
    expect(typeof bundler.getGasPrices).toBe('function');
    expect(typeof bundler.formatGasEstimate).toBe('function');
  });

  it('should export session key utilities', async () => {
    const sessionKeys = await import('../core/aa/session-keys');

    expect(sessionKeys.SessionKeyManager).toBeDefined();
    expect(sessionKeys.createERC20TransferPermission).toBeDefined();
    expect(sessionKeys.createNativeTransferPermission).toBeDefined();
    expect(sessionKeys.createContractPermission).toBeDefined();
  });

  it('should export SessionKeySigner from adapters', async () => {
    const adapters = await import('../core/signer/adapters');

    expect(adapters.SessionKeySigner).toBeDefined();
  });

  it('should export P2 types from main index', async () => {
    const main = await import('../index');

    // P2 Gas utilities
    expect(main.getGasPrices).toBeDefined();
    expect(main.formatGasEstimate).toBeDefined();

    // P2 Session Key utilities
    expect(main.SessionKeyManager).toBeDefined();
    expect(main.createERC20TransferPermission).toBeDefined();
    expect(main.createNativeTransferPermission).toBeDefined();
    expect(main.createContractPermission).toBeDefined();
    expect(main.SessionKeySigner).toBeDefined();

    // P2 Hooks
    expect(main.useGaslessTransaction).toBeDefined();
    expect(main.useIsGaslessAvailable).toBeDefined();
    expect(main.useSessionKey).toBeDefined();
    expect(main.useActiveSessionCount).toBeDefined();
    expect(main.useSessionKeyValidation).toBeDefined();
  });
});
