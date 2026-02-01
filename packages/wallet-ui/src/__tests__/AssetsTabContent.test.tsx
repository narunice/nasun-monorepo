import { describe, it, expect, vi } from 'vitest';
import { render, screen } from './setup';
import { AssetsTabContent } from '../connect/wallet-views/AssetsTabContent';

vi.mock('@nasun/wallet', () => ({
  requestFaucet: vi.fn(),
  getAllTokens: vi.fn(() => [
    { symbol: 'NSN', name: 'Nasun', decimals: 9, type: '0x2::sui::SUI' },
  ]),
  NATIVE_TOKEN: { symbol: 'NSN', name: 'Nasun', decimals: 9, type: '0x2::sui::SUI' },
  useNetwork: vi.fn(() => ({ network: 'devnet' })),
  useWallet: vi.fn(() => ({ status: 'unlocked', account: { address: '0x123' } })),
  useZkLogin: vi.fn(() => ({ isConnected: false, address: null })),
}));

// Mock TokenFaucetButton to keep tests simple
vi.mock('../balance/TokenFaucetButton', () => ({
  TokenFaucetButton: ({ symbol }: { symbol: string }) => (
    <button data-testid={`faucet-${symbol}`}>Faucet</button>
  ),
}));

// Mock NFTCard
vi.mock('../nft/NFTCard', () => ({
  NFTCard: ({ nft }: { nft: { name: string } }) => (
    <div data-testid="nft-card">{nft.name}</div>
  ),
}));

const defaultProps = {
  isEVM: false,
  chain: { name: 'Nasun Devnet', nativeCurrency: { symbol: 'NSN' } },
  storedEVMAddress: null as string | null,
  evmBalance: null as { display: string } | null,
  evmBalanceLoading: false,
  balances: {
    native: { formatted: '100.5' },
    tokens: {
      NBTC: { formatted: '0.5' },
    },
  },
  balancesLoading: false,
  networkType: 'devnet',
  getAllTokens: () => [
    { symbol: 'NSN' },
    { symbol: 'NBTC' },
    { symbol: 'NUSDC' },
  ],
  accumulatedNfts: [] as any[],
  nftsLoading: false,
  onSelectNFT: vi.fn(),
};

describe('AssetsTabContent', () => {
  describe('Move chain balances', () => {
    it('should show Token Balances header', () => {
      render(<AssetsTabContent {...defaultProps} />);
      expect(screen.getByText('Token Balances')).toBeInTheDocument();
    });

    it('should show native token balance', () => {
      render(<AssetsTabContent {...defaultProps} />);
      expect(screen.getByText('NSN')).toBeInTheDocument();
      expect(screen.getByText('100.5')).toBeInTheDocument();
    });

    it('should show additional tokens on devnet', () => {
      render(<AssetsTabContent {...defaultProps} />);
      expect(screen.getByText('NBTC')).toBeInTheDocument();
      expect(screen.getByText('NUSDC')).toBeInTheDocument();
    });

    it('should show loading skeleton when loading', () => {
      const { container } = render(
        <AssetsTabContent {...defaultProps} balancesLoading />
      );
      const pulseElements = container.querySelectorAll('.animate-pulse');
      expect(pulseElements.length).toBeGreaterThan(0);
    });
  });

  describe('EVM chain balances', () => {
    it('should show chain name in header when EVM', () => {
      render(<AssetsTabContent {...defaultProps} isEVM chain={{ name: 'Ethereum Sepolia', nativeCurrency: { symbol: 'ETH' } }} />);
      expect(screen.getByText('Token Balances (Ethereum Sepolia)')).toBeInTheDocument();
    });

    it('should show "EVM wallet not configured" when no stored address', () => {
      render(
        <AssetsTabContent {...defaultProps} isEVM storedEVMAddress={null} />
      );
      expect(screen.getByText('EVM wallet not configured')).toBeInTheDocument();
    });

    it('should show EVM balance when configured', () => {
      render(
        <AssetsTabContent
          {...defaultProps}
          isEVM
          storedEVMAddress="0xabc123"
          evmBalance={{ display: '1.234' }}
          chain={{ name: 'Sepolia', nativeCurrency: { symbol: 'ETH' } }}
        />
      );
      expect(screen.getByText('ETH')).toBeInTheDocument();
      expect(screen.getByText('1.234')).toBeInTheDocument();
    });
  });

  describe('NFT section', () => {
    it('should show "No NFTs found" when empty', () => {
      render(<AssetsTabContent {...defaultProps} />);
      expect(screen.getByText('No NFTs found')).toBeInTheDocument();
    });

    it('should show NFT count when present', () => {
      const nfts = [
        { objectId: '0x1', name: 'NFT 1', imageUrl: '', description: '' },
        { objectId: '0x2', name: 'NFT 2', imageUrl: '', description: '' },
      ];
      render(<AssetsTabContent {...defaultProps} accumulatedNfts={nfts} />);
      expect(screen.getByText('NFTs (2)')).toBeInTheDocument();
    });

    it('should not render NFT section for EVM chains', () => {
      render(<AssetsTabContent {...defaultProps} isEVM />);
      expect(screen.queryByText(/NFTs/)).not.toBeInTheDocument();
    });

    it('should show loading skeleton for NFTs', () => {
      const { container } = render(
        <AssetsTabContent {...defaultProps} nftsLoading />
      );
      // NFT loading skeletons are aspect-square
      const nftSkeletons = container.querySelectorAll('.aspect-square.animate-pulse');
      expect(nftSkeletons.length).toBe(3);
    });
  });
});
