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
            <Link to="/" className="text-nasun-c4 hover:underline">
              &larr; Back to Home
            </Link>
          </div>

          <h1 className="text-2xl font-bold mb-6">Object Details</h1>
        </>
      )}

      {isLoading ? (
        <div className="text-nasun-white/60">Loading...</div>
      ) : error || !obj || obj.error ? (
        <Card variant="c6" className="p-6">
          <div className="text-nasun-white/80 mb-4">
            Object not found
          </div>
          {obj?.error && (
            <pre className="text-xs text-nasun-white/60 bg-nasun-c6/60 border border-nasun-c5/30 p-3 rounded-lg mb-4">
              {JSON.stringify(obj.error, null, 2)}
            </pre>
          )}
          {id && (
            <div className="text-sm text-nasun-white/60">
              Looking for an address instead?{' '}
              <Link to={`/address/${id}`} className="text-nasun-c4 hover:underline">
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
                <div className="grid grid-cols-[120px_1fr] gap-4 py-2 border-b border-nasun-c4/20">
                  <span className="text-nasun-white/60 text-sm uppercase tracking-wider">Type</span>
                  <CoinSymbol type={obj.data?.type || ''} showFullType />
                </div>
              ) : (
                <InfoRow label="Type" value={formatObjectType(obj.data?.type ?? undefined)} />
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
              <pre className="text-xs overflow-auto bg-nasun-c6/60 border border-nasun-c3/30 p-4 rounded-lg max-h-96 text-nasun-white/80">
                {JSON.stringify(obj.data.content, null, 2)}
              </pre>
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
            <pre className="text-xs overflow-auto bg-nasun-c6/60 border border-nasun-c5/30 p-4 rounded-lg max-h-96 text-nasun-white/80">
              {JSON.stringify(obj, null, 2)}
            </pre>
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
