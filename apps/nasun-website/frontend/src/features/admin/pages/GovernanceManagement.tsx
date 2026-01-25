import { Link } from "react-router-dom";
import { AdminLayout } from "../components/AdminLayout";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { Button } from "@/components/ui/button";
import { PageTitle } from "@/components/ui/PageTitle";
import { PageLoading } from "@/components/ui/PageLoading";
import { GovernanceStats } from "../components/governance/GovernanceStats";
import { ProposalsTable } from "../components/governance/ProposalsTable";
import { VoterDetailsPanel } from "../components/governance/VoterDetailsPanel";
import { useGovernanceLogic } from "../hooks/useGovernanceLogic";

export function GovernanceManagement() {
  const {
    proposals,
    hiddenCount,
    selectedProposal,
    voters,
    isHidden,
    togglingId,
    isLoadingProposals,
    isLoadingVoters,
    isExporting,
    isTogglingLoading,
    handleToggleVisibility,
    handleSelectProposal,
    handleCloseDetails,
    handleExportVotersCSV,
  } = useGovernanceLogic();

  if (isLoadingProposals) {
    return (
      <AdminLayout>
        <PageLoading />
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <SectionLayout className="!max-w-6xl !pt-0">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10 w-full">
          <div>
            <PageTitle as="h3" align="left" className="">
              Governance Management
            </PageTitle>
            <p className="text-nasun-white/60  max-w-2xl  -mt-6">
              Review on-chain proposals, monitor voting power distribution, and manage content
              visibility.
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
          <GovernanceStats proposals={proposals} hiddenCount={hiddenCount} />

          {/* Proposals List */}
          <ProposalsTable
            proposals={proposals}
            isHidden={isHidden}
            togglingId={togglingId}
            onToggleVisibility={handleToggleVisibility}
            onSelectProposal={handleSelectProposal}
            isTogglingLoading={isTogglingLoading}
          />

          {/* Voter Details Modal/Panel */}
          {selectedProposal && (
            <VoterDetailsPanel
              proposal={selectedProposal}
              voters={voters}
              isLoading={isLoadingVoters}
              isExporting={isExporting}
              onExport={handleExportVotersCSV}
              onClose={handleCloseDetails}
            />
          )}
        </div>
      </SectionLayout>
    </AdminLayout>
  );
}
