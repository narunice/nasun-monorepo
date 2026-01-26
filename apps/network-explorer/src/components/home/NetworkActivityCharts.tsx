import { TPSChart, EpochProgress } from '../charts';
import type { EpochInfo } from '../../lib/types';

interface NetworkActivityChartsProps {
  tpsHistory: { timestamp: number; tps: number }[];
  epochInfo: EpochInfo | undefined;
}

export default function NetworkActivityCharts({
  tpsHistory,
  epochInfo,
}: NetworkActivityChartsProps) {
  return (
    <section>
      <h2 className="text-xl font-semibold mb-4 text-foreground">Network Activity</h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TPSChart data={tpsHistory} />
        <EpochProgress epochInfo={epochInfo} />
      </div>
    </section>
  );
}
