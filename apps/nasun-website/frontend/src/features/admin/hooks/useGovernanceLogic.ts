import { useState } from 'react';
import { toast } from 'react-hot-toast';
import { useHiddenProposals } from '../hooks/useHiddenProposals';
import { useAdminProposals } from '../hooks/useAdminProposals';
import { useProposalVoters } from '../hooks/useProposalVoters';
import { downloadBlob } from '../services/adminApi';
import type { ProposalSummary } from '../types';

export function useGovernanceLogic() {
  const [selectedProposalId, setSelectedProposalId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Queries
  const {
    data: proposals = [],
    isLoading: isLoadingProposals,
    isPending: isProposalsPending,
  } = useAdminProposals();

  const { isHidden, toggle, hiddenCount, isLoading: isHiddenLoading } = useHiddenProposals();

  // Derived state
  const selectedProposal = selectedProposalId
    ? proposals.find((p) => p.id === selectedProposalId) ?? null
    : null;

  const { data: voters = [], isLoading: isLoadingVoters } = useProposalVoters(
    selectedProposal?.votersTableId ?? null
  );

  // Handlers
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

  function handleCloseDetails() {
    setSelectedProposalId(null);
  }

  function handleExportVotersCSV() {
    if (!selectedProposal || voters.length === 0) return;

    setIsExporting(true);
    try {
      const headers = ['walletAddress', 'choice', 'votingPower'];
      const rows = voters.map((v) => [
        v.voter,
        v.votedYes ? 'Yes' : 'No',
        v.votingPower.toString(),
      ]);

      const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });

      const date = new Date().toISOString().split('T')[0];
      const filename = `proposal-votes-${selectedProposal.id.slice(0, 8)}-${date}.csv`;
      downloadBlob(blob, filename);
      toast.success('CSV export started');
    } catch {
      toast.error('Failed to export CSV');
    } finally {
      setIsExporting(false);
    }
  }

  return {
    // Data
    proposals,
    hiddenCount,
    selectedProposal,
    voters,
    isHidden,
    togglingId,

    // Loading States
    isLoadingProposals: isLoadingProposals || isProposalsPending,
    isLoadingVoters,
    isHiddenLoading,
    isExporting,
    isTogglingLoading: !!togglingId, // Derived loading state for UI convenience

    // Actions
    handleToggleVisibility,
    handleSelectProposal,
    handleCloseDetails,
    handleExportVotersCSV,
  };
}
