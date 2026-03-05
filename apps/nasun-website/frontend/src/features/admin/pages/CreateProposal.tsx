import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AdminLayout } from "../components/AdminLayout";
import { useWallet, useZkLogin, useWalletStatus, useWalletAccount } from "@nasun/wallet";
import { WalletConnect } from "@nasun/wallet-ui";
import { useSuiClient } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { useNetworkVariable } from "@/config/suiNetworkConfig";
import {
  NASUN_DEVNET_PACKAGE_ID,
  NASUN_DEVNET_DASHBOARD_ID,
  NASUN_DEVNET_ADMIN_CAP,
} from "@/constants/suiPackageConstants";
import { GOVERNANCE } from "@nasun/devnet-config";
import { toast } from "react-toastify";
import { useInvalidateProposals } from "../hooks/useAdminProposals";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { OuterBox } from "@/components/ui/OuterBox";
import { PageTitle } from "@/components/ui/PageTitle";
import { Button } from "@/components/ui/button";

type ProposalType = "Governance" | "Poll";

interface ProposalFormData {
  title: string;
  description: string;
  proposalType: ProposalType;
  durationType: "preset" | "custom";
  durationHours: number;
  customEndDate: string;
}

export function CreateProposal() {
  const navigate = useNavigate();
  const suiClient = useSuiClient();
  const { getKeypair } = useWallet();
  // Use selector-based hooks for better reactivity
  const status = useWalletStatus();
  const account = useWalletAccount();
  const packageId = useNetworkVariable("packageId") || NASUN_DEVNET_PACKAGE_ID;
  const dashboardId = NASUN_DEVNET_DASHBOARD_ID;
  const adminCapId = NASUN_DEVNET_ADMIN_CAP;

  const { isConnected: isZkConnected } = useZkLogin();
  const invalidateProposals = useInvalidateProposals();

  const [formData, setFormData] = useState<ProposalFormData>({
    title: "",
    description: "",
    proposalType: "Governance",
    durationType: "preset",
    durationHours: 72,
    customEndDate: "",
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

    if (formData.durationType === "custom") {
      const endTime = new Date(formData.customEndDate).getTime();
      const minTime = Date.now() + 60 * 60 * 1000;
      const maxTime = Date.now() + 90 * 24 * 60 * 60 * 1000;
      if (!formData.customEndDate || isNaN(endTime)) {
        setError("Please select a valid end date");
        return;
      }
      if (endTime <= minTime) {
        setError("End date must be at least 1 hour from now");
        return;
      }
      if (endTime > maxTime) {
        setError("End date cannot exceed 90 days from now");
        return;
      }
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Calculate expiration timestamp
      const expiresAt = formData.durationType === "custom"
        ? new Date(formData.customEndDate).getTime()
        : Date.now() + formData.durationHours * 60 * 60 * 1000;

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

      // Step 3: Set proposal type in registry (0 = Governance, 1 = Poll)
      // proposal::create returns ID directly, which set_proposal_type accepts
      if (GOVERNANCE.proposalTypeRegistry) {
        const typeValue = formData.proposalType === "Poll" ? 1 : 0;
        tx.moveCall({
          target: `${packageId}::proposal::set_proposal_type`,
          arguments: [
            tx.object(GOVERNANCE.proposalTypeRegistry),
            tx.object(adminCapId),
            proposalId,
            tx.pure.u8(typeValue),
          ],
        });
      }

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
        // Wait for RPC to index the transaction before invalidating cache
        try {
          await suiClient.waitForTransaction({ digest: result.digest });
        } catch {
          console.warn("waitForTransaction timed out, proposal likely created");
        }
        invalidateProposals();
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
      <SectionLayout className="!max-w-3xl !pt-0">
        <div className="mb-8">
          <PageTitle as="h3" align="left" className="">
            Create Proposal
          </PageTitle>
          <p className="text-nasun-white/60 -mt-6">
            Create a new governance proposal or poll. Requires AdminCap access.
          </p>
        </div>

        <div className="flex flex-col gap-6">
          {/* Wallet Connection - z-50 ensures dropdown appears above other sections */}
          <OuterBox color="w5" padding="md" className="relative z-50">
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
                    zkLogin wallet cannot own AdminCap. Please import the admin private key via
                    Local Wallet.
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
          <OuterBox color="w5" padding="md">
            <form onSubmit={handleSubmit}>
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

              {/* Duration Type Toggle */}
              <div className="mb-4">
                <label className="block text-sm text-nasun-white/70 mb-2">Voting Duration</label>
                <div className="flex gap-4">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, durationType: "preset" })}
                    className={`px-4 py-2 rounded-sm border text-sm transition-colors ${
                      formData.durationType === "preset"
                        ? "bg-nasun-c4/10 border-nasun-c4/50 text-nasun-c4"
                        : "bg-nasun-white/5 border-nasun-white/10 text-nasun-white/60 hover:border-nasun-white/30"
                    }`}
                    disabled={isSubmitting}
                  >
                    Preset
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, durationType: "custom" })}
                    className={`px-4 py-2 rounded-sm border text-sm transition-colors ${
                      formData.durationType === "custom"
                        ? "bg-nasun-c4/10 border-nasun-c4/50 text-nasun-c4"
                        : "bg-nasun-white/5 border-nasun-white/10 text-nasun-white/60 hover:border-nasun-white/30"
                    }`}
                    disabled={isSubmitting}
                  >
                    Custom Date
                  </button>
                </div>
              </div>

              {/* Preset Duration Select */}
              {formData.durationType === "preset" && (
                <div className="mb-8">
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
              )}

              {/* Custom End Date Picker */}
              {formData.durationType === "custom" && (
                <div className="mb-8">
                  <label className="block text-sm text-nasun-white/70 mb-2">Voting End Date</label>
                  <input
                    type="datetime-local"
                    value={formData.customEndDate}
                    onChange={(e) => setFormData({ ...formData, customEndDate: e.target.value })}
                    min={new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16)}
                    className="w-full bg-gray-800/80 border border-nasun-c5/30 rounded-sm px-4 py-3 focus:border-nasun-c4/50 text-nasun-white focus:outline-none"
                    disabled={isSubmitting}
                  />
                  {formData.customEndDate && (
                    <p className="text-nasun-white/40 text-xs mt-2">
                      Expires: {new Date(formData.customEndDate).toLocaleString("en-US", { timeZone: "UTC" })} UTC
                    </p>
                  )}
                </div>
              )}

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
            </form>
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
