import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getObject } from '../lib/sui-client';
import { formatObjectType, formatSoe } from '../lib/format';
import { getDisplayMediaUrl, isNFTObject } from '../lib/media';
import InfoRow from '../components/InfoRow';
import NFTMedia from '../components/NFTMedia';
import NFTDetailView from '../components/NFTDetailView';
import { CoinSymbol } from '../components/CoinSymbol';
import { SectionBox } from '../components/ui/SectionBox';
import { Card } from '../components/ui/Card';

// Coin 타입인지 확인
function isCoinType(type: string | null | undefined): boolean {
  if (!type) return false;
  return type.startsWith('0x2::coin::Coin<');
}

// 타입에서 패키지 ID 추출 (e.g., "0x2::coin::Coin" -> "0x2")
function extractPackageId(type: string | null | undefined): string | null {
  if (!type) return null;
  const match = type.match(/^(0x[a-fA-F0-9]+)::/);
  return match ? match[1] : null;
}

// Parse content to get fields for NFT check
function parseContent(
  content: unknown
): { fields?: Record<string, unknown> } | null {
  if (!content || typeof content !== 'object') return null;
  const c = content as { dataType?: string; fields?: unknown };
  if (c.dataType !== 'moveObject') return null;
  return { fields: c.fields as Record<string, unknown> };
}

export default function ObjectPage() {
  const { id } = useParams<{ id: string }>();

  const { data: obj, isLoading, error } = useQuery({
    queryKey: ['object', id],
    queryFn: () => getObject(id!),
    enabled: !!id,
  });

  // Check if this is an NFT (for conditional header rendering)
  const content = obj?.data?.content ? parseContent(obj.data.content) : null;
  const isNFT = obj?.data && !obj.error && isNFTObject(obj.data.display?.data, content) && !isCoinType(obj.data.type);

  return (
    <>
      {/* Show header only for non-NFT objects */}
      {!isNFT && (
        <>
          <div className="mb-6">
            <Link to="/" className="text-primary hover:underline">
              &larr; Back to Home
            </Link>
          </div>

          <h1 className="text-2xl font-bold mb-6 text-foreground">Object Details</h1>
        </>
      )}

      {isLoading ? (
        <div className="text-muted-foreground">Loading...</div>
      ) : error || !obj || obj.error ? (
        <Card variant="default" className="p-6">
          <div className="text-muted-foreground mb-4">
            Object not found
          </div>
          {obj?.error && (
            <pre className="text-xs text-muted-foreground bg-muted/30 border border-border p-3 rounded-lg mb-4">
              {JSON.stringify(obj.error, null, 2)}
            </pre>
          )}
          {id && (
            <div className="text-sm text-muted-foreground">
              Looking for an address instead?{' '}
              <Link to={`/address/${id}`} className="text-primary hover:underline">
                View as Address
              </Link>
            </div>
          )}
        </Card>
      ) : isNFTObject(obj.data?.display?.data, parseContent(obj.data?.content)) && !isCoinType(obj.data?.type) ? (
        // NFT View - specialized layout for NFT objects
        <NFTDetailView object={obj} />
      ) : (
        <div className="space-y-6">
          {/* Overview */}
          <SectionBox title="Overview" color="c4">
            <div className="grid grid-cols-1 gap-4">
              <InfoRow label="Object ID" value={obj.data?.objectId || '-'} mono copyable />
              <InfoRow label="Version" value={obj.data?.version || '-'} />
              <InfoRow label="Digest" value={obj.data?.digest || '-'} mono />
              {isCoinType(obj.data?.type) ? (
                <div className="grid grid-cols-[120px_1fr] gap-4 py-2 border-b border-border">
                  <span className="text-muted-foreground text-sm uppercase tracking-wider">Type</span>
                  <CoinSymbol type={obj.data?.type || ''} showFullType />
                </div>
              ) : (
                <div className="grid grid-cols-[120px_1fr] gap-4 py-2 border-b border-border">
                  <span className="text-muted-foreground text-sm uppercase tracking-wider">Type</span>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-foreground text-sm">{formatObjectType(obj.data?.type ?? undefined)}</span>
                    {extractPackageId(obj.data?.type) && (
                      <Link
                        to={`/package/${extractPackageId(obj.data?.type)}`}
                        className="text-xs text-primary hover:underline"
                      >
                        View Package →
                      </Link>
                    )}
                  </div>
                </div>
              )}
              <InfoRow
                label="Owner"
                value={getOwnerDisplay(obj.data?.owner)}
                link={getOwnerLink(obj.data?.owner)}
              />
              <InfoRow label="Storage Rebate" value={formatSoe(obj.data?.storageRebate ?? undefined)} />
            </div>
          </SectionBox>

          {/* Content */}
          {obj.data?.content && (
            <SectionBox title="Content" color="c3">
              <JsonBlock data={obj.data.content} borderColor="border-border" />
            </SectionBox>
          )}

          {/* Display */}
          {obj.data?.display?.data && Object.keys(obj.data.display.data).length > 0 && (
            <SectionBox title="Display" color="c5">
              {/* NFT 미디어 렌더링 */}
              {getDisplayMediaUrl(obj.data.display.data, parseContent(obj.data?.content)) && (
                <div className="mb-4">
                  <NFTMedia
                    url={getDisplayMediaUrl(obj.data.display.data, parseContent(obj.data?.content))!}
                    name={obj.data.display.data.name}
                    className="max-w-md rounded-lg"
                  />
                </div>
              )}
              {/* 메타데이터 (image_url, animation_url 제외) */}
              <div className="grid grid-cols-1 gap-4">
                {Object.entries(obj.data.display.data)
                  .filter(([key]) => !['image_url', 'animation_url'].includes(key))
                  .map(([key, value]) => (
                    <InfoRow key={key} label={key} value={String(value)} />
                  ))}
              </div>
            </SectionBox>
          )}

          {/* Raw Data */}
          <SectionBox title="Raw Object Data" color="c6">
            <JsonBlock data={obj} borderColor="border-border" />
          </SectionBox>
        </div>
      )}
    </>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getOwnerDisplay(owner: any): string {
  if (!owner) return '-';
  if (owner === 'Immutable') return 'Immutable';
  if (typeof owner === 'object') {
    if ('AddressOwner' in owner) return owner.AddressOwner;
    if ('ObjectOwner' in owner) return owner.ObjectOwner;
    if ('Shared' in owner) return `Shared (v${owner.Shared.initial_shared_version})`;
  }
  return '-';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getOwnerLink(owner: any): string | undefined {
  if (!owner || typeof owner !== 'object') return undefined;
  if ('AddressOwner' in owner) return `/address/${owner.AddressOwner}`;
  if ('ObjectOwner' in owner) return `/object/${owner.ObjectOwner}`;
  return undefined;
}

// Reusable JSON block with copy button
function JsonBlock({ data, borderColor = 'border-border' }: { data: unknown; borderColor?: string }) {
  const [copied, setCopied] = useState(false);
  const jsonString = JSON.stringify(data, null, 2);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(jsonString);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className="relative">
      {/* Copy button - positioned inside JSON area, top-right */}
      <button
        onClick={handleCopy}
        className="absolute top-2 right-4 z-10 px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200 bg-secondary/20 hover:bg-secondary/40 text-foreground border border-border"
      >
        {copied ? (
          <span className="flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Copied
          </span>
        ) : (
          <span className="flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            Copy
          </span>
        )}
      </button>

      {/* JSON content with custom scrollbar and top padding for button space */}
      <pre className={`text-xs overflow-auto bg-muted/30 border ${borderColor} pt-12 pb-4 px-4 rounded-lg max-h-96 text-foreground custom-scrollbar`}>
        {jsonString}
      </pre>
    </div>
  );
}
