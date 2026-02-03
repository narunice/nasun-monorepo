import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getObject } from '../lib/sui-client';
import { formatObjectType, formatSoe } from '../lib/format';
import { getDisplayMediaUrl, isNFTObject } from '../lib/media';
import { parseContent, isCoinType, extractPackageId, getOwnerDisplay, getOwnerLink } from '../lib/object-utils';
import InfoRow from '../components/InfoRow';
import NFTMedia from '../components/NFTMedia';
import NFTDetailView from '../components/NFTDetailView';
import { CoinSymbol } from '../components/CoinSymbol';
import { SectionBox } from '../components/ui/SectionBox';
import { Card } from '../components/ui/Card';
import { JsonBlock } from '../components/ui/JsonBlock';

export default function ObjectPage() {
  const { id } = useParams<{ id: string }>();

  const { data: obj, isLoading, error } = useQuery({
    queryKey: ['object', id],
    queryFn: () => getObject(id!),
    enabled: !!id,
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

      {isLoading ? (
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
      ) : isNFTObject(obj.data?.display?.data, parseContent(obj.data?.content)) && !isCoinType(obj.data?.type) ? (
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

          {/* Raw Data */}
          <SectionBox title="Raw Object Data" color="c6">
            <JsonBlock data={obj} borderColor="border-border" />
          </SectionBox>
        </div>
      )}
    </>
  );
}
