import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getCollectionFromType, getNFTImageUrl, buildDisplayFromContent } from '../sui/nft';
import type { NFTDisplay, NFTInfo } from '../types/nft';

// Mock the SuiClient
vi.mock('@mysten/sui/client', () => ({
  SuiClient: vi.fn().mockImplementation(() => ({
    getOwnedObjects: vi.fn(),
    getObject: vi.fn(),
  })),
  getFullnodeUrl: vi.fn(() => 'https://rpc.devnet.nasun.io'),
}));

describe('NFT Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getCollectionFromType', () => {
    it('should extract collection name from standard type', () => {
      const type = '0x1234567890abcdef::my_collection::NFT';
      expect(getCollectionFromType(type)).toBe('my_collection');
    });

    it('should extract collection from complex type', () => {
      const type = '0xabcd::sui_punks::SuiPunk';
      expect(getCollectionFromType(type)).toBe('sui_punks');
    });

    it('should return Unknown Collection for invalid type', () => {
      const type = 'invalid';
      expect(getCollectionFromType(type)).toBe('Unknown Collection');
    });

    it('should handle empty type string', () => {
      expect(getCollectionFromType('')).toBe('Unknown Collection');
    });

    it('should handle type with only package address', () => {
      const type = '0x1234';
      expect(getCollectionFromType(type)).toBe('Unknown Collection');
    });

    it('should handle type with many parts', () => {
      const type = '0x123::collection::module::extra';
      expect(getCollectionFromType(type)).toBe('collection');
    });
  });

  describe('getNFTImageUrl', () => {
    it('should prefer thumbnail_url over image_url', () => {
      const display: NFTDisplay = {
        image_url: 'https://example.com/full.png',
        thumbnail_url: 'https://example.com/thumb.png',
      };
      expect(getNFTImageUrl(display)).toBe('https://example.com/thumb.png');
    });

    it('should fall back to image_url when thumbnail is missing', () => {
      const display: NFTDisplay = {
        image_url: 'https://example.com/full.png',
      };
      expect(getNFTImageUrl(display)).toBe('https://example.com/full.png');
    });

    it('should return undefined when no images available', () => {
      const display: NFTDisplay = {
        name: 'My NFT',
      };
      expect(getNFTImageUrl(display)).toBeUndefined();
    });

    it('should return undefined for empty display', () => {
      const display: NFTDisplay = {};
      expect(getNFTImageUrl(display)).toBeUndefined();
    });

    it('should handle IPFS URLs', () => {
      const display: NFTDisplay = {
        image_url: 'ipfs://QmXxx123/image.png',
      };
      expect(getNFTImageUrl(display)).toBe('ipfs://QmXxx123/image.png');
    });
  });

  describe('NFTInfo Type', () => {
    it('should have correct structure', () => {
      const nft: NFTInfo = {
        objectId: '0x123',
        version: '1',
        digest: 'abc123',
        type: '0xabc::collection::NFT',
        display: {
          name: 'Cool NFT',
          description: 'A very cool NFT',
          image_url: 'https://example.com/nft.png',
          creator: '0xcreator',
        },
      };

      expect(nft.objectId).toBe('0x123');
      expect(nft.type).toBe('0xabc::collection::NFT');
      expect(nft.display.name).toBe('Cool NFT');
      expect(nft.display.creator).toBe('0xcreator');
    });

    it('should allow optional content field', () => {
      const nft: NFTInfo = {
        objectId: '0x456',
        version: '2',
        digest: 'def456',
        type: '0xdef::art::Artwork',
        display: {
          name: 'Artwork #1',
        },
        content: {
          rarity: 'legendary',
          attributes: ['blue', 'rare'],
        },
      };

      expect(nft.content?.rarity).toBe('legendary');
    });
  });

  describe('NFTDisplay Type', () => {
    it('should have all standard Sui Display fields', () => {
      const display: NFTDisplay = {
        name: 'Test NFT',
        description: 'Description',
        image_url: 'https://example.com/image.png',
        thumbnail_url: 'https://example.com/thumb.png',
        link: 'https://marketplace.com/nft/123',
        project_url: 'https://myproject.com',
        creator: 'Artist Name',
      };

      expect(display.name).toBe('Test NFT');
      expect(display.description).toBe('Description');
      expect(display.image_url).toBe('https://example.com/image.png');
      expect(display.thumbnail_url).toBe('https://example.com/thumb.png');
      expect(display.link).toBe('https://marketplace.com/nft/123');
      expect(display.project_url).toBe('https://myproject.com');
      expect(display.creator).toBe('Artist Name');
    });

    it('should allow all fields to be optional', () => {
      const display: NFTDisplay = {};
      expect(display.name).toBeUndefined();
      expect(display.image_url).toBeUndefined();
    });
  });

  describe('buildDisplayFromContent', () => {
    it('should extract name and description from content', () => {
      const content = {
        name: 'VoteProofNFT',
        description: 'Proof of voting',
      };

      const display = buildDisplayFromContent(content);
      expect(display.name).toBe('VoteProofNFT');
      expect(display.description).toBe('Proof of voting');
    });

    it('should map url field to image_url', () => {
      const content = {
        name: 'My NFT',
        url: 'https://example.com/image.jpg',
      };

      const display = buildDisplayFromContent(content);
      expect(display.image_url).toBe('https://example.com/image.jpg');
    });

    it('should prefer image_url over url', () => {
      const content = {
        name: 'My NFT',
        image_url: 'https://example.com/image_url.jpg',
        url: 'https://example.com/url.jpg',
      };

      const display = buildDisplayFromContent(content);
      expect(display.image_url).toBe('https://example.com/image_url.jpg');
    });

    it('should handle image field (alternative naming)', () => {
      const content = {
        name: 'My NFT',
        image: 'https://example.com/image.jpg',
      };

      const display = buildDisplayFromContent(content);
      expect(display.image_url).toBe('https://example.com/image.jpg');
    });

    it('should handle img_url field (alternative naming)', () => {
      const content = {
        name: 'My NFT',
        img_url: 'https://example.com/img.jpg',
      };

      const display = buildDisplayFromContent(content);
      expect(display.image_url).toBe('https://example.com/img.jpg');
    });

    it('should return empty object for undefined content', () => {
      const display = buildDisplayFromContent(undefined);
      expect(display).toEqual({});
    });

    it('should handle VoteProofNFT pattern (real-world case)', () => {
      // This is the actual structure from proposal::VoteProofNFT
      const content = {
        name: 'NFT Who should be the protagonist of Season 1?',
        description: 'Proof of votting on 8fb7a5bc3fb5793adaf71afbeeb04a9ed32d4c472bb6791554d42da366df7e80',
        url: 'https://thrangra.sirv.com/vote_yes_nft.jpg',
        proposal_id: '0x8fb7a5bc3fb5793adaf71afbeeb04a9ed32d4c472bb6791554d42da366df7e80',
      };

      const display = buildDisplayFromContent(content);
      expect(display.name).toBe('NFT Who should be the protagonist of Season 1?');
      expect(display.description).toBe('Proof of votting on 8fb7a5bc3fb5793adaf71afbeeb04a9ed32d4c472bb6791554d42da366df7e80');
      expect(display.image_url).toBe('https://thrangra.sirv.com/vote_yes_nft.jpg');
    });

    it('should extract all standard fields from content', () => {
      const content = {
        name: 'Full NFT',
        description: 'Description here',
        url: 'https://example.com/image.jpg',
        thumbnail_url: 'https://example.com/thumb.jpg',
        link: 'https://marketplace.com/nft',
        project_url: 'https://project.com',
        creator: 'Artist',
      };

      const display = buildDisplayFromContent(content);
      expect(display.name).toBe('Full NFT');
      expect(display.description).toBe('Description here');
      expect(display.image_url).toBe('https://example.com/image.jpg');
      expect(display.thumbnail_url).toBe('https://example.com/thumb.jpg');
      expect(display.link).toBe('https://marketplace.com/nft');
      expect(display.project_url).toBe('https://project.com');
      expect(display.creator).toBe('Artist');
    });
  });
});
