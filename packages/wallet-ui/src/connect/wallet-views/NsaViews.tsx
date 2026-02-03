/**
 * NSA (Smart Account) view routing.
 */

import {
  NsaSetupWizard,
  NsaAccountInfo,
  NsaAddSigner,
  NsaAcceptProposal,
  NsaBackupPanel,
  NsaGuardianSetup,
  NsaRecoveryPanel,
} from "../../nsa";
import type { ViewMode } from "../types";

export function NsaViewRouter({
  viewMode,
  setViewMode,
  selectedProposalId,
  setSelectedProposalId,
}: {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  selectedProposalId: string;
  setSelectedProposalId: (id: string) => void;
}) {
  if (viewMode === "nsa-setup") {
    return (
      <NsaSetupWizard
        onClose={() => setViewMode("main")}
        onSuccess={() => setViewMode("nsa-info")}
      />
    );
  }
  if (viewMode === "nsa-info") {
    return (
      <NsaAccountInfo
        onClose={() => setViewMode("main")}
        onNavigate={(mode) => setViewMode(mode as ViewMode)}
        onAcceptProposal={(proposalId) => {
          setSelectedProposalId(proposalId);
          setViewMode("nsa-accept-proposal");
        }}
      />
    );
  }
  if (viewMode === "nsa-add-signer") {
    return <NsaAddSigner onClose={() => setViewMode("nsa-info")} />;
  }
  if (viewMode === "nsa-accept-proposal") {
    return (
      <NsaAcceptProposal
        onClose={() => {
          setSelectedProposalId("");
          setViewMode("nsa-info");
        }}
        initialProposalId={selectedProposalId}
      />
    );
  }
  if (viewMode === "nsa-backup") {
    return <NsaBackupPanel onClose={() => setViewMode("nsa-info")} />;
  }
  if (viewMode === "nsa-guardians") {
    return <NsaGuardianSetup onClose={() => setViewMode("nsa-info")} />;
  }
  if (viewMode === "nsa-recovery") {
    return <NsaRecoveryPanel onClose={() => setViewMode("nsa-info")} />;
  }
  return null;
}
