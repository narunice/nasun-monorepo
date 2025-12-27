import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getTransaction } from '../lib/sui-client';
import { formatObjectType, formatSoe } from '../lib/format';
import InfoRow from '../components/InfoRow';
import { SectionBox } from '../components/ui/SectionBox';
import { Card } from '../components/ui/Card';

function formatTimestamp(timestampMs: string | number | null | undefined) {
  if (!timestampMs) return '-';
  const date = new Date(Number(timestampMs));
  return date.toLocaleString('en-US');
}

export default function Transaction() {
  const { digest } = useParams<{ digest: string }>();

  const { data: tx, isLoading, error } = useQuery({
    queryKey: ['transaction', digest],
    queryFn: () => getTransaction(digest!),
    enabled: !!digest,
  });

  return (
    <>
      <div className="mb-6">
        <Link to="/" className="text-nasun-c4 hover:underline">
          &larr; Back to Home
        </Link>
      </div>

      <h1 className="text-2xl font-bold mb-6">Transaction Details</h1>

      {isLoading ? (
        <div className="text-nasun-white/60">Loading...</div>
      ) : error || !tx ? (
        <Card variant="c6" className="p-4 border-nasun-c1/50">
          <span className="text-nasun-c1">Transaction not found or error occurred</span>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Overview */}
          <SectionBox title="Overview" color="c4">
            <div className="grid grid-cols-1 gap-4">
              <InfoRow label="Digest" value={tx.digest} mono copyable />
              <InfoRow label="Status" value={tx.effects?.status?.status || '-'} status={tx.effects?.status?.status} />
              <InfoRow label="Timestamp" value={formatTimestamp(tx.timestampMs)} />
              <InfoRow label="Checkpoint" value={tx.checkpoint || '-'} />
              <InfoRow label="Sender" value={tx.transaction?.data?.sender || '-'} mono link={`/address/${tx.transaction?.data?.sender}`} />
            </div>
          </SectionBox>

          {/* Gas */}
          <SectionBox title="Gas" color="c5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card variant="c5" className="p-4">
                <div className="text-nasun-white/60 text-sm uppercase tracking-wider">Gas Budget</div>
                <div className="font-mono text-nasun-white">{formatSoe(tx.transaction?.data?.gasData?.budget)}</div>
              </Card>
              <Card variant="c5" className="p-4">
                <div className="text-nasun-white/60 text-sm uppercase tracking-wider">Gas Price</div>
                <div className="font-mono text-nasun-white">{formatSoe(tx.transaction?.data?.gasData?.price)}</div>
              </Card>
              <Card variant="c5" className="p-4">
                <div className="text-nasun-white/60 text-sm uppercase tracking-wider">Gas Used</div>
                <div className="font-mono text-nasun-white">
                  {tx.effects?.gasUsed
                    ? formatSoe(BigInt(tx.effects.gasUsed.computationCost) + BigInt(tx.effects.gasUsed.storageCost) - BigInt(tx.effects.gasUsed.storageRebate))
                    : '-'}
                </div>
              </Card>
            </div>
          </SectionBox>

          {/* Object Changes */}
          {tx.objectChanges && tx.objectChanges.length > 0 && (
            <SectionBox title={`Object Changes (${tx.objectChanges.length})`} color="c3">
              <div className="space-y-2">
                {tx.objectChanges.map((change, idx) => (
                  <div key={idx} className="bg-nasun-c6/60 border border-nasun-c3/30 rounded-lg p-3 flex items-center justify-between">
                    <div>
                      <span className={`px-2 py-1 rounded text-xs mr-2 ${getChangeTypeColor(change.type)}`}>
                        {change.type}
                      </span>
                      {'objectId' in change && (
                        <Link to={`/object/${change.objectId}`} className="font-mono text-sm text-nasun-c4 hover:underline">
                          {change.objectId}
                        </Link>
                      )}
                    </div>
                    {'objectType' in change && (
                      <span className="text-nasun-white/60 text-sm truncate max-w-xs">
                        {formatObjectType(change.objectType)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </SectionBox>
          )}

          {/* Events */}
          {tx.events && tx.events.length > 0 && (
            <SectionBox title={`Events (${tx.events.length})`} color="c4">
              <div className="space-y-2">
                {tx.events.map((event, idx) => (
                  <div key={idx} className="bg-nasun-c6/60 border border-nasun-c4/30 rounded-lg p-3">
                    <div className="text-sm text-nasun-white/60 mb-1">{formatObjectType(event.type)}</div>
                    <pre className="text-xs overflow-auto bg-nasun-c6/80 p-2 rounded text-nasun-white/80">
                      {JSON.stringify(event.parsedJson, null, 2)}
                    </pre>
                  </div>
                ))}
              </div>
            </SectionBox>
          )}

          {/* Raw Data */}
          <SectionBox title="Raw Transaction Data" color="c6">
            <pre className="text-xs overflow-auto bg-nasun-c6/60 border border-nasun-c5/30 p-4 rounded-lg max-h-96 text-nasun-white/80">
              {JSON.stringify(tx, null, 2)}
            </pre>
          </SectionBox>
        </div>
      )}
    </>
  );
}

function getChangeTypeColor(type: string) {
  switch (type) {
    case 'created':
      return 'bg-nasun-c3/30 text-nasun-c3';
    case 'mutated':
      return 'bg-nasun-c4/30 text-nasun-c4';
    case 'deleted':
      return 'bg-nasun-c1/30 text-nasun-c1';
    case 'wrapped':
      return 'bg-nasun-c5/30 text-nasun-c5';
    case 'published':
      return 'bg-nasun-c2/30 text-nasun-c1';
    default:
      return 'bg-nasun-c6/60 text-nasun-white/60';
  }
}
