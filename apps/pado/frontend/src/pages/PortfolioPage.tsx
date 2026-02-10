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
      <h1 className="text-2xl font-bold">Portfolio</h1>

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
