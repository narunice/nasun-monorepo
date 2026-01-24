import { OuterBox } from '@/components/ui/OuterBox';
import { InlineLoading } from '@/components/ui/InlineLoading';
import type { ProposalSummary } from '@/features/admin/types';

interface ProposalsTableProps {
  proposals: ProposalSummary[];
  isHidden: (id: string) => boolean;
  togglingId: string | null;
  onToggleVisibility: (id: string) => void;
  onSelectProposal: (proposal: ProposalSummary) => void;
  isTogglingLoading: boolean;
}

export function ProposalsTable({
  proposals,
  isHidden,
  togglingId,
  onToggleVisibility,
  onSelectProposal,
  isTogglingLoading,
}: ProposalsTableProps) {
  return (
    <div className="w-full">
      <OuterBox color="w5" padding="sm" className="w-full overflow-hidden">
        <h5 className="uppercase text-nasun-white/80 text-sm tracking-widest mb-6 px-2 flex items-center gap-2">
          <span className="w-1 h-4 bg-nasun-c4 rounded-full"></span>
          Proposals Table
        </h5>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-nasun-c5/20">
                <th className="px-4 py-4 text-left text-xs font-semibold text-nasun-white/40 uppercase tracking-wider">
                  Title / Description
                </th>
                <th className="px-4 py-4 text-left text-xs font-semibold text-nasun-white/40 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-4 py-4 text-center text-xs font-semibold text-nasun-white/40 uppercase tracking-wider">
                  Yes
                </th>
                <th className="px-4 py-4 text-center text-xs font-semibold text-nasun-white/40 uppercase tracking-wider">
                  No
                </th>
                <th className="px-4 py-4 text-left text-xs font-semibold text-nasun-white/40 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-4 text-center text-xs font-semibold text-nasun-white/40 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-nasun-c5/10">
              {proposals.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-16 text-center text-nasun-white/30 font-light italic"
                  >
                    No proposals found on chain
                  </td>
                </tr>
              ) : (
                proposals.map((proposal) => (
                  <tr
                    key={proposal.id}
                    className={`hover:bg-nasun-white/5 transition-colors ${
                      isHidden(proposal.id) ? 'opacity-50' : ''
                    }`}
                  >
                    <td className="px-4 py-4 max-w-md">
                      <div className="flex items-start gap-3">
                        {isHidden(proposal.id) && (
                          <span className="text-nasun-c1 mt-1" title="Hidden from public">
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" />
                              <path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.065 7 9.542 7 .847 0 1.669-.105 2.454-.303z" />
                            </svg>
                          </span>
                        )}
                        <div>
                          <p className="text-nasun-white font-medium mb-1 line-clamp-1">
                            {proposal.title}
                          </p>
                          <p className="text-nasun-white/40 text-xs line-clamp-2 leading-relaxed">
                            {proposal.description}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`px-2 py-0.5 text-[10px] uppercase font-bold rounded-sm tracking-tighter ${
                          proposal.proposalType === 'Poll'
                            ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                            : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                        }`}
                      >
                        {proposal.proposalType}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className="text-green-400 font-mono text-sm">
                        {proposal.yesPower.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className="text-red-400 font-mono text-sm">
                        {proposal.noPower.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      {proposal.isDelisted ? (
                        <span className="text-red-400 text-xs font-medium">Delisted</span>
                      ) : proposal.isExpired ? (
                        <span className="text-nasun-white/30 text-xs">Expired</span>
                      ) : (
                        <span className="text-nasun-c1 text-xs font-medium animate-pulse-subtle">
                          Active
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => onSelectProposal(proposal)}
                          className="p-2 bg-nasun-c6/50 hover:bg-nasun-c5/50 text-nasun-white/70 hover:text-nasun-white rounded-sm transition-all border border-nasun-c5/20"
                          title="View Vote Details"
                        >
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                            />
                          </svg>
                        </button>
                        <button
                          onClick={() => onToggleVisibility(proposal.id)}
                          disabled={togglingId === proposal.id || isTogglingLoading}
                          className={`p-2 rounded-sm transition-all border disabled:opacity-30 flex items-center justify-center ${
                            isHidden(proposal.id)
                              ? 'bg-nasun-c1/20 border-nasun-c1/30 text-nasun-c1 hover:bg-nasun-c1/30'
                              : 'bg-nasun-c6/50 border-nasun-c5/20 text-nasun-white/70 hover:text-nasun-white'
                          }`}
                          title={isHidden(proposal.id) ? 'Unhide from Public' : 'Hide from Public'}
                        >
                          {togglingId === proposal.id ? (
                            <InlineLoading size="sm" />
                          ) : isHidden(proposal.id) ? (
                            <svg
                              className="w-4 h-4"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18"
                              />
                            </svg>
                          ) : (
                            <svg
                              className="w-4 h-4"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                              />
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                              />
                            </svg>
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </OuterBox>
    </div>
  );
}
