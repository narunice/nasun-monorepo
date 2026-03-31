/**
 * PortfolioPage
 * Portfolio dashboard showing total assets, token balances, and activity history
 */

import {
  AssetOverview,
  AllocationDonut,
  PnlChart,
  TokenBalanceList,
  TradeStats,
  MarketPerformance,
  ActivityTabs,
} from '../features/portfolio/components';

export function PortfolioPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold">Portfolio</h1>
        <span className="text-xs font-bold tracking-wider text-yellow-600 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-400/10 border border-yellow-300 dark:border-yellow-400/30 px-2 py-0.5 rounded">FEATURE PREVIEW</span>
      </div>

      {/* Total Asset Value + Allocation Donut */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AssetOverview />
        <AllocationDonut />
      </div>

      {/* P&L Equity Curve */}
      <PnlChart />

      {/* Token Balance List */}
      <TokenBalanceList />

      {/* Trading Statistics */}
      <TradeStats />

      {/* Per-Market Performance */}
      <MarketPerformance />

      {/* Activity History (Trades + Transfers) */}
      <ActivityTabs />
    </div>
  );
}
