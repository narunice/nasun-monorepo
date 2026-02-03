/**
 * LendingSection Component
 * Main lending section with deposit form, positions, and pool stats
 */

import { PoolStats } from './PoolStats';
import { DepositForm } from './DepositForm';
import { PositionList } from './PositionList';

export function LendingSection() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left: Deposit and Positions */}
      <div className="lg:col-span-2 space-y-6">
        <DepositForm />
        <PositionList />
      </div>

      {/* Right: Pool Stats and Info */}
      <div className="space-y-4">
        <PoolStats />

        {/* How Lending Works */}
        <div className="bg-theme-bg-secondary border border-theme-border rounded-xl p-4">
          <h3 className="text-sm font-medium text-theme-text-secondary mb-3">
            How Lending Works
          </h3>

          <ul className="space-y-2 text-xs text-theme-text-muted">
            <li className="flex items-start gap-2">
              <span className="text-pd3 font-bold">1.</span>
              <span>Deposit NUSDC to the lending pool</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-pd3 font-bold">2.</span>
              <span>Earn interest as borrowers pay fees</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-pd3 font-bold">3.</span>
              <span>Withdraw anytime with accrued interest</span>
            </li>
          </ul>

          <div className="mt-4 pt-4 border-t border-theme-border">
            <p className="text-xs text-theme-text-muted">
              <span className="text-yellow-500">Note:</span> Minimum deposit is 1 NUSDC.
              Interest accrues automatically based on pool utilization.
            </p>
          </div>
        </div>

        {/* Interest Rate Info */}
        <div className="bg-theme-bg-secondary border border-theme-border rounded-xl p-4">
          <h3 className="text-sm font-medium text-theme-text-secondary mb-3">
            Interest Rate Model
          </h3>

          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-theme-text-muted">Base Rate</span>
              <span className="text-theme-text-primary">2%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-theme-text-muted">Optimal Utilization</span>
              <span className="text-theme-text-primary">80%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-theme-text-muted">Reserve Factor</span>
              <span className="text-theme-text-primary">10%</span>
            </div>
          </div>

          <p className="text-xs text-theme-text-muted mt-3">
            Interest rates increase with pool utilization to balance supply and demand.
          </p>
        </div>
      </div>
    </div>
  );
}
