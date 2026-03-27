import { Button } from '@/components/ui/button';
import { OuterBox } from '@/components/ui/OuterBox';
import { Spinner } from '@/components/ui';
import type { ProposalSummary } from '@/features/admin/types';
import type { VoterInfo } from '@/features/admin/hooks/useProposalVoters';

interface VoterDetailsPanelProps {
  proposal: ProposalSummary;
  voters: VoterInfo[];
  isLoading: boolean;
  isExporting: boolean;
  onExport: () => void;
  onClose: () => void;
}

export function VoterDetailsPanel({
  proposal,
  voters,
  isLoading,
  isExporting,
  onExport,
  onClose,
}: VoterDetailsPanelProps) {
  const totalPower = voters.reduce((sum, v) => sum + v.votingPower, 0);

  return (
    <div className="w-full">
      <OuterBox color="c1" padding="md" className="w-full !border-nasun-c4/30 !bg-gray-800/70">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 mb-8">
          <div>
            <h4 className="text-xl font-medium text-nasun-white mb-2">{proposal.title}</h4>
            <p className="text-nasun-white/80 text-sm flex items-center gap-3">
              <span className="flex items-center gap-1">
                <strong className="text-nasun-c1 font-medium">{voters.length}</strong> Participants
              </span>
              <span className="w-px h-3 bg-nasun-white/20"></span>
              <span className="flex items-center gap-1">
                Total Power:{' '}
                <strong className="text-nasun-white font-medium">
                  {totalPower.toLocaleString()}
                </strong>
              </span>
            </p>
          </div>
          <div className="flex gap-3">
            <Button
              onClick={onExport}
              disabled={voters.length === 0 || isExporting}
              variant="c4"
              size="md"
            >
              {isExporting ? 'Exporting...' : 'Export CSV'}
            </Button>
            <Button onClick={onClose} variant="outlineC5" size="md">
              Close
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <Spinner size="lg" />
            <p className="text-nasun-white/60 text-sm">Fetching on-chain voter data...</p>
          </div>
        ) : voters.length === 0 ? (
          <div className="py-16 text-center text-nasun-white/50 italic font-light">
            No votes have been cast for this proposal yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-nasun-white/20">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-nasun-white/60 uppercase">
                    Voter Wallet
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-nasun-white/60 uppercase">
                    Choice
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-nasun-white/60 uppercase">
                    Voting Power
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-nasun-white/5 font-mono">
                {voters.map((voter, idx) => (
                  <tr key={idx} className="hover:bg-nasun-white/5 transition-colors">
                    <td className="px-4 py-3 text-nasun-white/90 text-sm">{voter.voter}</td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`px-2 py-0.5 rounded-sm text-[10px] font-bold uppercase border ${
                          voter.votedYes
                            ? 'bg-green-500/10 text-green-400 border-green-500/20'
                            : 'bg-red-500/10 text-red-400 border-red-500/20'
                        }`}
                      >
                        {voter.votedYes ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-nasun-white text-sm">
                      {voter.votingPower.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </OuterBox>
    </div>
  );
}
