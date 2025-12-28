/**
 * PortfolioPage
 * Portfolio dashboard showing total assets, token balances, and trade history
 */

import {
  AssetOverview,
  TokenBalanceList,
  TradeStats,
  RecentTrades,
} from '../features/portfolio/components';

export function PortfolioPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Portfolio</h1>

      {/* Total Asset Value */}
      <AssetOverview />

      {/* Token Balance List */}
      <TokenBalanceList />

      {/* Trading Statistics */}
      <TradeStats />

      {/* Recent Trade History */}
      <RecentTrades />
    </div>
  );
}
