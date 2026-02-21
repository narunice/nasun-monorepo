import { useSearchParams } from 'react-router-dom';
import { useAnalyticsData } from '../hooks/useAnalyticsData';
import { useTradingActivity } from '../hooks/useTradingActivity';
import {
  SummaryCards,
  TimeRangeSelector,
  TransactionCharts,
  TradingActivityChart,
  NetworkStateSection,
  IndexerCharts,
  GasCostChart,
} from '../components/analytics';
import type { TimeRange } from '../lib/analytics/types';

const VALID_RANGES = new Set<TimeRange>(['7d', '30d', 'all']);

function parseTimeRange(raw: string | null): TimeRange {
  if (raw && VALID_RANGES.has(raw as TimeRange)) return raw as TimeRange;
  return '7d';
}

export default function Analytics() {
  const [searchParams, setSearchParams] = useSearchParams();
  const timeRange = parseTimeRange(searchParams.get('range'));

  const { data: analyticsData, isLoading: analyticsLoading } = useAnalyticsData(timeRange);
  const { data: tradingData, isLoading: tradingLoading } = useTradingActivity(timeRange);

  // Calculate 24h trades from trading data
  const now = Date.now();
  const oneDayAgoMs = now - 24 * 60 * 60 * 1000;
  const last24hTrades = tradingData
    ? tradingData
        .filter((d) => new Date(d.date + 'T00:00:00Z').getTime() >= oneDayAgoMs)
        .reduce((sum, d) => sum + d.tradeCount, 0)
    : 0;

  function handleTimeRangeChange(range: TimeRange) {
    setSearchParams({ range }, { replace: true });
  }

  return (
    <div className="flex flex-col gap-6 md:gap-8">
      <header>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">Network Activity</h1>
        <p className="text-muted-foreground text-sm mt-1">
          On-chain activity metrics for Nasun Devnet
        </p>
      </header>

      <SummaryCards
        summary={analyticsData?.summary}
        last24hTrades={last24hTrades}
        isLoading={analyticsLoading}
      />

      <TimeRangeSelector value={timeRange} onChange={handleTimeRangeChange} />

      <section>
        <h2 className="text-lg font-semibold text-foreground mb-4">Transaction Metrics</h2>
        <TransactionCharts data={analyticsData?.txHistory} isLoading={analyticsLoading} />
      </section>

      <section>
        <h2 className="text-lg font-semibold text-foreground mb-4">Protocol Activity</h2>
        <TradingActivityChart data={tradingData} isLoading={tradingLoading} />
      </section>

      <section>
        <h2 className="text-lg font-semibold text-foreground mb-4">Indexer Metrics</h2>
        <p className="text-muted-foreground text-xs mb-4">
          Aggregated from the on-chain indexer. Data may lag behind real-time during sync.
        </p>
        <IndexerCharts range={timeRange === 'all' ? '30d' : timeRange} />
      </section>

      <section>
        <h2 className="text-lg font-semibold text-foreground mb-4">Gas Metrics</h2>
        <p className="text-muted-foreground text-xs mb-4">
          Daily gas costs and average gas per transaction from checkpoint data.
        </p>
        <GasCostChart range={timeRange === 'all' ? '30d' : timeRange} />
      </section>

      <section>
        <h2 className="text-lg font-semibold text-foreground mb-4">Network State</h2>
        <p className="text-muted-foreground text-xs mb-4">
          Protocol-level metrics from the current epoch. Updates every 30 seconds.
        </p>
        <NetworkStateSection />
      </section>
    </div>
  );
}
