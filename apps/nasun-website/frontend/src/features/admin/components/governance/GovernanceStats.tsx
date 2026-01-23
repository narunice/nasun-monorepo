import { DashboardCard } from '@/components/ui/DashboardCard';
import type { ProposalSummary } from '@/features/admin/types';

interface GovernanceStatsProps {
  proposals: ProposalSummary[];
  hiddenCount: number;
}

export function GovernanceStats({ proposals, hiddenCount }: GovernanceStatsProps) {
  const activeCount = proposals.filter((p) => !p.isExpired && !p.isDelisted).length;
  const expiredCount = proposals.filter((p) => p.isExpired || p.isDelisted).length;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 w-full">
      <DashboardCard className="bg-gray-800/30 border-nasun-c5/40 text-center">
        <span className="text-xs uppercase tracking-widest text-nasun-white/50 mb-2 block">
          Total
        </span>
        <span className="text-2xl font-bold text-nasun-white">{proposals.length}</span>
      </DashboardCard>
      
      <DashboardCard className="bg-gray-800/30 border-nasun-c5/40 text-center">
        <span className="text-xs uppercase tracking-widest text-nasun-white/50 mb-2 block">
          Active
        </span>
        <span className="text-2xl font-bold text-nasun-c1">
          {activeCount}
        </span>
      </DashboardCard>
      
      <DashboardCard className="bg-gray-800/30 border-nasun-c5/40 text-center">
        <span className="text-xs uppercase tracking-widest text-nasun-white/50 mb-2 block">
          Expired
        </span>
        <span className="text-2xl font-bold text-nasun-white/40">
          {expiredCount}
        </span>
      </DashboardCard>
      
      <DashboardCard className="bg-gray-800/30 border-nasun-c5/40 text-center">
        <span className="text-xs uppercase tracking-widest text-nasun-white/50 mb-2 block">
          Hidden
        </span>
        <span className="text-2xl font-bold text-nasun-c4">{hiddenCount}</span>
      </DashboardCard>
    </div>
  );
}
