import { DashboardCard } from "@/components/ui/DashboardCard";

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

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

export function EpochProgress({ epochInfo }: EpochProgressProps) {
  return (
    <DashboardCard className="p-4 !bg-[#212E57]/50 border-nasun-c5/30">
      <div className="text-nasun-white/60 text-xs uppercase tracking-widest font-semibold mb-4">
        Epoch Progress
      </div>
      {epochInfo ? (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <span className="text-nasun-white text-base font-mono font-bold">
              Epoch {epochInfo.epoch}
            </span>
            <span className="text-nasun-white/50 text-xs font-light">
              {formatDuration(epochInfo.remainingMs)} remaining
            </span>
          </div>

          <div className="relative">
            <div className="h-3 bg-nasun-c4/10 rounded-full overflow-hidden border border-nasun-c4/10">
              <div
                className="h-full bg-gradient-to-r from-nasun-c4 to-nasun-c3 transition-all duration-1000 ease-out shadow-[0_0_8px_rgba(68,139,187,0.4)]"
                style={{ width: `${epochInfo.progress}%` }}
              />
            </div>
            <div className="absolute -top-6 right-0">
              <span className="text-[10px] text-nasun-c3 font-mono font-medium">
                {epochInfo.progress.toFixed(1)}%
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-2">
            <div className="space-y-1">
              <div className="text-nasun-white/30 text-[10px] uppercase tracking-tighter font-semibold">
                Started
              </div>
              <div className="text-nasun-white/70 font-mono text-xs">
                {new Date(epochInfo.startTimestamp).toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                })}
              </div>
            </div>
            <div className="space-y-1 text-right">
              <div className="text-nasun-white/30 text-[10px] uppercase tracking-tighter font-semibold">
                Estimated End
              </div>
              <div className="text-nasun-white/70 font-mono text-xs">
                {new Date(epochInfo.endTimestamp).toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                })}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="h-[180px] flex flex-col items-center justify-center text-nasun-white/30 text-xs gap-2">
          <div className="animate-spin rounded-full h-4 w-4 border border-nasun-c3 border-t-transparent" />
          <span>Loading epoch information...</span>
        </div>
      )}
    </DashboardCard>
  );
}
