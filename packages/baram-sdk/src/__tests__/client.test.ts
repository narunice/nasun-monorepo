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
        client.execute({ prompt: 'test', model: 'llama-3.1-8b-instant' }),
      ).rejects.toThrow(NoExecutorError);
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
