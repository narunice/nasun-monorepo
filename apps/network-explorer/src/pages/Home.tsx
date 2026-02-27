import { SearchBar } from '../components/charts';
import {
  useNetworkStatus,
  useEpochInfo,
  useTPS,
  useRecentTransactions,
  useTPSHistory,
  useMinDuration,
  useDocumentTitle,
} from '../hooks';

// Sub-components
import NetworkStatusCards from '../components/home/NetworkStatusCards';
import NetworkActivityCharts from '../components/home/NetworkActivityCharts';
import RecentTransactionsTable from '../components/home/RecentTransactionsTable';

export default function Home() {
  useDocumentTitle();

  // Network data queries
  const {
    data: networkStatus,
    isLoading: statusLoading,
    dataUpdatedAt: statusUpdatedAt,
    isFetching: statusFetching,
  } = useNetworkStatus();

  const { data: epochData } = useEpochInfo();
  const epochInfo = epochData ?? undefined;

  const { data: tps } = useTPS();

  const {
    data: recentTxs,
    isLoading: txLoading,
    dataUpdatedAt: txUpdatedAt,
    isFetching: txFetching,
  } = useRecentTransactions(10);

  // TPS history for chart
  const tpsHistory = useTPSHistory(tps ?? null);

  // Extend fetching indicators to stay visible for minimum 600ms
  const statusFetchingExtended = useMinDuration(statusFetching);
  const txFetchingExtended = useMinDuration(txFetching);

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
        isFetching={statusFetchingExtended}
        updatedAt={statusUpdatedAt}
      />

      {/* Network Activity Charts Section */}
      <NetworkActivityCharts tpsHistory={tpsHistory} epochInfo={epochInfo} />

      {/* Recent Transactions Table Section */}
      <RecentTransactionsTable
        transactions={recentTxs}
        isLoading={txLoading}
        isFetching={txFetchingExtended}
        updatedAt={txUpdatedAt}
      />
    </div>
  );
}