/**
 * EthereumNFT Component
 *
 * Displays an Ethereum NFT card with image, metadata, and explorer link.
 * Follows the same pattern as SuiObject and IotaObject components.
 *
 * @module components/app/myAccount/EthereumNFT
 * @since 2025-11-13
 */

import { useTranslation } from 'react-i18next';
import { FC } from 'react';
import { ExternalLinkIcon } from '@radix-ui/react-icons';
import type { EthereumNFT as EthereumNFTType } from '../../../types/ethereum';
import { getEtherscanNFTUrl, getOpenSeaNFTUrl } from '../../../services/ethereumApi';

/**
 * Component Props
 */
interface EthereumNFTProps {
  nft: EthereumNFTType;
}

/**
 * EthereumNFT Component
 *
 * @param props - Component props
 * @returns JSX.Element
 */
export const EthereumNFT: FC<EthereumNFTProps> = ({ nft }) => {
  const { t } = useTranslation('myAccount');

  // Explorer URLs
  const etherscanUrl = getEtherscanNFTUrl(nft.contractAddress, nft.tokenId);
  const openSeaUrl = getOpenSeaNFTUrl(nft.contractAddress, nft.tokenId);

  // Image URL (prefer thumbnail for performance, fallback to full image)
  const imageUrl = nft.thumbnailUrl || nft.imageUrl;

  // Token ID display (truncate if too long)
  const tokenIdDisplay =
    nft.tokenId.length > 20
      ? `${nft.tokenId.slice(0, 10)}...${nft.tokenId.slice(-8)}`
      : nft.tokenId;

  // Contract address display (truncate)
  const contractDisplay = `${nft.contractAddress.slice(0, 6)}...${nft.contractAddress.slice(-4)}`;

  /**
   * Helper function to render a field only if it has a value
   */
  const renderFieldIfExists = (label: string, value?: string | number) => {
    if (!value) return null;

    const isUrl = typeof value === 'string' && value.startsWith('http');

    return (
      <div className="flex items-center gap-2">
        <p>
          <strong>{label}:</strong> {String(value)}
        </p>
        {isUrl && (
          <a
            href={value}
            target="_blank"
            rel="noopener noreferrer"
            title={`Open ${label} in new tab`}
            className="text-gray-500 hover:text-gray-300"
          >
            <ExternalLinkIcon />
          </a>
        )}
      </div>
    );
  };

  /**
   * Render NFT attributes/traits
   */
  const renderAttributes = () => {
    if (!nft.attributes || nft.attributes.length === 0) return null;

    return (
      <div className="mt-2">
        <strong>{t('nft.attributes', 'Attributes')}:</strong>
        <div className="mt-1 flex flex-wrap gap-2">
          {nft.attributes.map((attr, index) => (
            <span
              key={index}
              className="px-2 py-1 text-xs rounded bg-gray-800 text-gray-300"
            >
              {attr.traitType}: {attr.value}
            </span>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div
      key={`${nft.contractAddress}-${nft.tokenId}`}
      className="p-5 rounded-lg border-gray-800 border-1 bg-black"
    >
      <div className="flex flex-col md:flex-row space-y-4 md:space-y-0 md:space-x-4">
        {/* NFT Image */}
        {imageUrl && (
          <div className="flex-shrink-0 w-full sm:w-1/3">
            <img
              src={imageUrl}
              alt={nft.name || 'NFT'}
              className="max-w-full h-auto object-contain max-h-[400px] rounded-lg"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          </div>
        )}

        {/* NFT Information */}
        <div className="flex-1 space-y-2 break-all text-gray-200">
          {/* Token ID (always shown) */}
          <div className="flex items-center gap-2">
            <p>
              <strong>{t('nft.tokenId', 'Token ID')}:</strong> {tokenIdDisplay}
            </p>
            <a
              href={etherscanUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-500 hover:text-gray-300"
              title="View on Etherscan"
            >
              <ExternalLinkIcon />
            </a>
          </div>

          {/* Contract Address */}
          <div className="flex items-center gap-2">
            <p>
              <strong>{t('nft.contract', 'Contract')}:</strong> {contractDisplay}
            </p>
          </div>

          <div className="py-1" />

          {/* Conditional Fields */}
          {renderFieldIfExists(t('nft.name', 'Name'), nft.name)}
          {renderFieldIfExists(
            t('nft.collection', 'Collection'),
            nft.collectionName
          )}
          {renderFieldIfExists(
            t('nft.tokenType', 'Token Type'),
            nft.tokenType
          )}
          {renderFieldIfExists(
            t('nft.description', 'Description'),
            nft.description
          )}
          {nft.tokenType === 'ERC1155' &&
            renderFieldIfExists(t('nft.balance', 'Balance'), nft.balance)}

          {/* OpenSea Floor Price */}
          {nft.openSea?.floorPrice &&
            renderFieldIfExists(
              t('nft.floorPrice', 'Floor Price'),
              `${nft.openSea.floorPrice} ETH`
            )}

          {/* External URL */}
          {renderFieldIfExists(
            t('nft.projectUrl', 'Project URL'),
            nft.externalUrl
          )}

          {/* Attributes */}
          {renderAttributes()}

          {/* Explorer Links */}
          <div className="pt-2 flex gap-4 text-sm">
            <a
              href={etherscanUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-nasun-c4 hover:underline flex items-center gap-1"
            >
              {t('nft.viewOnEtherscan', 'View on Etherscan')}
              <ExternalLinkIcon className="w-3 h-3" />
            </a>

            {openSeaUrl && (
              <a
                href={openSeaUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-nasun-c4 hover:underline flex items-center gap-1"
              >
                {t('nft.viewOnOpenSea', 'View on OpenSea')}
                <ExternalLinkIcon className="w-3 h-3" />
              </a>
            )}
          </div>

          {/* Data Source (Development only) */}
          {import.meta.env.DEV && (
            <p className="text-xs text-gray-400 pt-2">
              Data source: {nft.source === 'alchemy' ? 'Alchemy' : 'Etherscan'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
