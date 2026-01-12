import { useState } from 'react';
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
                  <EventCard key={idx} type={event.type} data={event.parsedJson} />
                ))}
              </div>
            </SectionBox>
          )}

          {/* Raw Data */}
          <RawDataSection data={tx} />
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

function EventCard({ type, data }: { type: string; data: unknown }) {
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
    <div className="bg-nasun-c6/60 border border-nasun-c4/30 rounded-lg p-3">
      <div className="flex items-center justify-between mb-1">
        <div className="text-sm text-nasun-white/60">{formatObjectType(type)}</div>
        <button
          onClick={handleCopy}
          className="px-2 py-1 text-xs font-medium rounded transition-all duration-200 bg-nasun-c4/30 hover:bg-nasun-c4/50 text-nasun-white/70 hover:text-nasun-white"
        >
          {copied ? (
            <span className="flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Copied
            </span>
          ) : (
            <span className="flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Copy
            </span>
          )}
        </button>
      </div>
      <pre className="text-xs overflow-auto bg-nasun-c6/80 p-2 rounded text-nasun-white/80 custom-scrollbar max-h-48">
        {jsonString}
      </pre>
    </div>
  );
}

function RawDataSection({ data }: { data: unknown }) {
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
    <SectionBox title="Raw Transaction Data" color="c6">
      <div className="relative">
        {/* Copy button - positioned inside JSON area, top-right */}
        <button
          onClick={handleCopy}
          className="absolute top-2 right-4 z-10 px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200 bg-nasun-c5/40 hover:bg-nasun-c5/60 text-nasun-white/80 hover:text-nasun-white border border-nasun-c5/30"
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
        <pre className="text-xs overflow-auto bg-nasun-c6/60 border border-nasun-c5/30 pt-12 pb-4 px-4 rounded-lg max-h-96 text-nasun-white/80 custom-scrollbar">
          {jsonString}
        </pre>
      </div>
    </SectionBox>
  );
}
