import { TPSChart, EpochProgress } from '../charts';
import type { EpochInfo } from '../../lib/types';
import type { TPSDataPoint } from '../../hooks/types';

interface NetworkActivityChartsProps {
  tpsHistory: TPSDataPoint[];
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
