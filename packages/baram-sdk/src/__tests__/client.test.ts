import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaramClient } from '../client';
import { NoExecutorError } from '../errors';
import type { BaramConfig } from '../types';

// Mock SuiClient
vi.mock('@mysten/sui/client', () => ({
  SuiClient: vi.fn().mockImplementation(() => ({
    getCoins: vi.fn(),
    signAndExecuteTransaction: vi.fn(),
    getDynamicFields: vi.fn(),
    getObject: vi.fn(),
    queryEvents: vi.fn(),
  })),
}));

// Mock service modules
vi.mock('../services/executor', () => ({
  fetchExecutors: vi.fn(),
  selectExecutorWeightedRandom: vi.fn(),
}));

vi.mock('../services/coin', () => ({
  getNusdcCoins: vi.fn(),
}));

vi.mock('../services/ecr', () => ({
  fetchECRByRequestId: vi.fn(),
}));

vi.mock('../services/tee', () => ({
  encryptForTee: vi.fn().mockResolvedValue({
    encrypted: 'mock-encrypted-prompt',
    aesKeyBytes: new Uint8Array(32),
  }),
  decryptResponse: vi.fn().mockResolvedValue('decrypted TEE response'),
  clearPublicKeyCache: vi.fn(),
}));

const mockConfig: BaramConfig = {
  rpcUrl: 'https://rpc.devnet.nasun.io',
  baram: { packageId: '0xaaa', registryId: '0xbbb' },
  executor: { packageId: '0xccc', registryId: '0xddd', processedRequestsId: '0xeee', tierRegistryId: '0xfff' },
  compliance: { packageId: '0x111', registryId: '0x222' },
  tokens: { nusdcType: '0x333::nusdc::NUSDC' },
};

const mockSigner = {
  toSuiAddress: () => '0xsigner',
  signTransaction: vi.fn(),
  // Minimal keypair mock
} as any;

describe('BaramClient', () => {
  let client: BaramClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new BaramClient({
      config: mockConfig,
      signer: mockSigner,
      executorTimeoutMs: 5000,
      ecrPollIntervalMs: 100,
      ecrPollRetries: 2,
    });
  });

  describe('constructor', () => {
    it('sets address from signer', () => {
      expect(client.getAddress()).toBe('0xsigner');
    });

    it('uses default options when not provided', () => {
      const defaultClient = new BaramClient({
        config: mockConfig,
        signer: mockSigner,
      });
      expect(defaultClient.getAddress()).toBe('0xsigner');
    });
  });

  describe('execute()', () => {
    it('throws BaramError for unknown model', async () => {
      await expect(
        client.execute({ prompt: 'test', model: 'nonexistent-model' }),
      ).rejects.toThrow('Unknown model');
    });

    it('throws NoExecutorError when no executors available', async () => {
      const { fetchExecutors } = await import('../services/executor');
      const { selectExecutorWeightedRandom } = await import('../services/executor');
      vi.mocked(fetchExecutors).mockResolvedValue([]);
      vi.mocked(selectExecutorWeightedRandom).mockReturnValue(null);

      await expect(
        client.execute({ prompt: 'test', model: 'llama-3.3-70b-versatile' }),
      ).rejects.toThrow(NoExecutorError);
    });
  });

  describe('execute() with TEE executor', () => {
    it('uses TEE encryption when executor.teeType > 0', async () => {
      const { fetchExecutors, selectExecutorWeightedRandom } = await import('../services/executor');
      const { getNusdcCoins } = await import('../services/coin');
      const { encryptForTee, decryptResponse } = await import('../services/tee');
      const { SuiClient } = await import('@mysten/sui/client');

      const validAddr = '0x' + 'ab'.repeat(32);
      const teeExecutor = {
        id: '0xexec',
        operator: validAddr,
        name: 'TEE Executor',
        endpointUrl: 'https://tee.example.com',
        teeType: 1 as const,
        teeTypeName: 'AWS Nitro',
        supportedModels: ['llama-3.3-70b-versatile'],
        reputation: 500,
        completedJobs: 10,
        failedJobs: 0,
        registeredAt: Date.now(),
        lastActiveAt: Date.now(),
        isActive: true,
        tier: 1 as const,
        tierName: 'Bronze' as const,
        isDormant: false,
      };

      vi.mocked(fetchExecutors).mockResolvedValue([teeExecutor]);
      vi.mocked(selectExecutorWeightedRandom).mockReturnValue(teeExecutor);
      vi.mocked(getNusdcCoins).mockResolvedValue([{ objectId: '0xcoin', version: '1', digest: 'abc' }]);

      const mockSuiClient = vi.mocked(SuiClient).mock.results[0]?.value;
      if (mockSuiClient) {
        mockSuiClient.signAndExecuteTransaction.mockResolvedValue({
          digest: '0xtxdigest',
          events: [{ parsedJson: { request_id: '42' }, type: '::baram::RequestCreated' }],
        });
      }

      // Mock fetch for executor /execute call (not /public-key, that's mocked in tee module)
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          result: 'encrypted-response-data',
          encrypted: true,
          resultHash: '0xhash',
          executionTimeMs: 1200,
          txDigest: '0xsettlement',
        }),
      });
      vi.stubGlobal('fetch', fetchSpy);

      const { fetchECRByRequestId } = await import('../services/ecr');
      vi.mocked(fetchECRByRequestId).mockResolvedValue(null);

      const result = await client.execute({
        prompt: 'Analyze BTC risk',
        model: 'llama-3.3-70b-versatile',
      });

      // Verify TEE encryption was used
      expect(encryptForTee).toHaveBeenCalledWith('Analyze BTC risk', 'https://tee.example.com');
      expect(result.teeEncrypted).toBe(true);

      // Verify encrypted prompt was sent to executor
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://tee.example.com/execute',
        expect.objectContaining({
          body: expect.stringContaining('mock-encrypted-prompt'),
        }),
      );

      // Verify response was decrypted
      expect(decryptResponse).toHaveBeenCalledWith('encrypted-response-data', expect.any(Uint8Array));
      expect(result.response).toBe('decrypted TEE response');

      vi.unstubAllGlobals();
    });
  });

  describe('getBalance()', () => {
    it('sums coin balances', async () => {
      const { SuiClient } = await import('@mysten/sui/client');
      const mockSuiClient = vi.mocked(SuiClient).mock.results[0]?.value;
      if (mockSuiClient) {
        mockSuiClient.getCoins.mockResolvedValue({
          data: [
            { balance: '100000' },
            { balance: '200000' },
          ],
          hasNextPage: false,
          nextCursor: null,
        });
      }

      const balance = await client.getBalance();
      expect(balance).toBe(300000);
    });
  });
});
