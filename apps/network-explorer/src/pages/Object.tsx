import { useParams, Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getObject } from '../lib/sui-client';
import { formatObjectType, formatSoe } from '../lib/format';
import { useDocumentTitle } from '../hooks';
import { getDisplayMediaUrl, isNFTObject } from '../lib/media';
import { parseContent, isCoinType, extractPackageId, getOwnerDisplay, getOwnerLink } from '../lib/object-utils';
import InfoRow from '../components/InfoRow';
import NFTMedia from '../components/NFTMedia';
import NFTDetailView from '../components/NFTDetailView';
import { CoinSymbol } from '../components/CoinSymbol';
import { SectionBox } from '../components/ui/SectionBox';
import { Badge } from '../components/ui/Badge';
import { Tabs } from '../components/ui/Tabs';
import { Card } from '../components/ui/Card';
import { JsonBlock } from '../components/ui/JsonBlock';
import ObjectDynamicFields from '../components/object/ObjectDynamicFields';
import type { ObjectOwner } from '@mysten/sui/client';

const OBJECT_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'dynamic', label: 'Dynamic Fields' },
  { id: 'raw', label: 'Raw Data' },
];

function getOwnerBadgeVariant(owner: ObjectOwner | null | undefined) {
  if (!owner) return 'default' as const;
  if (owner === 'Immutable') return 'immutable' as const;
  if (typeof owner === 'object') {
    if ('Shared' in owner) return 'shared' as const;
    if ('ObjectOwner' in owner) return 'child' as const;
  }
  return 'default' as const;
}

function getOwnerBadgeLabel(owner: ObjectOwner | null | undefined): string {
  if (!owner) return 'Unknown';
  if (owner === 'Immutable') return 'Immutable';
  if (typeof owner === 'object') {
    if ('Shared' in owner) return 'Shared';
    if ('ObjectOwner' in owner) return 'Child';
  }
  return 'Owned';
}

const HEX_ID_RE = /^0x[0-9a-fA-F]{1,64}$/;

export default function ObjectPage() {
  const { id } = useParams<{ id: string }>();
  useDocumentTitle(id ? `Object ${id.slice(0, 10)}...` : 'Object');
  const [searchParams, setSearchParams] = useSearchParams();
  const isValidId = id ? HEX_ID_RE.test(id) : false;
  const activeTab = searchParams.get('tab') || 'overview';

  function handleTabChange(tab: string) {
    setSearchParams(tab === 'overview' ? {} : { tab }, { replace: true });
  }

  const { data: obj, isLoading, error } = useQuery({
    queryKey: ['object', id],
    queryFn: () => getObject(id!),
    enabled: isValidId,
  });

  const content = obj?.data?.content ? parseContent(obj.data.content) : null;
  const isNFT = obj?.data && !obj.error && isNFTObject(obj.data.display?.data, content) && !isCoinType(obj.data.type);

  return (
    <>
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

      {!isValidId && id ? (
        <Card variant="default" className="p-6">
          <div className="text-destructive mb-2">Invalid object ID format</div>
          <div className="text-sm text-muted-foreground">
            Expected format: 0x followed by 1-64 hex characters
          </div>
        </Card>
      ) : isLoading ? (
        <div className="text-muted-foreground">Loading...</div>
      ) : error || !obj || obj.error ? (
        <Card variant="default" className="p-6">
          <div className="text-muted-foreground mb-4">Object not found</div>
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
      ) : isNFT ? (
        <NFTDetailView object={obj} />
      ) : (
        <div className="space-y-6">
          <Tabs tabs={OBJECT_TABS} activeTab={activeTab} onTabChange={handleTabChange} />

          {activeTab === 'overview' && (
            <>
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
                  <div className="flex flex-col sm:flex-row sm:items-center py-3 border-b border-border last:border-b-0">
                    <div className="w-40 text-muted-foreground text-sm font-medium flex-shrink-0 mb-1 sm:mb-0">
                      Owner
                    </div>
                    <div className="flex-1 flex items-center gap-2 flex-wrap">
                      <Badge variant={getOwnerBadgeVariant(obj.data?.owner)}>
                        {getOwnerBadgeLabel(obj.data?.owner)}
                      </Badge>
                      {getOwnerLink(obj.data?.owner) ? (
                        <Link
                          to={getOwnerLink(obj.data?.owner)!}
                          className="font-mono text-sm text-foreground hover:text-primary hover:underline"
                        >
                          {getOwnerDisplay(obj.data?.owner)}
                        </Link>
                      ) : (
                        <span className="text-sm text-foreground">
                          {getOwnerDisplay(obj.data?.owner)}
                        </span>
                      )}
                    </div>
                  </div>
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
                  {getDisplayMediaUrl(obj.data.display.data, parseContent(obj.data?.content)) && (
                    <div className="mb-4">
                      <NFTMedia
                        url={getDisplayMediaUrl(obj.data.display.data, parseContent(obj.data?.content))!}
                        name={obj.data.display.data.name}
                        className="max-w-md rounded-lg"
                      />
                    </div>
                  )}
                  <div className="grid grid-cols-1 gap-4">
                    {Object.entries(obj.data.display.data)
                      .filter(([key]) => !['image_url', 'animation_url'].includes(key))
                      .map(([key, value]) => (
                        <InfoRow key={key} label={key} value={String(value)} />
                      ))}
                  </div>
                </SectionBox>
              )}
            </>
          )}

          {activeTab === 'dynamic' && (
            <SectionBox title="Dynamic Fields" color="c4">
              <ObjectDynamicFields objectId={obj.data?.objectId || ''} />
            </SectionBox>
          )}

          {activeTab === 'raw' && (
            <SectionBox title="Raw Object Data" color="c6">
              <JsonBlock data={obj} borderColor="border-border" />
            </SectionBox>
          )}
        </div>
      )}
    </>
  );
}
