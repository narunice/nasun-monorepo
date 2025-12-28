import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NFTCard } from '../NFTCard';
import type { NFTInfo } from '@nasun/wallet';

// Mock @nasun/wallet
vi.mock('@nasun/wallet', () => ({
  getNFTImageUrl: vi.fn((display) => display.thumbnail_url || display.image_url),
  getCollectionFromType: vi.fn((type: string) => {
    const parts = type.split('::');
    return parts.length >= 2 ? parts[1] : 'Unknown Collection';
  }),
}));

describe('NFTCard', () => {
  const mockNFT: NFTInfo = {
    objectId: '0x123abc456def',
    version: '1',
    digest: 'abcdef123456',
    type: '0xpackage::cool_nfts::CoolNFT',
    display: {
      name: 'Cool NFT #42',
      description: 'A very cool NFT',
      image_url: 'https://example.com/nft.png',
      creator: 'Artist',
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render NFT name', () => {
      render(<NFTCard nft={mockNFT} />);
      expect(screen.getByText('Cool NFT #42')).toBeDefined();
    });

    it('should render collection name in normal mode', () => {
      render(<NFTCard nft={mockNFT} />);
      expect(screen.getByText('cool_nfts')).toBeDefined();
    });

    it('should render image with alt text', () => {
      render(<NFTCard nft={mockNFT} />);
      const img = screen.getByRole('img');
      expect(img).toBeDefined();
      expect(img.getAttribute('alt')).toBe('Cool NFT #42');
    });

    it('should show placeholder when no image', () => {
      const nftWithoutImage: NFTInfo = {
        ...mockNFT,
        display: {
          name: 'No Image NFT',
        },
      };

      render(<NFTCard nft={nftWithoutImage} />);
      expect(screen.getByText('No Image NFT')).toBeDefined();
      // Placeholder SVG should be rendered
      expect(screen.queryByRole('img')).toBeNull();
    });

    it('should render "Unnamed NFT" when name is missing', () => {
      const nftWithoutName: NFTInfo = {
        ...mockNFT,
        display: {
          image_url: 'https://example.com/image.png',
        },
      };

      render(<NFTCard nft={nftWithoutName} />);
      expect(screen.getByText('Unnamed NFT')).toBeDefined();
    });
  });

  describe('Compact Mode', () => {
    it('should render compact layout when compact prop is true', () => {
      render(<NFTCard nft={mockNFT} compact />);
      expect(screen.getByText('Cool NFT #42')).toBeDefined();
      // Collection name should not be shown in compact mode
      expect(screen.queryByText('cool_nfts')).toBeNull();
    });
  });

  describe('Click Handling', () => {
    it('should call onClick when card is clicked', () => {
      const onClick = vi.fn();
      render(<NFTCard nft={mockNFT} onClick={onClick} />);

      const card = screen.getByRole('button');
      fireEvent.click(card);

      expect(onClick).toHaveBeenCalledTimes(1);
      expect(onClick).toHaveBeenCalledWith(mockNFT);
    });

    it('should call onClick on Enter key press', () => {
      const onClick = vi.fn();
      render(<NFTCard nft={mockNFT} onClick={onClick} />);

      const card = screen.getByRole('button');
      fireEvent.keyDown(card, { key: 'Enter' });

      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('should call onClick on Space key press', () => {
      const onClick = vi.fn();
      render(<NFTCard nft={mockNFT} onClick={onClick} />);

      const card = screen.getByRole('button');
      fireEvent.keyDown(card, { key: ' ' });

      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('should not error when onClick is not provided', () => {
      render(<NFTCard nft={mockNFT} />);
      const card = screen.getByRole('button');
      expect(() => fireEvent.click(card)).not.toThrow();
    });
  });

  describe('Image Error Handling', () => {
    it('should show placeholder when image fails to load', () => {
      render(<NFTCard nft={mockNFT} />);

      const img = screen.getByRole('img');
      fireEvent.error(img);

      // After error, image should be replaced with placeholder
      expect(screen.queryByRole('img')).toBeNull();
    });
  });

  describe('Accessibility', () => {
    it('should have correct role and tabIndex', () => {
      render(<NFTCard nft={mockNFT} />);

      const card = screen.getByRole('button');
      expect(card.getAttribute('tabIndex')).toBe('0');
    });

    it('should have title attribute for truncated name', () => {
      render(<NFTCard nft={mockNFT} />);

      const nameElement = screen.getByText('Cool NFT #42');
      expect(nameElement.getAttribute('title')).toBe('Cool NFT #42');
    });
  });
});
