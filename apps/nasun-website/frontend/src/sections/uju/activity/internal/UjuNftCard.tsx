import { FC, ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';

export interface UjuNftCardProps {
  id: string; // Token ID or Object ID
  imageUrl?: string;
  name?: string;
  explorerUrl?: string;
  explorerLabel?: string;
  children: ReactNode; // Content fields
}

export const UjuNftCard: FC<UjuNftCardProps> = ({
  id,
  imageUrl,
  name,
  explorerUrl,
  explorerLabel = "Explorer",
  children,
}) => {
  return (
    <div className="p-4 sm:p-5 rounded-xl border border-uju-border/30 bg-uju-bg/50">
      <div className="flex flex-col md:flex-row gap-5">
        {/* NFT Image */}
        {imageUrl && (
          <div className="flex-shrink-0 w-full md:w-40 lg:w-48 aspect-square md:aspect-auto overflow-hidden rounded-lg bg-uju-bg/80 border border-uju-border/20">
            <img
              src={imageUrl}
              alt={name || 'NFT'}
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          </div>
        )}

        {/* NFT Information */}
        <div className="flex-1 space-y-2.5 break-all text-uju-secondary min-w-0">
          {/* ID (always shown) */}
          <div className="flex items-center gap-2">
            <p className="text-sm">
              <strong className="text-uju-primary mr-1">ID:</strong> 
              <span className="font-mono">{id}</span>
            </p>
            {explorerUrl && (
              <a
                href={explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-pado-2 hover:text-pado-4 transition-colors"
                title={`View on ${explorerLabel}`}
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
          </div>

          <div className="grid gap-2">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
};

// Helper function to be used by consumers
export const renderUjuFieldIfExists = (label: string, value?: string | number) => {
  if (!value) return null;

  const isUrl = typeof value === 'string' && value.startsWith('http');

  return (
    <div className="flex items-center gap-2 text-sm">
      <p className="min-w-0 truncate">
        <strong className="text-uju-primary mr-1">{label}:</strong> 
        {String(value)}
      </p>
      {isUrl && (
        <a
          href={value}
          target="_blank"
          rel="noopener noreferrer"
          title={`Open ${label} in new tab`}
          className="text-pado-2 hover:text-pado-4 transition-colors shrink-0"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      )}
    </div>
  );
};
