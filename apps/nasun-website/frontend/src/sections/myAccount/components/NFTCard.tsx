import { FC, ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';

export interface NFTCardProps {
  id: string; // Token ID or Object ID
  imageUrl?: string;
  name?: string;
  explorerUrl?: string;
  explorerLabel?: string;
  children: ReactNode; // Content fields
  renderFieldIfExists: (label: string, value?: string | number) => ReactNode; // Helper function passed down
}

export const NFTCard: FC<NFTCardProps> = ({
  id,
  imageUrl,
  name,
  explorerUrl,
  explorerLabel = "Explorer",
  children,
}) => {
  return (
    <div className="p-5 rounded-sm border-gray-800 border-1 bg-black">
      <div className="flex flex-col md:flex-row space-y-4 md:space-y-0 md:space-x-4">
        {/* NFT Image */}
        {imageUrl && (
          <div className="flex-shrink-0 w-full sm:w-1/3">
            <img
              src={imageUrl}
              alt={name || 'NFT'}
              className="max-w-full h-auto object-contain max-h-[400px] rounded-lg"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          </div>
        )}

        {/* NFT Information */}
        <div className="flex-1 space-y-2 break-all text-gray-200">
          {/* ID (always shown) */}
          <div className="flex items-center gap-2">
            <p>
              <strong>ID:</strong> {id}
            </p>
            {explorerUrl && (
              <a
                href={explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-300 hover:text-gray-300"
                title={`View on ${explorerLabel}`}
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
          </div>

          <div className="py-1" />

          {children}
        </div>
      </div>
    </div>
  );
};

// Helper function to be used by consumers
export const renderFieldIfExists = (label: string, value?: string | number) => {
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
          className="text-gray-300 hover:text-gray-300"
        >
          <ExternalLink className="w-4 h-4" />
        </a>
      )}
    </div>
  );
};
