/**
 * PortfolioPage
 * Portfolio dashboard showing total assets and token balances
 */

import { AssetOverview, TokenBalanceList } from '../features/portfolio/components';

export function PortfolioPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Portfolio</h1>

      {/* Total Asset Value */}
      <AssetOverview />

      {/* Token Balance List */}
      <TokenBalanceList />
    </div>
  );
}
