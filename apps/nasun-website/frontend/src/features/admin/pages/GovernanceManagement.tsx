import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { AdminLayout } from '../components/AdminLayout';
import { useSuiClientQuery, useSuiClient } from '@mysten/dapp-kit';
import { useNetworkVariable } from '@/config/suiNetworkConfig';
import { SuiObjectData, DynamicFieldPage } from '@mysten/sui/client';
import { downloadBlob } from '../services/adminApi';

type ProposalType = 'Governance' | 'Poll';

interface ProposalSummary {
  id: string;
  title: string;
  description: string;
  yesVotes: number;
  noVotes: number;
  yesPower: number;
  noPower: number;
  expiration: number;
  isExpired: boolean;
  isDelisted: boolean;
  proposalType: ProposalType;
  votersTableId: string;
  creator: string;
}

interface VoterRecord {
  voter: string;
  votedYes: boolean;
  votingPower: number;
}

export function GovernanceManagement() {
  const dashboardId = useNetworkVariable('dashboardId');
  const suiClient = useSuiClient();
  const [proposals, setProposals] = useState<ProposalSummary[]>([]);
  const [selectedProposal, setSelectedProposal] = useState<ProposalSummary | null>(null);
  const [voters, setVoters] = useState<VoterRecord[]>([]);
  const [isLoadingVoters, setIsLoadingVoters] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Fetch Dashboard
  const { data: dashboardData, isPending: isDashboardPending } = useSuiClientQuery('getObject', {
    id: dashboardId,
    options: { showContent: true },
  });

  // Extract proposal IDs from dashboard
  const proposalIds = getDashboardProposalIds(dashboardData?.data);

  // Fetch all proposals
  useEffect(() => {
    async function fetchProposals() {
      if (proposalIds.length === 0) return;

      const proposalPromises = proposalIds.map(async (id) => {
        const res = await suiClient.getObject({ id, options: { showContent: true } });
        return parseProposalSummary(res.data);
      });

      const results = await Promise.all(proposalPromises);
      setProposals(results.filter((p): p is ProposalSummary => p !== null));
    }

    fetchProposals();
  }, [proposalIds.join(','), suiClient]);

  // Fetch voters for selected proposal
  async function fetchVoters(proposal: ProposalSummary) {
    setIsLoadingVoters(true);
    setSelectedProposal(proposal);
    setVoters([]);

    try {
      const voterRecords: VoterRecord[] = [];
      let cursor: string | null = null;

      // Paginate through all dynamic fields in voters table
      do {
        const page: DynamicFieldPage = await suiClient.getDynamicFields({
          parentId: proposal.votersTableId,
          cursor,
          limit: 50,
        });

        // Fetch each voter's data
        for (const field of page.data) {
          const voterData = await suiClient.getDynamicFieldObject({
            parentId: proposal.votersTableId,
            name: field.name,
          });

          const voter = parseVoterRecord(field.name, voterData.data);
          if (voter) {
            voterRecords.push(voter);
          }
        }

        cursor = page.hasNextPage ? page.nextCursor ?? null : null;
      } while (cursor);

      setVoters(voterRecords);
    } catch (err) {
      console.error('Failed to fetch voters:', err);
    } finally {
      setIsLoadingVoters(false);
    }
  }

  // Export voters as CSV
  async function exportVotersCSV() {
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

  if (isDashboardPending) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <p className="text-white/60">Loading...</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Governance Management</h1>
            <p className="text-white/60">Manage proposals and view vote results.</p>
          </div>
          <Link
            to="/admin/governance/create"
            className="px-4 py-2 bg-nasun-c4 text-white rounded-lg hover:bg-nasun-c5 transition-colors"
          >
            Create Proposal
          </Link>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white/5 border border-white/10 rounded-lg p-4">
            <p className="text-white/60 text-sm">Total Proposals</p>
            <p className="text-2xl font-bold text-white">{proposals.length}</p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-lg p-4">
            <p className="text-white/60 text-sm">Active</p>
            <p className="text-2xl font-bold text-nasun-c3">
              {proposals.filter((p) => !p.isExpired && !p.isDelisted).length}
            </p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-lg p-4">
            <p className="text-white/60 text-sm">Expired/Delisted</p>
            <p className="text-2xl font-bold text-white/50">
              {proposals.filter((p) => p.isExpired || p.isDelisted).length}
            </p>
          </div>
        </div>

        {/* Proposals Table */}
        <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden mb-6">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-white/5">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-white/70">Title</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-white/70">Type</th>
                  <th className="px-4 py-3 text-center text-sm font-medium text-white/70">Yes</th>
                  <th className="px-4 py-3 text-center text-sm font-medium text-white/70">No</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-white/70">Status</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-white/70">Expiration</th>
                  <th className="px-4 py-3 text-center text-sm font-medium text-white/70">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {proposals.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-white/60">
                      No proposals found
                    </td>
                  </tr>
                ) : (
                  proposals.map((proposal) => (
                    <tr key={proposal.id} className="hover:bg-white/5">
                      <td className="px-4 py-3">
                        <p className="text-white font-medium">{proposal.title}</p>
                        <p className="text-white/50 text-sm truncate max-w-xs">{proposal.description}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-1 text-xs rounded-full ${
                            proposal.proposalType === 'Poll'
                              ? 'bg-blue-500/20 text-blue-400 border border-blue-500/50'
                              : 'bg-amber-500/20 text-amber-400 border border-amber-500/50'
                          }`}
                        >
                          {proposal.proposalType}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-green-400">{proposal.yesPower}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-red-400">{proposal.noPower}</span>
                      </td>
                      <td className="px-4 py-3">
                        {proposal.isDelisted ? (
                          <span className="text-red-400">Delisted</span>
                        ) : proposal.isExpired ? (
                          <span className="text-white/50">Expired</span>
                        ) : (
                          <span className="text-nasun-c3">Active</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-white/70 text-sm">
                        {new Date(proposal.expiration).toLocaleString('en-US', {
                          month: 'short',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => fetchVoters(proposal)}
                          className="px-3 py-1 text-sm bg-white/10 text-white rounded hover:bg-white/20 transition-colors"
                        >
                          View Votes
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Voter Details Panel */}
        {selectedProposal && (
          <div className="bg-white/5 border border-white/10 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-semibold text-white">{selectedProposal.title}</h2>
                <p className="text-white/60 text-sm">
                  {voters.length} voter{voters.length !== 1 ? 's' : ''} |{' '}
                  Total Power: {voters.reduce((sum, v) => sum + v.votingPower, 0)}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={exportVotersCSV}
                  disabled={voters.length === 0 || isExporting}
                  className="px-4 py-2 bg-nasun-c4 text-white rounded-lg hover:bg-nasun-c5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isExporting ? 'Exporting...' : 'Export CSV'}
                </button>
                <button
                  onClick={() => setSelectedProposal(null)}
                  className="px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>

            {isLoadingVoters ? (
              <div className="flex items-center justify-center py-8">
                <p className="text-white/60">Loading voters...</p>
              </div>
            ) : voters.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <p className="text-white/60">No votes yet</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-white/5">
                    <tr>
                      <th className="px-4 py-2 text-left text-sm font-medium text-white/70">Wallet</th>
                      <th className="px-4 py-2 text-center text-sm font-medium text-white/70">Choice</th>
                      <th className="px-4 py-2 text-center text-sm font-medium text-white/70">Voting Power</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {voters.map((voter, idx) => (
                      <tr key={idx} className="hover:bg-white/5">
                        <td className="px-4 py-2 text-white font-mono text-sm">
                          {voter.voter.slice(0, 10)}...{voter.voter.slice(-8)}
                        </td>
                        <td className="px-4 py-2 text-center">
                          <span
                            className={`px-2 py-1 text-xs rounded ${
                              voter.votedYes
                                ? 'bg-green-500/20 text-green-400'
                                : 'bg-red-500/20 text-red-400'
                            }`}
                          >
                            {voter.votedYes ? 'Yes' : 'No'}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-center text-white">{voter.votingPower}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

// Helper functions
function getDashboardProposalIds(data: SuiObjectData | null | undefined): string[] {
  if (!data || data.content?.dataType !== 'moveObject') return [];
  const fields = data.content.fields as { proposals_ids?: string[] };
  return fields.proposals_ids || [];
}

function parseProposalSummary(data: SuiObjectData | null | undefined): ProposalSummary | null {
  if (!data || data.content?.dataType !== 'moveObject') return null;

  const fields = data.content.fields as {
    title: string;
    description: string;
    vote_count_yes?: number;
    vote_count_no?: number;
    total_power_yes?: number;
    total_power_no?: number;
    expiration: number;
    status: { variant: string };
    voters?: { fields: { id: { id: string } } };
    creator: string;
  };

  const expiration = Number(fields.expiration);
  const isExpired = new Date(expiration) < new Date();
  const isDelisted = fields.status?.variant === 'Delisted';

  return {
    id: data.objectId,
    title: fields.title,
    description: fields.description,
    yesVotes: fields.vote_count_yes || 0,
    noVotes: fields.vote_count_no || 0,
    yesPower: Number(fields.total_power_yes) || 0,
    noPower: Number(fields.total_power_no) || 0,
    expiration,
    isExpired,
    isDelisted,
    proposalType: 'Governance', // TODO: Query ProposalTypeRegistry for accurate type
    votersTableId: fields.voters?.fields?.id?.id || '',
    creator: fields.creator,
  };
}

function parseVoterRecord(
  name: { type: string; value: unknown },
  data: SuiObjectData | null | undefined
): VoterRecord | null {
  if (!data || data.content?.dataType !== 'moveObject') return null;

  const fields = data.content.fields as {
    voted_yes?: boolean;
    voting_power?: number;
  };

  // The name value is the voter address
  const voter = typeof name.value === 'string' ? name.value : String(name.value);

  return {
    voter,
    votedYes: fields.voted_yes ?? false,
    votingPower: Number(fields.voting_power) || 0,
  };
}
