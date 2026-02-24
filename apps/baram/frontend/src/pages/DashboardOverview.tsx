/**
 * DashboardOverview - Main dashboard page with stats and recent activity
 */

import { useWalletSession } from '../hooks/useWalletSession';
import { useAgentProfiles } from '../features/agents/hooks/useAgentProfiles';
import { useAgentBudgets, type BudgetInfo } from '../features/agents/hooks/useAgentBudgets';
import { useAERRecords } from '../features/aer/hooks/useAERRecords';
import { formatNusdcValue as formatNUSDC, truncateAddress as formatAddress, formatTimeShort as formatTime } from '../utils/format';

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-[var(--color-bg-secondary)] rounded-lg p-4 border border-[var(--color-border)]">
      <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wide">{label}</p>
      <p className="text-2xl lg:text-3xl font-semibold text-[var(--color-text-primary)] mt-1">{value}</p>
      {sub && <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">{sub}</p>}
    </div>
  );
}

function computeBudgetStats(budgets: BudgetInfo[]) {
  let totalBalance = 0;
  let totalSpent = 0;
  let totalRequests = 0;
  for (const b of budgets) {
    totalBalance += b.balance;
    totalSpent += b.totalSpent;
    totalRequests += b.requestCount;
  }
  return { totalBalance, totalSpent, totalRequests };
}

export function DashboardOverview() {
  const { walletAddress, isConnected } = useWalletSession();
  const { data: agents } = useAgentProfiles(walletAddress);
  const { data: budgets } = useAgentBudgets(walletAddress);
  const { data: aerRecords } = useAERRecords(walletAddress);

  if (!isConnected) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-sm text-[var(--color-text-muted)]">
          Connect your wallet to view the dashboard.
        </p>
      </div>
    );
  }

  const activeAgents = agents?.filter(a => a.isActive) ?? [];
  const budgetStats = computeBudgetStats(budgets ?? []);
  const recentAER = (aerRecords ?? []).slice(0, 10);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <h2 className="text-lg lg:text-xl font-semibold text-[var(--color-text-primary)]">Dashboard</h2>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Active Agents"
          value={String(activeAgents.length)}
          sub={`${agents?.length ?? 0} total`}
        />
        <StatCard
          label="Budget Balance"
          value={`${formatNUSDC(budgetStats.totalBalance)} NUSDC`}
          sub={`${formatNUSDC(budgetStats.totalSpent)} spent`}
        />
        <StatCard
          label="Total Requests"
          value={String(budgetStats.totalRequests)}
          sub={`across ${budgets?.length ?? 0} budgets`}
        />
        <StatCard
          label="Execution Reports"
          value={String(aerRecords?.length ?? 0)}
          sub="audit trail"
        />
      </div>

      {/* Agent Cards */}
      {activeAgents.length > 0 && (
        <section>
          <h3 className="text-sm lg:text-base font-medium text-[var(--color-text-secondary)] mb-3">Active Agents</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {activeAgents.map(agent => {
              const agentBudget = budgets?.find(b => b.agent === agent.agentAddress);
              return (
                <div
                  key={agent.id}
                  className="bg-[var(--color-bg-secondary)] rounded-lg p-4 border border-[var(--color-border)]"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-[var(--color-text-primary)]">
                      {agent.name}
                    </span>
                    <span className="text-2xs px-1.5 py-0.5 rounded bg-[var(--color-success)]/10 text-[var(--color-success)]">
                      Active
                    </span>
                  </div>
                  <p className="text-xs text-[var(--color-text-muted)] mt-1">
                    {agent.role} | {formatAddress(agent.agentAddress)}
                  </p>
                  {agentBudget && (
                    <div className="mt-3">
                      <div className="flex justify-between text-xs text-[var(--color-text-secondary)]">
                        <span>Budget</span>
                        <span>{formatNUSDC(agentBudget.balance)} / {formatNUSDC(agentBudget.balance + agentBudget.totalSpent)} NUSDC</span>
                      </div>
                      <div className="mt-1 h-1.5 rounded-full bg-[var(--color-bg-tertiary)] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[var(--color-accent)]"
                          style={{
                            width: `${Math.min(100, (agentBudget.balance / (agentBudget.balance + agentBudget.totalSpent || 1)) * 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Recent AER Records */}
      <section>
        <h3 className="text-sm lg:text-base font-medium text-[var(--color-text-secondary)] mb-3">Recent Execution Reports</h3>
        {recentAER.length === 0 ? (
          <p className="text-xs text-[var(--color-text-muted)]">No execution reports yet.</p>
        ) : (
          <div className="bg-[var(--color-bg-secondary)] rounded-lg border border-[var(--color-border)] overflow-hidden">
            <table className="w-full text-xs lg:text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  <th className="text-left px-3 py-2 text-[var(--color-text-muted)] font-medium">ID</th>
                  <th className="text-left px-3 py-2 text-[var(--color-text-muted)] font-medium">Model</th>
                  <th className="text-right px-3 py-2 text-[var(--color-text-muted)] font-medium">Cost</th>
                  <th className="text-left px-3 py-2 text-[var(--color-text-muted)] font-medium">Status</th>
                  <th className="text-right px-3 py-2 text-[var(--color-text-muted)] font-medium">Time</th>
                </tr>
              </thead>
              <tbody>
                {recentAER.map(record => (
                  <tr key={record.id} className="border-b border-[var(--color-border)] last:border-0">
                    <td className="px-3 py-2 text-[var(--color-text-primary)] font-mono">
                      #{record.requestId}
                    </td>
                    <td className="px-3 py-2 text-[var(--color-text-secondary)]">
                      {record.modelName || '-'}
                    </td>
                    <td className="px-3 py-2 text-right text-[var(--color-text-primary)]">
                      {formatNUSDC(record.paymentAmount)} NUSDC
                    </td>
                    <td className="px-3 py-2">
                      <span className={`px-1.5 py-0.5 rounded text-2xs ${
                        record.status === 0
                          ? 'bg-[var(--color-success)]/10 text-[var(--color-success)]'
                          : record.status === 1
                          ? 'bg-[var(--color-warning)]/10 text-[var(--color-warning)]'
                          : 'bg-[var(--color-error)]/10 text-[var(--color-error)]'
                      }`}>
                        {record.statusName}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right text-[var(--color-text-muted)]">
                      {formatTime(record.settledAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
