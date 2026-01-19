import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { AdminLayout } from '../components/AdminLayout';
import { SectionLayout } from '@/components/layout/SectionLayout';
import { DashboardCard } from '@/components/ui/DashboardCard';
import { OuterBox } from '@/components/ui/OuterBox';
import { Button } from '@/components/ui/button';
import { downloadBlob } from '../services/adminApi';
import { useHiddenProposals } from '../hooks/useHiddenProposals';
import { useAdminProposals } from '../hooks/useAdminProposals';
import { useProposalVoters } from '../hooks/useProposalVoters';
import type { ProposalSummary } from '../types';

export function GovernanceManagement() {
  const [selectedProposalId, setSelectedProposalId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Fetch proposals using React Query hook
  const { data: proposals, isLoading: isLoadingProposals, isPending: isProposalsPending } = useAdminProposals();
  const { isHidden, toggle, hiddenCount, isLoading: isHiddenLoading } = useHiddenProposals();

  // Get selected proposal from proposals array
  const selectedProposal = selectedProposalId
    ? proposals.find((p) => p.id === selectedProposalId) ?? null
    : null;

  // Fetch voters using React Query hook (only when a proposal is selected)
  const {
    data: voters = [],
    isLoading: isLoadingVoters,
  } = useProposalVoters(selectedProposal?.votersTableId ?? null);

  async function handleToggleVisibility(proposalId: string) {
    setTogglingId(proposalId);
    try {
      await toggle(proposalId);
      toast.success(isHidden(proposalId) ? 'Proposal unhidden' : 'Proposal hidden');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to toggle visibility');
    } finally {
      setTogglingId(null);
    }
  }

  function handleSelectProposal(proposal: ProposalSummary) {
    setSelectedProposalId(proposal.id);
  }

  // Export voters as CSV
  function exportVotersCSV() {
    if (!selectedProposal || voters.length === 0) return;

    setIsExporting(true);
    try {
      const headers = ['walletAddress', 'choice', 'votingPower'];
      const rows = voters.map((v) => [v.voter, v.votedYes ? 'Yes' : 'No', v.votingPower.toString()]);

      const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });

      const date = new Date().toISOString().split('T')[0];
      const filename = `proposal-votes-${selectedProposal.id.slice(0, 8)}-${date}.csv`;
      downloadBlob(blob, filename);
    } finally {
      setIsExporting(false);
    }
  }

  if (isProposalsPending) {
    return (
      <AdminLayout>
        <div className="bg-nasun-black min-h-screen flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-nasun-c3 border-t-transparent" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="bg-nasun-black min-h-screen">
        <SectionLayout className="!max-w-6xl !pt-12">
          
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10 w-full">
            <div>
              <h2 className="text-nasun-white uppercase mb-4">
                Governance Management
              </h2>
              <p className="text-nasun-white/60 text-lg font-light max-w-2xl leading-relaxed">
                Review on-chain proposals, monitor voting power distribution, and manage content visibility.
              </p>
            </div>
            <Link to="/admin/governance/create">
              <Button variant="c4" size="lg" className="min-w-[180px]">
                Create Proposal
              </Button>
            </Link>
          </div>

          <div className="flex flex-col gap-8 w-full">
            {/* Stats Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 w-full">
              <DashboardCard className="bg-gray-800/30 border-nasun-c5/40 text-center">
                <span className="text-xs uppercase tracking-widest text-nasun-white/50 mb-2 block">Total</span>
                <span className="text-2xl font-bold text-nasun-white">{proposals.length}</span>
              </DashboardCard>
              <DashboardCard className="bg-gray-800/30 border-nasun-c5/40 text-center">
                <span className="text-xs uppercase tracking-widest text-nasun-white/50 mb-2 block">Active</span>
                <span className="text-2xl font-bold text-nasun-c3">
                  {proposals.filter((p) => !p.isExpired && !p.isDelisted).length}
                </span>
              </DashboardCard>
              <DashboardCard className="bg-gray-800/30 border-nasun-c5/40 text-center">
                <span className="text-xs uppercase tracking-widest text-nasun-white/50 mb-2 block">Expired</span>
                <span className="text-2xl font-bold text-nasun-white/40">
                  {proposals.filter((p) => p.isExpired || p.isDelisted).length}
                </span>
              </DashboardCard>
              <DashboardCard className="bg-gray-800/30 border-nasun-c5/40 text-center">
                <span className="text-xs uppercase tracking-widest text-nasun-white/50 mb-2 block">Hidden</span>
                <span className="text-2xl font-bold text-amber-400">{hiddenCount}</span>
              </DashboardCard>
            </div>

            {/* Proposals List */}
            <div className="w-full">
              <OuterBox color="c6" padding="sm" className="w-full border-nasun-c5/30 bg-gray-800/30 overflow-hidden">
                <h5 className="uppercase text-nasun-white/80 text-sm tracking-widest mb-6 px-2 flex items-center gap-2">
                  <span className="w-1 h-4 bg-nasun-c4 rounded-full"></span>
                  Proposals Table
                </h5>
                
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b border-nasun-c5/20">
                        <th className="px-4 py-4 text-left text-xs font-semibold text-nasun-white/40 uppercase tracking-wider">Title / Description</th>
                        <th className="px-4 py-4 text-left text-xs font-semibold text-nasun-white/40 uppercase tracking-wider">Type</th>
                        <th className="px-4 py-4 text-center text-xs font-semibold text-nasun-white/40 uppercase tracking-wider">Yes</th>
                        <th className="px-4 py-4 text-center text-xs font-semibold text-nasun-white/40 uppercase tracking-wider">No</th>
                        <th className="px-4 py-4 text-left text-xs font-semibold text-nasun-white/40 uppercase tracking-wider">Status</th>
                        <th className="px-4 py-4 text-center text-xs font-semibold text-nasun-white/40 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-nasun-c5/10">
                      {proposals.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-16 text-center text-nasun-white/30 font-light italic">
                            No proposals found on chain
                          </td>
                        </tr>
                      ) : (
                        proposals.map((proposal) => (
                          <tr
                            key={proposal.id}
                            className={`hover:bg-white/5 transition-colors ${isHidden(proposal.id) ? 'opacity-50' : ''}`}
                          >
                            <td className="px-4 py-4 max-w-md">
                              <div className="flex items-start gap-3">
                                {isHidden(proposal.id) && (
                                  <span className="text-amber-400 mt-1" title="Hidden from public">
                                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                      <path d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" />
                                      <path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.065 7 9.542 7 .847 0 1.669-.105 2.454-.303z" />
                                    </svg>
                                  </span>
                                )}
                                <div>
                                  <p className="text-nasun-white font-medium mb-1 line-clamp-1">{proposal.title}</p>
                                  <p className="text-nasun-white/40 text-xs line-clamp-2 leading-relaxed">{proposal.description}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-4">
                              <span className={`px-2 py-0.5 text-[10px] uppercase font-bold rounded tracking-tighter ${
                                proposal.proposalType === 'Poll'
                                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                                  : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                              }`}>
                                {proposal.proposalType}
                              </span>
                            </td>
                            <td className="px-4 py-4 text-center">
                              <span className="text-green-400 font-mono text-sm">{proposal.yesPower.toLocaleString()}</span>
                            </td>
                            <td className="px-4 py-4 text-center">
                              <span className="text-red-400 font-mono text-sm">{proposal.noPower.toLocaleString()}</span>
                            </td>
                            <td className="px-4 py-4">
                              {proposal.isDelisted ? (
                                <span className="text-red-400 text-xs font-medium">Delisted</span>
                              ) : proposal.isExpired ? (
                                <span className="text-nasun-white/30 text-xs">Expired</span>
                              ) : (
                                <span className="text-nasun-c3 text-xs font-medium animate-pulse-subtle">Active</span>
                              )}
                            </td>
                            <td className="px-4 py-4">
                              <div className="flex items-center justify-center gap-2">
                                <button
                                  onClick={() => handleSelectProposal(proposal)}
                                  className="p-2 bg-nasun-c6/50 hover:bg-nasun-c5/50 text-nasun-white/70 hover:text-nasun-white rounded-lg transition-all border border-nasun-c5/20"
                                  title="View Vote Details"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                  </svg>
                                </button>
                                <button
                                  onClick={() => handleToggleVisibility(proposal.id)}
                                  disabled={togglingId === proposal.id || isHiddenLoading}
                                  className={`p-2 rounded-lg transition-all border disabled:opacity-30 ${
                                    isHidden(proposal.id)
                                      ? 'bg-amber-500/20 border-amber-500/30 text-amber-400 hover:bg-amber-500/30'
                                      : 'bg-nasun-c6/50 border-nasun-c5/20 text-nasun-white/70 hover:text-nasun-white'
                                  }`}
                                  title={isHidden(proposal.id) ? 'Unhide from Public' : 'Hide from Public'}
                                >
                                  {togglingId === proposal.id ? (
                                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                  ) : isHidden(proposal.id) ? (
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                                    </svg>
                                  ) : (
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
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

            {/* Voter Details Modal/Panel */}
            {selectedProposal && (
              <div className="w-full">
                <OuterBox color="c1" padding="md" className="w-full border-nasun-c3/30 bg-gray-800/50">
                  <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 mb-8">
                    <div>
                      <h4 className="text-xl font-semibold text-nasun-white mb-2">{selectedProposal.title}</h4>
                      <p className="text-nasun-white/60 text-sm flex items-center gap-3">
                        <span className="flex items-center gap-1">
                          <strong className="text-nasun-c3">{voters.length}</strong> Participants
                        </span>
                        <span className="w-px h-3 bg-nasun-white/20"></span>
                        <span className="flex items-center gap-1">
                          Total Power: <strong className="text-nasun-white">{voters.reduce((sum, v) => sum + v.votingPower, 0).toLocaleString()}</strong>
                        </span>
                      </p>
                    </div>
                    <div className="flex gap-3">
                      <Button
                        onClick={exportVotersCSV}
                        disabled={voters.length === 0 || isExporting}
                        variant="c3"
                        size="md"
                      >
                        {isExporting ? 'Exporting...' : 'Export CSV'}
                      </Button>
                      <Button
                        onClick={() => setSelectedProposalId(null)}
                        variant="outlineC5"
                        size="md"
                      >
                        Close
                      </Button>
                    </div>
                  </div>

                  {isLoadingVoters ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-4">
                      <div className="animate-spin rounded-full h-8 w-8 border-2 border-nasun-c3 border-t-transparent" />
                      <p className="text-nasun-white/40 text-sm">Fetching on-chain voter data...</p>
                    </div>
                  ) : voters.length === 0 ? (
                    <div className="py-16 text-center text-nasun-white/30 italic font-light">
                      No votes have been cast for this proposal yet.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr className="border-b border-nasun-white/10">
                            <th className="px-4 py-3 text-left text-xs font-semibold text-nasun-white/40 uppercase">Voter Wallet</th>
                            <th className="px-4 py-3 text-center text-xs font-semibold text-nasun-white/40 uppercase">Choice</th>
                            <th className="px-4 py-3 text-right text-xs font-semibold text-nasun-white/40 uppercase">Voting Power</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-nasun-white/5 font-mono">
                          {voters.map((voter, idx) => (
                            <tr key={idx} className="hover:bg-white/5 transition-colors">
                              <td className="px-4 py-3 text-nasun-white/80 text-sm">
                                {voter.voter}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
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
            )}
          </div>

        </SectionLayout>
      </div>
    </AdminLayout>
  );
}
