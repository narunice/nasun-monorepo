import { formatVolumeCompact } from '../../../../lib/format';

interface HeroStatsRowProps {
  openMarketsCount: number;
  totalVolumeRaw: bigint;
  myPositionCount: number;
}

interface StatPillProps {
  label: string;
  value: string;
}

function StatPill({ label, value }: StatPillProps) {
  return (
    <div className="flex items-center gap-1.5 text-sm">
      <span className="text-theme-text-muted">{label}</span>
      <span className="font-semibold text-theme-text-primary tabular-nums">{value}</span>
    </div>
  );
}

export function HeroStatsRow({ openMarketsCount, totalVolumeRaw, myPositionCount }: HeroStatsRowProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mb-3">
      <StatPill label="Open markets" value={String(openMarketsCount)} />
      <span className="text-theme-border text-xs hidden sm:inline">|</span>
      <StatPill label="Total volume" value={`${formatVolumeCompact(totalVolumeRaw)} NUSDC`} />
      {myPositionCount > 0 && (
        <>
          <span className="text-theme-border text-xs hidden sm:inline">|</span>
          <StatPill label="My positions" value={String(myPositionCount)} />
        </>
      )}
    </div>
  );
}
