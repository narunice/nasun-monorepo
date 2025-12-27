import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getCheckpoint } from '../lib/sui-client';
import { formatSoe } from '../lib/format';
import { Card } from '../components/ui/Card';
import { SectionBox } from '../components/ui/SectionBox';

function formatTimestamp(timestampMs: string | number | null | undefined) {
  if (!timestampMs) return '-';
  const date = new Date(Number(timestampMs));
  return date.toLocaleString('en-US');
}

export default function Checkpoint() {
  const { sequence } = useParams<{ sequence: string }>();

  const { data: checkpoint, isLoading } = useQuery({
    queryKey: ['checkpoint', sequence],
    queryFn: () => getCheckpoint(sequence!),
    enabled: !!sequence,
  });

  if (isLoading) {
    return <div className="text-nasun-white/60">Loading...</div>;
  }

  if (!checkpoint) {
    return (
      <>
        <div className="mb-6">
          <Link to="/checkpoints" className="text-nasun-c4 hover:underline">
            &larr; Back to Checkpoints
          </Link>
        </div>
        <Card variant="c3" className="p-6">
          <h2 className="text-lg font-semibold text-red-400">Checkpoint Not Found</h2>
          <p className="text-nasun-white/60 mt-2">
            No checkpoint found with sequence number: {sequence}
          </p>
        </Card>
      </>
    );
  }

  return (
    <>
      <div className="mb-6">
        <Link to="/checkpoints" className="text-nasun-c4 hover:underline">
          &larr; Back to Checkpoints
        </Link>
      </div>

      <h1 className="text-2xl font-bold mb-6">Checkpoint #{checkpoint.sequenceNumber}</h1>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card variant="c4" className="p-4">
            <div className="text-nasun-white/60 text-sm uppercase tracking-wider">Sequence</div>
            <div className="text-lg font-mono text-nasun-white">#{checkpoint.sequenceNumber}</div>
          </Card>
          <Card variant="c4" className="p-4">
            <div className="text-nasun-white/60 text-sm uppercase tracking-wider">Epoch</div>
            <div className="text-lg font-mono text-nasun-white">{checkpoint.epoch}</div>
          </Card>
          <Card variant="c4" className="p-4">
            <div className="text-nasun-white/60 text-sm uppercase tracking-wider">Transactions</div>
            <div className="text-lg font-mono text-nasun-white">{checkpoint.transactions?.length || 0}</div>
          </Card>
          <Card variant="c4" className="p-4">
            <div className="text-nasun-white/60 text-sm uppercase tracking-wider">Time</div>
            <div className="text-sm font-mono text-nasun-white">{formatTimestamp(checkpoint.timestampMs)}</div>
          </Card>
        </div>

        {/* Checkpoint Details */}
        <SectionBox title="Checkpoint Details" color="c5">
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
              <span className="text-nasun-white/60 text-sm min-w-[160px]">Digest</span>
              <span className="font-mono text-sm break-all">{checkpoint.digest}</span>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
              <span className="text-nasun-white/60 text-sm min-w-[160px]">Previous Digest</span>
              <span className="font-mono text-sm break-all">{checkpoint.previousDigest || '-'}</span>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
              <span className="text-nasun-white/60 text-sm min-w-[160px]">Timestamp</span>
              <span>{formatTimestamp(checkpoint.timestampMs)}</span>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
              <span className="text-nasun-white/60 text-sm min-w-[160px]">Network Total TX</span>
              <span className="font-mono">{checkpoint.networkTotalTransactions}</span>
            </div>
          </div>
        </SectionBox>

        {/* Gas Cost Summary */}
        {checkpoint.epochRollingGasCostSummary && (
          <SectionBox title="Gas Cost Summary" color="c4" className="mt-6">
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
                <span className="text-nasun-white/60 text-sm min-w-[160px]">Computation Cost</span>
                <span className="font-mono">{formatSoe(checkpoint.epochRollingGasCostSummary.computationCost)}</span>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
                <span className="text-nasun-white/60 text-sm min-w-[160px]">Storage Cost</span>
                <span className="font-mono">{formatSoe(checkpoint.epochRollingGasCostSummary.storageCost)}</span>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
                <span className="text-nasun-white/60 text-sm min-w-[160px]">Storage Rebate</span>
                <span className="font-mono">{formatSoe(checkpoint.epochRollingGasCostSummary.storageRebate)}</span>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
                <span className="text-nasun-white/60 text-sm min-w-[160px]">Non-refundable Fee</span>
                <span className="font-mono">{formatSoe(checkpoint.epochRollingGasCostSummary.nonRefundableStorageFee)}</span>
              </div>
            </div>
          </SectionBox>
        )}

        {/* Transactions */}
        {checkpoint.transactions && checkpoint.transactions.length > 0 && (
          <SectionBox title={`Transactions (${checkpoint.transactions.length})`} color="c3" className="mt-6">
            <div className="space-y-2">
              {checkpoint.transactions.map((txDigest) => (
                <Link
                  key={txDigest}
                  to={`/tx/${txDigest}`}
                  className="block font-mono text-sm text-nasun-c4 hover:underline break-all"
                >
                  {txDigest}
                </Link>
              ))}
            </div>
          </SectionBox>
        )}

        {/* Validator Signature (optional) */}
        {checkpoint.validatorSignature && (
          <SectionBox title="Validator Signature" color="c6" className="mt-6">
            <div className="font-mono text-sm text-nasun-white/60 break-all">
              {checkpoint.validatorSignature}
            </div>
          </SectionBox>
        )}
    </>
  );
}
