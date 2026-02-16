/**
 * NSA (Smart Account) view routing.
 */

import { useState } from "react";
import { useNasunSmartAccount, useWallet } from "@nasun/wallet";
import {
  NsaSetupWizard,
  NsaAccountInfo,
  NsaAddSigner,
  NsaAcceptProposal,
  NsaBackupPanel,
  NsaRestorePanel,
  NsaGuardianSetup,
  NsaRecoveryPanel,
  NsaGuardianConnect,
} from "../../nsa";
import type { GuardianContext } from "../../nsa";
import type { ViewMode } from "../types";

export function NsaViewRouter({
  viewMode,
  setViewMode,
  selectedProposalId,
  setSelectedProposalId,
  setProposalBannerDismissed,
}: {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  selectedProposalId: string;
  setSelectedProposalId: (id: string) => void;
  setProposalBannerDismissed?: (v: boolean) => void;
}) {
  const { refreshIncomingInvitations } = useNasunSmartAccount();
  const { account } = useWallet();
  const [guardianContext, setGuardianContext] = useState<GuardianContext | null>(null);

  if (viewMode === "nsa-setup") {
    return (
      <NsaSetupWizard
        onClose={() => setViewMode("main")}
        onSuccess={() => setViewMode("nsa-info")}
        onRestoreFromBackup={() => setViewMode("nsa-restore")}
        onRecoverAsGuardian={() => setViewMode("nsa-guardian-connect")}
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
          if (account?.address) refreshIncomingInvitations(account.address);
          setProposalBannerDismissed?.(false);
          setViewMode("nsa-info");
        }}
        initialProposalId={selectedProposalId}
      />
    );
  }
  if (viewMode === "nsa-backup") {
    return <NsaBackupPanel onClose={() => setViewMode("nsa-info")} />;
  }
  if (viewMode === "nsa-restore") {
    return <NsaRestorePanel onClose={() => setViewMode("nsa-info")} />;
  }
  if (viewMode === "nsa-guardians") {
    return <NsaGuardianSetup onClose={() => setViewMode("nsa-info")} />;
  }
  if (viewMode === "nsa-guardian-connect") {
    return (
      <NsaGuardianConnect
        onClose={() => setViewMode("main")}
        onConnected={(ctx) => {
          setGuardianContext(ctx);
          setViewMode("nsa-recovery");
        }}
      />
    );
  }
  if (viewMode === "nsa-recovery") {
    return (
      <NsaRecoveryPanel
        onClose={() => {
          const wasGuardian = !!guardianContext;
          setGuardianContext(null);
          setViewMode(wasGuardian ? "main" : "nsa-info");
        }}
        guardianContext={guardianContext ?? undefined}
      />
    );
  }
  return null;
}
