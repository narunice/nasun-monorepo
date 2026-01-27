import { SearchBar } from '../components/charts';
import {
  useNetworkStatus,
  useEpochInfo,
  useTPS,
  useRecentTransactions,
  useTPSHistory,
} from '../hooks';

// Sub-components
import NetworkStatusCards from '../components/home/NetworkStatusCards';
import NetworkActivityCharts from '../components/home/NetworkActivityCharts';
import RecentTransactionsTable from '../components/home/RecentTransactionsTable';

// Types
import type { NetworkStatus, EpochInfo } from '../lib/types';

export default function Home() {
  // Network data queries
  const {
    data: networkStatus,
    isLoading: statusLoading,
    dataUpdatedAt: statusUpdatedAt,
    isFetching: statusFetching,
  } = useNetworkStatus() as {
    data: NetworkStatus | undefined;
    isLoading: boolean;
    dataUpdatedAt: number;
    isFetching: boolean;
  };

  const { data: epochInfo } = useEpochInfo() as {
    data: EpochInfo | undefined;
    isFetching: boolean;
  };

  const { data: tps } = useTPS();

  const {
    data: recentTxs,
    isLoading: txLoading,
    dataUpdatedAt: txUpdatedAt,
    isFetching: txFetching,
  } = useRecentTransactions(10);

  // TPS history for chart
  const tpsHistory = useTPSHistory(tps ?? null);

  return (
    <div className="flex flex-col gap-6 md:gap-8 lg:gap-10">
      {/* Search Bar - positioned at top for easy discovery */}
      <section>
        <SearchBar />
      </section>

      {/* Network Status Section */}
      <NetworkStatusCards
        status={networkStatus}
        epochInfo={epochInfo}
        tps={tps}
        isLoading={statusLoading}
        isFetching={statusFetching}
        updatedAt={statusUpdatedAt}
      />

      {/* Network Activity Charts Section */}
      <NetworkActivityCharts tpsHistory={tpsHistory} epochInfo={epochInfo} />

      {/* Recent Transactions Table Section */}
      <RecentTransactionsTable
        transactions={recentTxs}
        isLoading={txLoading}
        isFetching={txFetching}
        updatedAt={txUpdatedAt}
      />
    </div>
  );
}