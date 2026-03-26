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
import { useQueryClient } from "@tanstack/react-query";
import { useInvalidateProposals } from "../hooks/useAdminProposals";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { useAdminAuth } from "../hooks/useAdminAuth";
import { hideProposal } from "../services/adminApi";
import { fetchHiddenProposalIds } from "@/features/governance/utils/hiddenProposals";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { OuterBox } from "@/components/ui/OuterBox";
import { PageTitle } from "@/components/ui/PageTitle";
import { Button } from "@/components/ui/button";

type ProposalType = "Governance" | "Poll";
type VoteFormat = "yes-no" | "multi-choice";

interface ProposalFormData {
  title: string;
  description: string;
  proposalType: ProposalType;
  voteFormat: VoteFormat;
  choices: string[];
  useEqualWeight: boolean;
  durationType: "preset" | "custom";
  durationHours: number;
  customEndDate: string;
  voteProofImageUrl: string;
}

export function CreateProposal() {
  const navigate = useNavigate();
  const suiClient = useSuiClient();
  const { getKeypair } = useWallet();
  // Use selector-based hooks for better reactivity
  const status = useWalletStatus();
  const account = useWalletAccount();
  const packageId = useNetworkVariable("packageId") || NASUN_DEVNET_PACKAGE_ID;
  const dashboardId = useNetworkVariable("dashboardId") || NASUN_DEVNET_DASHBOARD_ID;
  const adminCapId = NASUN_DEVNET_ADMIN_CAP;

  const { isConnected: isZkConnected } = useZkLogin();
  const { user } = useAuth();
  const { cognitoToken: adminToken } = useAdminAuth();
  const queryClient = useQueryClient();
  const invalidateProposals = useInvalidateProposals();

  const [formData, setFormData] = useState<ProposalFormData>({
    title: "",
    description: "",
    proposalType: "Governance",
    voteFormat: "yes-no",
    choices: ["", ""],
    useEqualWeight: true,
    durationType: "preset",
    durationHours: 72,
    customEndDate: "",
    voteProofImageUrl: "",
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

    if (formData.voteFormat === "multi-choice") {
      const validChoices = formData.choices.filter((c) => c.trim());
      if (validChoices.length < 2) {
        setError("Multi-choice proposals require at least 2 choices");
        return;
      }
      if (validChoices.length > 20) {
        setError("Maximum 20 choices allowed");
        return;
      }
      if (validChoices.some((c) => new TextEncoder().encode(c).length > 200)) {
        setError("Each choice must be 200 bytes or less");
        return;
      }
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

      let proposalId;

      if (formData.voteFormat === "multi-choice") {
        // Multi-choice proposal creation
        const validChoices = formData.choices.filter((c) => c.trim());
        [proposalId] = tx.moveCall({
          target: `${packageId}::multi_choice_proposal::create`,
          arguments: [
            tx.object(adminCapId),
            tx.pure.string(formData.title),
            tx.pure.string(formData.description),
            tx.pure.vector("string", validChoices),
            tx.pure.bool(formData.useEqualWeight),
            tx.pure.u64(expiresAt),
          ],
        });
      } else {
        // Yes/No proposal creation (existing flow)
        [proposalId] = tx.moveCall({
          target: `${packageId}::proposal::create`,
          arguments: [
            tx.object(adminCapId),
            tx.pure.string(formData.title),
            tx.pure.string(formData.description),
            tx.pure.u64(expiresAt),
          ],
        });
      }

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
          showObjectChanges: true,
        },
      });

      if (result.effects?.status?.status === "success") {
        // Wait for RPC to index the transaction before invalidating cache
        try {
          await suiClient.waitForTransaction({ digest: result.digest });
        } catch {
          console.warn("waitForTransaction timed out, proposal likely created");
        }

        // Auto-hide the proposal so it's not visible on the public page by default
        let autoHideSuccess = false;
        const createdProposal = result.objectChanges?.find(
          (change) =>
            change.type === "created" &&
            (change.objectType.includes("::proposal::Proposal") ||
              change.objectType.includes("::multi_choice_proposal::MultiChoiceProposal"))
        );

        const token = adminToken || user?.cognitoToken;
        if (createdProposal?.type === "created" && token) {
          try {
            await hideProposal(token, createdProposal.objectId);
            // Verify the proposal was actually hidden
            const hiddenList = await fetchHiddenProposalIds();
            if (!hiddenList.includes(createdProposal.objectId)) {
              console.warn("Auto-hide verification failed, retrying...");
              await hideProposal(token, createdProposal.objectId);
              const retryList = await fetchHiddenProposalIds();
              autoHideSuccess = retryList.includes(createdProposal.objectId);
            } else {
              autoHideSuccess = true;
            }
            queryClient.invalidateQueries({ queryKey: ["hiddenProposals"] });
            queryClient.invalidateQueries({ queryKey: ["hidden-proposals"] });
          } catch (hideErr) {
            console.error("Failed to auto-hide proposal:", hideErr);
          }
        } else if (!token) {
          console.error("Auto-hide skipped: no auth token available");
        }

        // Step 4: Set vote proof NFT image (2nd transaction, after shared object is indexed)
        let imageSetSuccess = !formData.voteProofImageUrl.trim(); // true if no image to set
        if (formData.voteProofImageUrl.trim() && createdProposal?.type === "created") {
          try {
            const imageTx = new Transaction();
            const imageTarget = formData.voteFormat === "multi-choice"
              ? `${packageId}::multi_choice_proposal::set_vote_proof_image`
              : `${packageId}::proposal::set_vote_proof_image`;

            imageTx.moveCall({
              target: imageTarget,
              arguments: [
                imageTx.object(createdProposal.objectId),
                imageTx.object(adminCapId),
                imageTx.pure.vector("u8",
                  Array.from(new TextEncoder().encode(formData.voteProofImageUrl.trim()))
                ),
              ],
            });

            await suiClient.signAndExecuteTransaction({
              signer: keypair,
              transaction: imageTx,
              options: { showEffects: true },
            });
            imageSetSuccess = true;
          } catch (imgErr) {
            console.error("Failed to set vote proof image:", imgErr);
          }
        }

        invalidateProposals();
        if (autoHideSuccess && imageSetSuccess) {
          toast.success("Proposal created successfully!");
        } else if (autoHideSuccess && !imageSetSuccess) {
          toast.warn("Proposal created but NFT image not set. Set it from the admin page.");
        } else {
          toast.warn("Proposal created but NOT hidden. Please hide it manually from the admin page.");
        }
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

              {/* Vote Proof NFT Image URL */}
              <div className="mb-6">
                <label className="block text-sm text-nasun-white/70 mb-2">
                  Vote Proof NFT Image URL
                  <span className="text-nasun-white/40 ml-1">(optional)</span>
                </label>
                <input
                  type="url"
                  value={formData.voteProofImageUrl}
                  onChange={(e) => setFormData({ ...formData, voteProofImageUrl: e.target.value })}
                  placeholder="https://... (leave empty for default image)"
                  className="w-full bg-gray-800/80 border border-nasun-c5/30 rounded-sm px-4 py-3 focus:border-nasun-c4/50 text-nasun-white placeholder-nasun-white/30 focus:outline-none"
                  disabled={isSubmitting}
                />
                {formData.voteProofImageUrl.trim() && (
                  <div className="mt-2">
                    <img
                      src={formData.voteProofImageUrl.trim()}
                      alt="NFT preview"
                      className="w-20 h-20 rounded-sm object-cover border border-nasun-white/10"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      onLoad={(e) => { (e.target as HTMLImageElement).style.display = 'block'; }}
                    />
                  </div>
                )}
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

              {/* Vote Format */}
              <div className="mb-6">
                <label className="block text-sm text-nasun-white/70 mb-2">Vote Format</label>
                <div className="flex gap-4">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, voteFormat: "yes-no" })}
                    className={`flex-1 px-4 py-3 rounded-sm border transition-colors ${
                      formData.voteFormat === "yes-no"
                        ? "bg-green-500/10 border-green-500/50 text-green-400"
                        : "bg-nasun-white/5 border-nasun-white/10 text-nasun-white/60 hover:border-nasun-white/30"
                    }`}
                    disabled={isSubmitting}
                  >
                    <div className="font-medium">Yes / No</div>
                    <div className="text-xs mt-1 opacity-70">Binary choice</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, voteFormat: "multi-choice" })}
                    className={`flex-1 px-4 py-3 rounded-sm border transition-colors ${
                      formData.voteFormat === "multi-choice"
                        ? "bg-purple-500/10 border-purple-500/50 text-purple-400"
                        : "bg-nasun-white/5 border-nasun-white/10 text-nasun-white/60 hover:border-nasun-white/30"
                    }`}
                    disabled={isSubmitting}
                  >
                    <div className="font-medium">Multi-Choice</div>
                    <div className="text-xs mt-1 opacity-70">Multiple options</div>
                  </button>
                </div>
              </div>

              {/* Multi-Choice Options */}
              {formData.voteFormat === "multi-choice" && (
                <>
                  <div className="mb-6">
                    <label className="block text-sm text-nasun-white/70 mb-2">
                      Choices ({formData.choices.filter((c) => c.trim()).length}/20)
                    </label>
                    <div className="space-y-2">
                      {formData.choices.map((choice, idx) => (
                        <div key={idx} className="flex gap-2">
                          <input
                            type="text"
                            value={choice}
                            onChange={(e) => {
                              const updated = [...formData.choices];
                              updated[idx] = e.target.value;
                              setFormData({ ...formData, choices: updated });
                            }}
                            placeholder={`Choice ${idx + 1}`}
                            className="flex-1 bg-gray-800/80 border border-nasun-c5/30 rounded-sm px-4 py-2 text-nasun-white placeholder-nasun-white/30 focus:outline-none focus:border-nasun-c4/50"
                            disabled={isSubmitting}
                          />
                          {formData.choices.length > 2 && (
                            <button
                              type="button"
                              onClick={() => {
                                const updated = formData.choices.filter((_, i) => i !== idx);
                                setFormData({ ...formData, choices: updated });
                              }}
                              className="px-3 py-2 text-red-400 hover:text-red-300 border border-red-500/20 rounded-sm hover:border-red-500/40 transition-colors"
                              disabled={isSubmitting}
                            >
                              X
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    {formData.choices.length < 20 && (
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, choices: [...formData.choices, ""] })}
                        className="mt-2 text-sm text-nasun-nw1 hover:text-nasun-nw4 transition-colors"
                        disabled={isSubmitting}
                      >
                        + Add Choice
                      </button>
                    )}
                  </div>

                  {/* Equal Weight Toggle */}
                  <div className="mb-6">
                    <label className="block text-sm text-nasun-white/70 mb-2">Voting Weight</label>
                    <div className="flex gap-4">
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, useEqualWeight: true })}
                        className={`flex-1 px-4 py-3 rounded-sm border transition-colors ${
                          formData.useEqualWeight
                            ? "bg-nasun-c4/10 border-nasun-c4/50 text-nasun-c4"
                            : "bg-nasun-white/5 border-nasun-white/10 text-nasun-white/60 hover:border-nasun-white/30"
                        }`}
                        disabled={isSubmitting}
                      >
                        <div className="font-medium">Equal Weight</div>
                        <div className="text-xs mt-1 opacity-70">1 vote per wallet</div>
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, useEqualWeight: false })}
                        className={`flex-1 px-4 py-3 rounded-sm border transition-colors ${
                          !formData.useEqualWeight
                            ? "bg-nasun-c4/10 border-nasun-c4/50 text-nasun-c4"
                            : "bg-nasun-white/5 border-nasun-white/10 text-nasun-white/60 hover:border-nasun-white/30"
                        }`}
                        disabled={isSubmitting}
                      >
                        <div className="font-medium">Weighted</div>
                        <div className="text-xs mt-1 opacity-70">Based on voting power</div>
                      </button>
                    </div>
                  </div>
                </>
              )}

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
                    min={(() => {
                      const d = new Date(Date.now() + 60 * 60 * 1000);
                      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
                    })()}
                    className="w-full bg-gray-800/80 border border-nasun-c5/30 rounded-sm px-4 py-3 focus:border-nasun-c4/50 text-nasun-white focus:outline-none"
                    disabled={isSubmitting}
                  />
                  {formData.customEndDate && (
                    <p className="text-nasun-white/40 text-xs mt-2">
                      Expires: {new Date(formData.customEndDate).toLocaleString("en-US")} (local time)
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
              connected wallet to own the AdminCap object. The proposal will be created on-chain but
              hidden by default. Use the governance admin page to make it visible.
            </p>
          </div>

          {/* Live Preview */}
          {formData.title.trim() && (
            <div className="border-t border-nasun-white/10 pt-6">
              <h3 className="text-sm font-semibold text-nasun-white/60 uppercase tracking-wider mb-4">
                Preview
              </h3>
              <ProposalPreview formData={formData} />
            </div>
          )}
        </div>
      </SectionLayout>
    </AdminLayout>
  );
}

/** Live preview that mirrors ProposalDetailPage layout */
function ProposalPreview({ formData }: { formData: ProposalFormData }) {
  const isMultiChoice = formData.voteFormat === "multi-choice";
  const validChoices = formData.choices.filter((c) => c.trim());

  const expiresAt = formData.durationType === "custom" && formData.customEndDate
    ? new Date(formData.customEndDate).getTime()
    : Date.now() + formData.durationHours * 60 * 60 * 1000;

  const remaining = expiresAt - Date.now();
  const d = Math.floor(remaining / 86400000);
  const h = Math.floor((remaining % 86400000) / 3600000);
  const timeLabel = d > 0 ? `${d}d ${h}h left` : `${h}h left`;

  return (
    <OuterBox color="w5" padding="md">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-medium text-nasun-white">Detail Page Preview</h2>
        <span className="text-xs text-nasun-white/30 uppercase">How voters will see it</span>
      </div>

      {/* Simulated detail page */}
      <div className="border border-nasun-white/10 rounded-sm bg-[#191615] p-5 space-y-4">
        {/* Badges */}
        <div className="flex items-center gap-2">
          {formData.proposalType === "Poll" ? (
            <span className="px-3 py-1 text-xs uppercase font-bold rounded-full bg-nasun-nw1/20 text-nasun-nw1 border border-nasun-nw1/30">
              Poll
            </span>
          ) : (
            <span className="px-3 py-1 text-xs uppercase font-bold rounded-full bg-nasun-nw4/20 text-nasun-nw4 border border-nasun-nw4/30">
              Governance
            </span>
          )}
          <span className="px-3 py-1 text-xs uppercase font-bold rounded-full border bg-green-500/20 border-green-500/30 text-green-400">
            Active
          </span>
        </div>

        {/* Title */}
        <h2 className="text-2xl md:text-3xl font-bold text-nasun-white leading-tight">
          {formData.title}
        </h2>

        {/* Two-column layout */}
        <div className={`grid grid-cols-1 ${isMultiChoice ? "lg:grid-cols-2" : "lg:grid-cols-[1fr_320px]"} gap-4 items-start`}>
          {/* Description */}
          <div className="border border-nasun-white/10 rounded-sm p-4 bg-gray-900 min-h-[200px]">
            <p className="text-nasun-white/90 whitespace-pre-wrap leading-relaxed">
              {formData.description || <span className="text-nasun-white/20 italic">Description will appear here...</span>}
            </p>
          </div>

          {/* Sidebar */}
          <div className="flex flex-col gap-4">
            {/* Vote Results */}
            <div className="border border-nasun-white/10 rounded-sm p-4">
              <h3 className="text-base font-medium text-nasun-white/90 uppercase tracking-wider mb-3">
                Vote Results
              </h3>
              {isMultiChoice ? (
                <div className="space-y-3">
                  {validChoices.map((choice, idx) => (
                    <div key={idx}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-nasun-white/80 truncate mr-2">{choice}</span>
                        <span className="text-nasun-white/50">0%</span>
                      </div>
                      <div className="w-full h-2.5 rounded-full overflow-hidden bg-nasun-white/10">
                        <div className="h-full bg-nasun-nw1" style={{ width: "0%" }} />
                      </div>
                    </div>
                  ))}
                  {formData.useEqualWeight && (
                    <p className="text-xs text-nasun-white/30 mt-1">Equal Weight: 1 vote per wallet</p>
                  )}
                </div>
              ) : (
                <>
                  <div className="w-full h-3 rounded-full overflow-hidden bg-red-500/30 mb-3">
                    <div className="h-full bg-green-500" style={{ width: "50%" }} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-green-500/10 border border-green-500/20 rounded-sm p-3 text-center">
                      <div className="text-2xl font-bold text-green-400">50.0%</div>
                      <div className="text-sm text-nasun-white/70">Yes</div>
                      <div className="text-base font-medium text-green-400 mt-1">0</div>
                      <div className="text-xs text-nasun-white/30">voting power</div>
                    </div>
                    <div className="bg-red-500/10 border border-red-500/20 rounded-sm p-3 text-center">
                      <div className="text-2xl font-bold text-red-400">50.0%</div>
                      <div className="text-sm text-nasun-white/70">No</div>
                      <div className="text-base font-medium text-red-400 mt-1">0</div>
                      <div className="text-xs text-nasun-white/30">voting power</div>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Details */}
            <div className="border border-nasun-white/10 rounded-sm p-4">
              <h3 className="text-base font-medium text-nasun-white/90 uppercase tracking-wider mb-3">
                Details
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-nasun-white/70">Proposal ID</span>
                  <span className="text-nasun-nw1 font-mono">0x0000...0000</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-nasun-white/70">Expiration</span>
                  <span className="text-nasun-white/80">{timeLabel}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-nasun-white/70">Type</span>
                  <span className="text-nasun-white/80">
                    {formData.proposalType === "Poll" ? "Poll (Zero Gas)" : "Governance (Gas Required)"}
                  </span>
                </div>
              </div>
            </div>

            {/* Vote Button */}
            <button
              type="button"
              disabled
              className="w-full py-3 rounded-sm text-sm font-medium uppercase bg-gradient-to-r from-nasun-nw1/30 to-nasun-nw4/30 text-nasun-white/60 border border-nasun-white/10 cursor-not-allowed"
            >
              Vote on this Proposal
            </button>
          </div>
        </div>
      </div>
    </OuterBox>
  );
}
