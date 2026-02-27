import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getCheckpoint } from '../lib/sui-client';
import { formatTimestamp, formatSoe } from '../lib/format';
import { useDocumentTitle } from '../hooks';
import { Card } from '../components/ui/Card';
import { SectionBox } from '../components/ui/SectionBox';

export default function Checkpoint() {
  const { sequence } = useParams<{ sequence: string }>();
  useDocumentTitle(sequence ? `Checkpoint #${sequence}` : 'Checkpoint');

  const { data: checkpoint, isLoading } = useQuery({
    queryKey: ['checkpoint', sequence],
    queryFn: () => getCheckpoint(sequence!),
    enabled: !!sequence,
  });

  if (isLoading) {
    return <div className="text-muted-foreground">Loading...</div>;
  }

  if (!checkpoint) {
    return (
      <>
        <div className="mb-6">
          <Link to="/checkpoints" className="text-primary hover:underline">
            &larr; Back to Checkpoints
          </Link>
        </div>
        <Card variant="default" className="p-6 border-destructive/50">
          <h2 className="text-lg font-semibold text-destructive">Checkpoint Not Found</h2>
          <p className="text-muted-foreground mt-2">
            No checkpoint found with sequence number: {sequence}
          </p>
        </Card>
      </>
    );
  }

  return (
    <>
      <div className="mb-6">
        <Link to="/checkpoints" className="text-primary hover:underline">
          &larr; Back to Checkpoints
        </Link>
      </div>

      <h1 className="text-2xl font-bold mb-6 text-foreground">Checkpoint #{checkpoint.sequenceNumber}</h1>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <Card variant="default" className="p-4">
          <div className="text-muted-foreground text-sm uppercase tracking-wider">Sequence</div>
          <div className="text-lg font-mono text-foreground">#{checkpoint.sequenceNumber}</div>
        </Card>
        <Card variant="default" className="p-4">
          <div className="text-muted-foreground text-sm uppercase tracking-wider">Epoch</div>
          <div className="text-lg font-mono text-foreground">{checkpoint.epoch}</div>
        </Card>
        <Card variant="default" className="p-4">
          <div className="text-muted-foreground text-sm uppercase tracking-wider">Transactions</div>
          <div className="text-lg font-mono text-foreground">{checkpoint.transactions?.length || 0}</div>
        </Card>
        <Card variant="default" className="p-4">
          <div className="text-muted-foreground text-sm uppercase tracking-wider">Time</div>
          <div className="text-sm font-mono text-foreground">{formatTimestamp(checkpoint.timestampMs)}</div>
        </Card>
      </div>

      {/* Checkpoint Details */}
      <SectionBox title="Checkpoint Details" color="c5">
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
            <span className="text-muted-foreground text-sm min-w-[160px]">Digest</span>
            <span className="font-mono text-sm break-all text-foreground">{checkpoint.digest}</span>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
            <span className="text-muted-foreground text-sm min-w-[160px]">Previous Digest</span>
            <span className="font-mono text-sm break-all text-foreground">{checkpoint.previousDigest || '-'}</span>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
            <span className="text-muted-foreground text-sm min-w-[160px]">Timestamp</span>
            <span className="text-foreground">{formatTimestamp(checkpoint.timestampMs)}</span>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
            <span className="text-muted-foreground text-sm min-w-[160px]">Network Total TX</span>
            <span className="font-mono text-foreground">{checkpoint.networkTotalTransactions}</span>
          </div>
        </div>
      </SectionBox>

      {/* Gas Cost Summary */}
      {checkpoint.epochRollingGasCostSummary && (
        <SectionBox title="Gas Cost Summary" color="c4" className="mt-6">
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
              <span className="text-muted-foreground text-sm min-w-[160px]">Computation Cost</span>
              <span className="font-mono text-foreground">{formatSoe(checkpoint.epochRollingGasCostSummary.computationCost)}</span>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
              <span className="text-muted-foreground text-sm min-w-[160px]">Storage Cost</span>
              <span className="font-mono text-foreground">{formatSoe(checkpoint.epochRollingGasCostSummary.storageCost)}</span>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
              <span className="text-muted-foreground text-sm min-w-[160px]">Storage Rebate</span>
              <span className="font-mono text-foreground">{formatSoe(checkpoint.epochRollingGasCostSummary.storageRebate)}</span>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
              <span className="text-muted-foreground text-sm min-w-[160px]">Non-refundable Fee</span>
              <span className="font-mono text-foreground">{formatSoe(checkpoint.epochRollingGasCostSummary.nonRefundableStorageFee)}</span>
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
                className="block font-mono text-sm text-primary hover:underline break-all"
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
          <div className="font-mono text-sm text-muted-foreground break-all">
            {checkpoint.validatorSignature}
          </div>
        </SectionBox>
      )}
    </>
  );
}
