/**
 * Perpetual Trading Page
 * Full-page perp trading interface
 */

import { PerpTradingPanel } from '../features/perp/containers/PerpTradingPanel';
import { PERP_PACKAGE_ID } from '../features/perp/constants';

const isDeployed = !!PERP_PACKAGE_ID;

export function PerpTradePage() {
  return (
    <div className="container mx-auto px-4 py-6 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Perpetual Futures</h1>
        <p className="text-theme-text-muted">
          Trade BTC with up to 20x leverage
        </p>
      </div>

      {!isDeployed ? (
        <div className="p-6 bg-theme-bg-secondary rounded-lg border border-theme-border text-center">
          <p className="text-lg font-medium text-theme-text-primary mb-2">Coming Soon</p>
          <p className="text-sm text-theme-text-muted">
            Perpetual futures contracts are deployed on V7. Frontend integration pending.
          </p>
        </div>
      ) : (
        <PerpTradingPanel />
      )}

      {/* Info Section */}
      <div className="mt-8 p-4 bg-theme-bg-secondary rounded-lg">
        <h3 className="font-medium mb-2">About Perpetual Futures</h3>
        <ul className="text-sm text-theme-text-muted space-y-1">
          <li>
            - Trade with up to <strong>20x leverage</strong>
          </li>
          <li>- No expiration date - hold positions indefinitely</li>
          <li>
            - <strong>Funding rate</strong> settles every 8 hours
          </li>
          <li>- Positions are settled in NUSDC</li>
          <li>- Minimum position size: 10 NUSDC notional</li>
        </ul>

        <div className="mt-4 pt-4 border-t border-theme-border">
          <h4 className="text-sm font-medium mb-2">Risk Levels</h4>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              <span>Healthy (&gt;10% margin)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-yellow-500" />
              <span>Warning (5-10% margin)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-orange-500" />
              <span>Danger (2.5-5% margin)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              <span>Critical (&lt;2.5% liquidation)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
