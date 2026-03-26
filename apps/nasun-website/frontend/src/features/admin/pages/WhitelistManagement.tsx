import { useState, useEffect, useCallback } from "react";
import { AdminLayout } from "../components/AdminLayout";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { DashboardCard } from "@/components/ui/DashboardCard";
import { OuterBox } from "@/components/ui/OuterBox";
import { Button } from "@/components/ui/button";
import { PageTitle } from "@/components/ui/PageTitle";
import { useAuth } from "@/features/auth";
import {
  exportBattalionAllowlist,
  exportGenesisPassAllowlist,
  downloadBlob,
  getGenesisPassEntries,
  addGenesisPassEntry,
  updateGenesisPassEntry,
  deleteGenesisPassEntry,
} from "../services/adminApi";
import type { GenesisPassEntry } from "../services/adminApi";
import { useWhitelistStats } from "../hooks/useWhitelistStats";

type Tab = "battalion" | "genesis-pass";

const EVM_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
const shortenAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

function GenesisPassCrudSection({ cognitoToken }: { cognitoToken: string }) {
  const [entries, setEntries] = useState<GenesisPassEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Add form state
  const [newAddress, setNewAddress] = useState("");
  const [newMintType, setNewMintType] = useState<string>("");
  const [newSource, setNewSource] = useState<string>("");
  const [isAdding, setIsAdding] = useState(false);

  // Edit state
  const [editingAddress, setEditingAddress] = useState<string | null>(null);
  const [editMintType, setEditMintType] = useState("");
  const [editSource, setEditSource] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);

  // Delete state
  const [deletingAddress, setDeletingAddress] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchEntries = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const items = await getGenesisPassEntries(cognitoToken);
      setEntries(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load entries");
    } finally {
      setIsLoading(false);
    }
  }, [cognitoToken]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const handleAdd = async () => {
    if (!newAddress.trim()) return;
    if (!EVM_ADDRESS_REGEX.test(newAddress.trim())) {
      setError("Invalid EVM address format (0x + 40 hex chars)");
      return;
    }
    setIsAdding(true);
    setError(null);
    try {
      await addGenesisPassEntry(cognitoToken, {
        walletAddress: newAddress.trim(),
        ...(newMintType && { mintType: newMintType }),
        ...(newSource && { source: newSource }),
      });
      setNewAddress("");
      setNewMintType("");
      setNewSource("");
      await fetchEntries();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add entry");
    } finally {
      setIsAdding(false);
    }
  };

  const handleUpdate = async () => {
    if (!editingAddress) return;
    setIsUpdating(true);
    setError(null);
    try {
      await updateGenesisPassEntry(cognitoToken, editingAddress, {
        mintType: editMintType,
        source: editSource,
      });
      setEditingAddress(null);
      await fetchEntries();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update entry");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingAddress) return;
    setIsDeleting(true);
    setError(null);
    try {
      await deleteGenesisPassEntry(cognitoToken, deletingAddress);
      setDeletingAddress(null);
      await fetchEntries();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete entry");
    } finally {
      setIsDeleting(false);
    }
  };

  const startEdit = (entry: GenesisPassEntry) => {
    setEditingAddress(entry.walletAddress);
    setEditMintType(entry.mintType || "");
    setEditSource(entry.source || "");
  };

  return (
    <OuterBox color="w5" padding="md" className="w-full mt-6">
      <h3 className="text-xl font-medium text-nasun-white mb-2">
        Manage Entries
      </h3>
      <p className="text-nasun-white/60 text-sm mb-6">
        Add, edit, or remove Genesis Pass allowlist entries. Total: {entries.length}
      </p>

      {error && (
        <div className="mb-4 p-3 bg-red-950/30 border border-red-900/50 rounded-sm text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Add Form */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6 p-4 bg-gray-800/50 rounded-sm">
        <input
          type="text"
          placeholder="0x... (EVM address)"
          value={newAddress}
          onChange={(e) => setNewAddress(e.target.value)}
          className="flex-1 px-3 py-2 bg-gray-900 border border-nasun-c5/30 rounded-sm text-nasun-white text-sm placeholder:text-nasun-white/30 focus:outline-none focus:border-nasun-c4/50"
        />
        <select
          value={newMintType}
          onChange={(e) => setNewMintType(e.target.value)}
          className="px-3 py-2 bg-gray-900 border border-nasun-c5/30 rounded-sm text-nasun-white text-sm focus:outline-none focus:border-nasun-c4/50"
        >
          <option value="">No mint type</option>
          <option value="FREE_MINT">FREE_MINT</option>
          <option value="GUARANTEED">GUARANTEED</option>
          <option value="FCFS">FCFS</option>
        </select>
        <input
          type="text"
          placeholder="Source (optional)"
          value={newSource}
          onChange={(e) => setNewSource(e.target.value)}
          className="w-32 px-3 py-2 bg-gray-900 border border-nasun-c5/30 rounded-sm text-nasun-white text-sm placeholder:text-nasun-white/30 focus:outline-none focus:border-nasun-c4/50"
        />
        <Button
          variant="filledOutlineC7"
          size="sm"
          onClick={handleAdd}
          disabled={isAdding || !newAddress.trim()}
        >
          {isAdding ? "Adding..." : "Add"}
        </Button>
      </div>

      {/* Entries Table */}
      {isLoading ? (
        <div className="text-nasun-white/40 text-sm py-8 text-center">Loading entries...</div>
      ) : entries.length === 0 ? (
        <div className="text-nasun-white/40 text-sm py-8 text-center">No entries found</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-nasun-c5/20 text-nasun-white/50 text-left">
                <th className="pb-2 pr-4 font-medium">Wallet</th>
                <th className="pb-2 pr-4 font-medium">Mint Type</th>
                <th className="pb-2 pr-4 font-medium">Source</th>
                <th className="pb-2 pr-4 font-medium">X Handle</th>
                <th className="pb-2 pr-4 font-medium">Registered</th>
                <th className="pb-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.walletAddress} className="border-b border-nasun-c5/10 hover:bg-nasun-c5/5">
                  <td className="py-2 pr-4 font-mono text-nasun-white/80">{shortenAddress(entry.walletAddress)}</td>
                  <td className="py-2 pr-4">
                    {entry.mintType === "FREE_MINT" ? (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 text-[10px] font-medium border border-amber-400/20">
                        FREE_MINT
                      </span>
                    ) : entry.mintType === "GUARANTEED" ? (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-medium border border-emerald-400/20">
                        GUARANTEED
                      </span>
                    ) : entry.mintType === "FCFS" ? (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-violet-500/10 text-violet-400 text-[10px] font-medium border border-violet-400/20">
                        FCFS
                      </span>
                    ) : (
                      <span className="text-nasun-white/30">-</span>
                    )}
                  </td>
                  <td className="py-2 pr-4 text-nasun-white/50">{entry.source || "-"}</td>
                  <td className="py-2 pr-4 text-nasun-white/50">{entry.twitterHandle ? `@${entry.twitterHandle}` : "-"}</td>
                  <td className="py-2 pr-4 text-nasun-white/40">{entry.registeredAt ? new Date(entry.registeredAt).toLocaleDateString("en-US") : "-"}</td>
                  <td className="py-2 text-right">
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => startEdit(entry)}
                        className="text-nasun-c4 hover:text-nasun-c4/80 text-xs"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setDeletingAddress(entry.walletAddress)}
                        className="text-red-400 hover:text-red-300 text-xs"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit Modal */}
      {editingAddress && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setEditingAddress(null)}>
          <div className="bg-gray-900 border border-nasun-c5/30 rounded-sm p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h4 className="text-nasun-white font-medium mb-4">Edit Entry</h4>
            <p className="text-nasun-white/50 text-sm mb-4 font-mono">{shortenAddress(editingAddress)}</p>
            <div className="flex flex-col gap-3 mb-4">
              <div>
                <label className="text-nasun-white/50 text-xs uppercase mb-1 block">Mint Type</label>
                <select
                  value={editMintType}
                  onChange={(e) => setEditMintType(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-800 border border-nasun-c5/30 rounded-sm text-nasun-white text-sm"
                >
                  <option value="">None</option>
                  <option value="FREE_MINT">FREE_MINT</option>
                  <option value="GUARANTEED">GUARANTEED</option>
                  <option value="FCFS">FCFS</option>
                </select>
              </div>
              <div>
                <label className="text-nasun-white/50 text-xs uppercase mb-1 block">Source</label>
                <input
                  type="text"
                  value={editSource}
                  onChange={(e) => setEditSource(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-800 border border-nasun-c5/30 rounded-sm text-nasun-white text-sm"
                  placeholder="e.g., RAFFLE"
                />
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <Button variant="outlineC5" size="sm" onClick={() => setEditingAddress(null)}>Cancel</Button>
              <Button variant="filledOutlineC7" size="sm" onClick={handleUpdate} disabled={isUpdating}>
                {isUpdating ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deletingAddress && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setDeletingAddress(null)}>
          <div className="bg-gray-900 border border-nasun-c5/30 rounded-sm p-6 max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h4 className="text-nasun-white font-medium mb-2">Delete Entry?</h4>
            <p className="text-nasun-white/50 text-sm mb-4">
              Remove <span className="font-mono text-nasun-white/80">{shortenAddress(deletingAddress)}</span> from the allowlist?
            </p>
            <div className="flex gap-3 justify-end">
              <Button variant="outlineC5" size="sm" onClick={() => setDeletingAddress(null)}>Cancel</Button>
              <Button variant="filledOutlineScarlet" size="sm" onClick={handleDelete} disabled={isDeleting}>
                {isDeleting ? "Deleting..." : "Delete"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </OuterBox>
  );
}

export function WhitelistManagement() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("genesis-pass");
  const [isExporting, setIsExporting] = useState(false);
  const [openSeaMintType, setOpenSeaMintType] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const { data: stats, isLoading: isLoadingStats, error: statsError } = useWhitelistStats();

  const handleExport = async (tab: Tab, format: "default" | "opensea" = "default", mintType?: string) => {
    if (!user?.cognitoToken) {
      setError("User not authenticated");
      return;
    }

    setIsExporting(true);
    setError(null);

    try {
      let blob: Blob;
      let prefix: string;

      if (tab === "genesis-pass") {
        blob = await exportGenesisPassAllowlist({
          cognitoToken: user.cognitoToken,
          format,
          ...(mintType && { mintType }),
        });
        const mintSuffix = mintType ? `-${mintType.toLowerCase().replace("_", "-")}` : "";
        prefix = format === "opensea" ? `genesis-pass-opensea${mintSuffix}-allowlist` : "genesis-pass-allowlist";
      } else {
        blob = await exportBattalionAllowlist({
          cognitoToken: user.cognitoToken,
          format,
        });
        prefix = format === "opensea" ? "battalion-opensea-allowlist" : "battalion-nft-allowlist";
      }

      const date = new Date().toISOString().split("T")[0];
      downloadBlob(blob, `${prefix}-all-${date}.csv`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Export failed";
      setError(message);
      console.error("Export failed:", err);
    } finally {
      setIsExporting(false);
    }
  };

  const tabClass = (tab: Tab) =>
    activeTab === tab
      ? "px-6 py-2 rounded-sm font-medium bg-nasun-c4 text-nasun-white shadow-lg"
      : "px-6 py-2 rounded-sm font-medium text-nasun-white/50 hover:text-nasun-white/80 transition-colors";

  return (
    <AdminLayout>
      <SectionLayout className="!max-w-6xl !pt-0">
        <div className="w-full mb-10 text-left">
          <PageTitle as="h3" align="left" className="">
            Allowlist Management
          </PageTitle>
          <p className="text-nasun-white/60 max-w-2xl -mt-6">
            Export, add, edit, and remove NFT allowlist entries.
          </p>
        </div>

        <div className="flex flex-col gap-6 md:gap-8 lg:gap-10 w-full">
          {/* Stats Grid */}
          {isLoadingStats ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
              {[1, 2, 3].map((i) => (
                <DashboardCard key={i} variant="default" className="animate-pulse">
                  <div className="h-4 bg-nasun-c5/20 rounded w-1/3 mb-4"></div>
                  <div className="h-8 bg-nasun-c5/20 rounded w-1/2"></div>
                </DashboardCard>
              ))}
            </div>
          ) : stats ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
              <DashboardCard variant="default">
                <h5 className="uppercase text-nasun-white/60 text-sm tracking-wider mb-2">
                  Genesis Pass Allowlist
                </h5>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold text-nasun-c1">
                    {(stats.genesisPass?.active ?? 0).toLocaleString()}
                  </span>
                  <span className="text-nasun-white/40 text-base font-light">Active Users</span>
                </div>
                <div className="mt-4 pt-4 border-t border-nasun-c5/20 text-nasun-white/50 text-sm">
                  Total: {(stats.genesisPass?.total ?? 0).toLocaleString()} registered /{" "}
                  {(stats.genesisPass?.withdrawn ?? 0).toLocaleString()} withdrawn
                </div>
                <div className="mt-2 text-nasun-c4 text-sm font-medium">
                  Paid Applied: {(stats.genesisPass?.paidApplied ?? 0).toLocaleString()}
                </div>
              </DashboardCard>

              <DashboardCard variant="default">
                <h5 className="uppercase text-nasun-white/60 text-sm tracking-wider mb-2">
                  Battalion NFT Allowlist
                </h5>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold text-nasun-c1">
                    {stats.battalion.active.toLocaleString()}
                  </span>
                  <span className="text-nasun-white/40 text-base font-light">Active Users</span>
                </div>
                <div className="mt-4 pt-4 border-t border-nasun-c5/20 text-nasun-white/50 text-sm">
                  Total: {stats.battalion.total.toLocaleString()} registered /{" "}
                  {stats.battalion.withdrawn.toLocaleString()} withdrawn
                </div>
              </DashboardCard>

              <DashboardCard variant="default">
                <h5 className="uppercase text-nasun-white/60 text-sm tracking-wider mb-2">
                  Frontiers Allowlist (Legacy)
                </h5>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold text-nasun-c1">
                    {stats.genesis.active.toLocaleString()}
                  </span>
                  <span className="text-nasun-white/40 text-base font-light">Active Users</span>
                </div>
                <div className="mt-4 pt-4 border-t border-nasun-c5/20 text-nasun-white/50 text-sm">
                  Total: {stats.genesis.total.toLocaleString()} registered /{" "}
                  {stats.genesis.withdrawn.toLocaleString()} withdrawn
                </div>
              </DashboardCard>
            </div>
          ) : null}

          {/* Stats Error */}
          {statsError && (
            <div className="p-4 bg-red-950/30 border border-red-900/50 rounded-sm text-red-400 text-base flex items-center gap-3">
              Failed to load stats: {statsError.message}
            </div>
          )}

          {/* Tabs & Content */}
          <div className="w-full">
            <div className="flex gap-2 mb-6 bg-nasun-c6/30 p-1 rounded-sm w-fit border border-nasun-c5/20">
              <button className={tabClass("genesis-pass")} onClick={() => { setActiveTab("genesis-pass"); setError(null); }}>
                Genesis Pass
              </button>
              <button className={tabClass("battalion")} onClick={() => { setActiveTab("battalion"); setError(null); }}>
                Battalion NFT
              </button>
            </div>

            {activeTab === "genesis-pass" && (
              <>
                <OuterBox color="w5" padding="md" className="w-full">
                  <h3 className="text-xl font-medium text-nasun-white mb-2">
                    Genesis Pass Allowlist
                  </h3>
                  <p className="text-nasun-white/60 text-base mb-8">
                    Export all wallet addresses registered for the Genesis Pass allowlist.
                  </p>

                  {error && (
                    <div className="mb-6 p-4 bg-red-950/30 border border-red-900/50 rounded-sm text-red-400 text-base flex items-center gap-3">
                      {error}
                    </div>
                  )}

                  <div className="flex flex-col gap-4">
                    <Button
                      onClick={() => handleExport("genesis-pass", "default")}
                      disabled={isExporting}
                      variant="outlineC5"
                      size="lg"
                      className="min-w-[180px] w-fit"
                    >
                      {isExporting ? "Exporting..." : "Download CSV (All)"}
                    </Button>
                    <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                      <span className="text-nasun-white/50 text-sm uppercase tracking-wider">OpenSea</span>
                      <select
                        value={openSeaMintType}
                        onChange={(e) => setOpenSeaMintType(e.target.value)}
                        disabled={isExporting}
                        className="px-3 py-2 bg-gray-900 border border-nasun-c5/30 rounded-sm text-nasun-white text-sm focus:outline-none focus:border-nasun-c4/50"
                      >
                        <option value="">All Tiers</option>
                        <option value="FREE_MINT">Free Mint</option>
                        <option value="GUARANTEED">Guaranteed</option>
                        <option value="FCFS">FCFS</option>
                        <option value="STANDARD">Standard</option>
                      </select>
                      <Button
                        onClick={() => handleExport("genesis-pass", "opensea", openSeaMintType || undefined)}
                        disabled={isExporting}
                        variant="c4"
                        size="lg"
                        className="min-w-[180px]"
                      >
                        {isExporting ? "Exporting..." : "Export OpenSea"}
                      </Button>
                    </div>
                  </div>
                </OuterBox>

                {/* CRUD Management Section */}
                {user?.cognitoToken && (
                  <GenesisPassCrudSection cognitoToken={user.cognitoToken} />
                )}
              </>
            )}

            {activeTab === "battalion" && (
              <OuterBox color="w5" padding="md" className="w-full">
                <h3 className="text-xl font-medium text-nasun-white mb-2">
                  Battalion NFT Allowlist
                </h3>
                <p className="text-nasun-white/60 text-base mb-8">
                  Export all wallet addresses registered for the Battalion NFT allowlist.
                </p>

                {error && (
                  <div className="mb-6 p-4 bg-red-950/30 border border-red-900/50 rounded-sm text-red-400 text-base flex items-center gap-3">
                    {error}
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-4">
                  <Button
                    onClick={() => handleExport("battalion", "default")}
                    disabled={isExporting}
                    variant="outlineC5"
                    size="lg"
                    className="min-w-[180px]"
                  >
                    {isExporting ? "Exporting..." : "Download CSV"}
                  </Button>
                  <Button
                    onClick={() => handleExport("battalion", "opensea")}
                    disabled={isExporting}
                    variant="c4"
                    size="lg"
                    className="min-w-[180px]"
                  >
                    {isExporting ? "Exporting..." : "OpenSea Format"}
                  </Button>
                </div>
              </OuterBox>
            )}
          </div>

          {/* Information Section */}
          <div className="w-full">
            <OuterBox color="w1" padding="sm" className="w-full">
              <h4 className="text-base font-semibold text-nasun-white/80 mb-3 uppercase tracking-wider flex items-center gap-2">
                <span className="w-1 h-4 bg-nasun-c1 rounded-full"></span>
                CSV Column Definitions
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <span className="text-sm font-medium text-nasun-c1 uppercase">
                    Standard Format
                  </span>
                  <p className="text-nasun-white/50 text-sm mt-1 leading-relaxed">
                    {activeTab === "battalion"
                      ? "walletAddress, verifiedAt, xUserId, xUsername, status"
                      : "walletAddress, identityId, registeredAt, status"}
                  </p>
                </div>
                <div>
                  <span className="text-sm font-medium text-nasun-c1 uppercase">
                    OpenSea Format
                  </span>
                  <p className="text-nasun-white/50 text-sm mt-1 leading-relaxed">
                    Optimized for OpenSea Allowlist upload. Includes only mandatory columns: Wallet
                    address, Mint limit, and Price.
                  </p>
                </div>
              </div>
            </OuterBox>
          </div>
        </div>
      </SectionLayout>
    </AdminLayout>
  );
}
