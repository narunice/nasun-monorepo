import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AdminLayout } from "../components/AdminLayout";
import { useWallet, useZkLogin } from "@nasun/wallet";
import { WalletConnect } from "@nasun/wallet-ui";
import { useSuiClient } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { useNetworkVariable } from "@/config/suiNetworkConfig";
import {
  NASUN_DEVNET_PACKAGE_ID,
  NASUN_DEVNET_DASHBOARD_ID,
  NASUN_DEVNET_ADMIN_CAP,
} from "@/constants/suiPackageConstants";
import { toast } from "react-toastify";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { OuterBox } from "@/components/ui/OuterBox";
import { PageTitle } from "@/components/ui/PageTitle";
import { Button } from "@/components/ui/button";

type ProposalType = "Governance" | "Poll";

interface ProposalFormData {
  title: string;
  description: string;
  proposalType: ProposalType;
  durationHours: number;
}

export function CreateProposal() {
  const navigate = useNavigate();
  const suiClient = useSuiClient();
  const { status, account, getKeypair } = useWallet();
  const packageId = useNetworkVariable("packageId") || NASUN_DEVNET_PACKAGE_ID;
  const dashboardId = NASUN_DEVNET_DASHBOARD_ID;
  const adminCapId = NASUN_DEVNET_ADMIN_CAP;

  const { isConnected: isZkConnected } = useZkLogin();

  const [formData, setFormData] = useState<ProposalFormData>({
    title: "",
    description: "",
    proposalType: "Governance",
    durationHours: 72,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check if wallet is connected (local wallet only - zkLogin cannot own AdminCap)
  const isLocalWalletConnected = status === "unlocked" && account;
  // For proposal creation, we only allow local wallet (AdminCap owner)
  const canCreateProposal = isLocalWalletConnected;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!canCreateProposal) {
      setError("Please connect your Local Nasun Wallet (with AdminCap owner private key)");
      return;
    }

    const keypair = getKeypair();
    if (!keypair) {
      setError("Wallet unlocked but keypair not available. Please reconnect.");
      return;
    }

    if (!formData.title.trim() || !formData.description.trim()) {
      setError("Title and description are required");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Calculate expiration timestamp
      const expiresAt = Date.now() + formData.durationHours * 60 * 60 * 1000;

      // Build the transaction
      const tx = new Transaction();

      // Step 1: Create the proposal - returns the proposal ID
      const [proposalId] = tx.moveCall({
        target: `${packageId}::proposal::create`,
        arguments: [
          tx.object(adminCapId),
          tx.pure.string(formData.title),
          tx.pure.string(formData.description),
          tx.pure.u64(expiresAt),
        ],
      });

      // Step 2: Register the proposal to the dashboard
      tx.moveCall({
        target: `${packageId}::dashboard::register_proposal`,
        arguments: [tx.object(dashboardId), tx.object(adminCapId), proposalId],
      });

      // Step 3: If it's a Poll, set the proposal type (0 = Governance, 1 = Poll)
      // Note: This requires ProposalTypeRegistry object ID
      // For now, we skip this step as it requires additional setup

      // Sign and execute the transaction using local wallet keypair
      const result = await suiClient.signAndExecuteTransaction({
        signer: keypair,
        transaction: tx,
        options: {
          showEffects: true,
          showEvents: true,
        },
      });

      if (result.effects?.status?.status === "success") {
        toast.success("Proposal created successfully!");
        navigate("/admin/governance");
      } else {
        throw new Error(result.effects?.status?.error || "Transaction failed");
      }
    } catch (err) {
      console.error("Failed to create proposal:", err);
      setError(err instanceof Error ? err.message : "Failed to create proposal");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AdminLayout>
      <SectionLayout className="!max-w-3xl !pt-12">
        <div className="mb-8">
          <PageTitle as="h3" align="left" className="!mb-2">
            Create Proposal
          </PageTitle>
          <p className="text-nasun-white/60">
            Create a new governance proposal or poll. Requires AdminCap access.
          </p>
        </div>

        <div className="flex flex-col gap-6">
          {/* Wallet Connection */}
          <OuterBox color="w5" padding="md">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-medium text-nasun-white mb-1">Wallet Connection</h2>
                <p className="text-nasun-white/60 text-sm">
                  {isLocalWalletConnected
                    ? `Connected: ${account?.address?.slice(0, 10)}...${account?.address?.slice(-8)}`
                    : isZkConnected
                    ? "zkLogin connected (cannot create proposals - use Local Wallet)"
                    : "Connect your Nasun Wallet to create proposals"}
                </p>
                {isZkConnected && !isLocalWalletConnected && (
                  <p className="text-amber-400 text-xs mt-1">
                    zkLogin wallet cannot own AdminCap. Please import the admin private key via Local
                    Wallet.
                  </p>
                )}
                {!isLocalWalletConnected && !isZkConnected && (
                  <p className="text-nasun-white/40 text-xs mt-1">
                    Use &quot;Import Wallet&quot; with the admin private key.
                  </p>
                )}
              </div>
              <WalletConnect dropdownPosition="bottom" dropdownAlign="right" />
            </div>
          </OuterBox>

          {/* Create Proposal Form */}
          <OuterBox color="w5" padding="md" as="form" onSubmit={handleSubmit}>
            <h2 className="text-lg font-medium text-nasun-white mb-6">Proposal Details</h2>

            {/* Title */}
            <div className="mb-6">
              <label className="block text-sm text-nasun-white/70 mb-2">Title</label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Enter proposal title"
                className="w-full bg-gray-800/80 border border-nasun-c5/30 rounded-sm px-4 py-3 focus:border-nasun-c4/50 text-nasun-white placeholder-nasun-white/30 focus:outline-none"
                disabled={isSubmitting}
              />
            </div>

            {/* Description */}
            <div className="mb-6">
              <label className="block text-sm text-nasun-white/70 mb-2">Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Enter proposal description"
                rows={4}
                className="w-full bg-gray-800/80 border border-nasun-c5/30 rounded-sm px-4 py-3 focus:border-nasun-c4/50 text-nasun-white placeholder-nasun-white/30 focus:outline-none resize-none"
                disabled={isSubmitting}
              />
            </div>

            {/* Proposal Type */}
            <div className="mb-6">
              <label className="block text-sm text-nasun-white/70 mb-2">Proposal Type</label>
              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, proposalType: "Governance" })}
                  className={`flex-1 px-4 py-3 rounded-sm border transition-colors ${
                    formData.proposalType === "Governance"
                      ? "bg-amber-500/10 border-amber-500/50 text-amber-400"
                      : "bg-nasun-white/5 border-nasun-white/10 text-nasun-white/60 hover:border-nasun-white/30"
                  }`}
                  disabled={isSubmitting}
                >
                  <div className="font-medium">Governance</div>
                  <div className="text-xs mt-1 opacity-70">User pays gas fee</div>
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, proposalType: "Poll" })}
                  className={`flex-1 px-4 py-3 rounded-sm border transition-colors ${
                    formData.proposalType === "Poll"
                      ? "bg-blue-500/10 border-blue-500/50 text-blue-400"
                      : "bg-nasun-white/5 border-nasun-white/10 text-nasun-white/60 hover:border-nasun-white/30"
                  }`}
                  disabled={isSubmitting}
                >
                  <div className="font-medium">Poll</div>
                  <div className="text-xs mt-1 opacity-70">Sponsored (zero gas)</div>
                </button>
              </div>
            </div>

            {/* Duration */}
            <div className="mb-8">
              <label className="block text-sm text-nasun-white/70 mb-2">Voting Duration</label>
              <select
                value={formData.durationHours}
                onChange={(e) =>
                  setFormData({ ...formData, durationHours: Number(e.target.value) })
                }
                className="w-full bg-gray-800/80 border border-nasun-c5/30 rounded-sm px-4 py-3 focus:border-nasun-c4/50 text-nasun-white focus:outline-none [&>option]:bg-nasun-c6 [&>option]:text-nasun-white"
                disabled={isSubmitting}
              >
                <option value={24}>24 hours</option>
                <option value={48}>48 hours</option>
                <option value={72}>72 hours (3 days)</option>
                <option value={168}>168 hours (7 days)</option>
                <option value={336}>336 hours (14 days)</option>
              </select>
            </div>

            {/* Error */}
            {error && (
              <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-sm">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            {/* Submit Button */}
            <div className="flex gap-4">
              <Button
                type="button"
                variant="ghost"
                onClick={() => navigate("/admin/governance")}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="c4"
                className="flex-1"
                disabled={!canCreateProposal || isSubmitting}
              >
                {isSubmitting ? "Creating..." : "Create Proposal"}
              </Button>
            </div>
          </OuterBox>

          {/* Info */}
          <div className="p-4 bg-nasun-c1/5 border border-nasun-c1/10 rounded-sm">
            <p className="text-nasun-c1/80 text-sm">
              <strong className="font-medium">Note:</strong> Creating proposals requires the
              connected wallet to own the AdminCap object. The proposal will be created on-chain and
              immediately visible to all users.
            </p>
          </div>
        </div>
      </SectionLayout>
    </AdminLayout>
  );
}
