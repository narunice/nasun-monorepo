import { Card } from '../ui/Card';
import { formatDuration } from '../../lib/format';

interface EpochInfo {
  epoch: string;
  remainingMs: number;
  progress: number;
  startTimestamp: number;
  endTimestamp: number;
}

interface EpochProgressProps {
  epochInfo: EpochInfo | null | undefined;
}

export function EpochProgress({ epochInfo }: EpochProgressProps) {
  return (
    <Card variant="default" className="p-4">
      <div className="text-muted-foreground text-sm uppercase tracking-wider mb-4">
        Epoch Progress
      </div>
      {epochInfo ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-foreground text-lg font-mono">Epoch {epochInfo.epoch}</span>
            <span className="text-muted-foreground text-sm">
              {formatDuration(epochInfo.remainingMs)} remaining
            </span>
          </div>
          <div className="relative">
            <div className="h-4 bg-primary/20 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-primary to-secondary transition-all duration-500"
                style={{ width: `${epochInfo.progress}%` }}
              />
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xs text-white font-medium drop-shadow">
                {epochInfo.progress.toFixed(1)}%
              </span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-muted-foreground">Started</div>
              <div className="text-foreground font-mono">
                {new Date(epochInfo.startTimestamp).toLocaleString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Est. End</div>
              <div className="text-foreground font-mono">
                {new Date(epochInfo.endTimestamp).toLocaleString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
          Loading epoch info...
        </div>
      )}
    </Card>
  );
}
