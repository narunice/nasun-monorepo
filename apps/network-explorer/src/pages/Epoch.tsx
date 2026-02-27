import { useParams, Link } from 'react-router-dom';
import { useEpochInfo, useDocumentTitle } from '../hooks';
import { formatBalance, formatDuration } from '../lib/format';
import InfoRow from '../components/InfoRow';
import { SectionBox } from '../components/ui/SectionBox';
import { Card } from '../components/ui/Card';

export default function Epoch() {
  const { id } = useParams<{ id: string }>();
  useDocumentTitle(id ? `Epoch #${id}` : 'Epoch');
  const { data: epochInfo, isLoading } = useEpochInfo();

  const isCurrentEpoch = epochInfo && id && epochInfo.epoch === id;
  const isHistorical = epochInfo && id && Number(id) < Number(epochInfo.epoch);

  return (
    <>
      <div className="mb-6">
        <Link to="/" className="text-primary hover:underline">
          &larr; Back to Home
        </Link>
      </div>

      <h1 className="text-2xl font-bold mb-6 text-foreground">Epoch {id}</h1>

      {isLoading ? (
        <div className="text-muted-foreground">Loading...</div>
      ) : !epochInfo ? (
        <Card variant="default" className="p-6">
          <span className="text-destructive">Failed to load epoch data.</span>
        </Card>
      ) : isHistorical ? (
        <Card variant="default" className="p-6 space-y-2">
          <p className="text-muted-foreground">
            Epoch {id} has ended. Historical epoch data requires an indexer.
          </p>
          <p className="text-sm text-muted-foreground">
            Current epoch:{' '}
            <Link to={`/epoch/${epochInfo.epoch}`} className="text-primary hover:underline">
              {epochInfo.epoch}
            </Link>
          </p>
        </Card>
      ) : !isCurrentEpoch ? (
        <Card variant="default" className="p-6">
          <p className="text-muted-foreground">
            Epoch {id} data is not available.{' '}
            <Link to={`/epoch/${epochInfo.epoch}`} className="text-primary hover:underline">
              View current epoch ({epochInfo.epoch})
            </Link>
          </p>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Epoch Progress Bar */}
          <div className="bg-card/60 border border-border/20 rounded-sm p-4 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-muted-foreground text-sm uppercase tracking-wider">Progress</span>
              <span className="text-muted-foreground text-sm">
                {formatDuration(epochInfo.remainingMs)} remaining
              </span>
            </div>
            <div className="relative h-3 bg-primary/20 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-primary to-secondary transition-all duration-500"
                style={{ width: `${epochInfo.progress}%` }}
              />
            </div>
            <div className="mt-1.5 text-xs text-muted-foreground text-right">
              {epochInfo.progress.toFixed(1)}%
            </div>
          </div>

          {/* Overview */}
          <SectionBox title="Overview" color="c4">
            <div className="grid grid-cols-1 gap-4">
              <InfoRow label="Epoch" value={epochInfo.epoch} mono />
              <InfoRow
                label="Started"
                value={new Date(epochInfo.startTimestamp).toLocaleString('en-US')}
              />
              <InfoRow
                label="Est. End"
                value={new Date(epochInfo.endTimestamp).toLocaleString('en-US')}
              />
              <InfoRow
                label="Duration"
                value={formatDuration(Number(epochInfo.epochDurationMs))}
              />
              <InfoRow
                label="Total Stake"
                value={`${formatBalance(epochInfo.totalStake)} NSN`}
              />
              <InfoRow
                label="Validators"
                value={String(epochInfo.activeValidatorsCount)}
              />
            </div>
          </SectionBox>
        </div>
      )}
    </>
  );
}
