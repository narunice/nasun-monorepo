import { useState } from "react";
import { Star } from "lucide-react";
import { AdminLayout } from "../components/AdminLayout";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { Button } from "@/components/ui/button";
import { PageTitle } from "@/components/ui/PageTitle";
import { OuterBox } from "@/components/ui/OuterBox";
import { PageLoading } from "@/components/ui/PageLoading";
import { useAdminAuth } from "../hooks/useAdminAuth";
import {
  useAdminNftCollections,
  useCreateNftCollection,
  useUpdateNftCollection,
  useDeleteNftCollection,
} from "../hooks/useNftCollections";
import type { NftCollection, NFTChain } from "../types/index";

const CHAIN_OPTIONS: { value: NFTChain; label: string }[] = [
  { value: "ethereum", label: "Ethereum" },
  { value: "polygon", label: "Polygon" },
];

function ChainBadge({ chain }: { chain: NFTChain }) {
  const isEth = chain === "ethereum";
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
        isEth ? "bg-blue-500/20 text-blue-300" : "bg-purple-500/20 text-purple-300"
      }`}
    >
      {isEth ? "ETH" : "POLY"}
    </span>
  );
}

function EnabledBadge({ enabled }: { enabled: boolean }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
        enabled ? "bg-green-500/20 text-green-300" : "bg-gray-500/20 text-gray-400"
      }`}
    >
      {enabled ? "Active" : "Disabled"}
    </span>
  );
}

function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function NftCollectionManagement() {
  const { cognitoToken } = useAdminAuth();

  const { data: collections, isLoading, error } = useAdminNftCollections(cognitoToken);
  const createMutation = useCreateNftCollection(cognitoToken);
  const updateMutation = useUpdateNftCollection(cognitoToken);
  const deleteMutation = useDeleteNftCollection(cognitoToken);

  // Add form state
  const [contractAddress, setContractAddress] = useState("");
  const [chain, setChain] = useState<NFTChain>("polygon");
  const [collectionName, setCollectionName] = useState("");
  const [featured, setFeatured] = useState(false);
  const [formError, setFormError] = useState("");

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<NftCollection | null>(null);

  const handleAdd = async () => {
    setFormError("");

    if (!contractAddress.trim() || !collectionName.trim()) {
      setFormError("Contract address and collection name are required.");
      return;
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(contractAddress.trim())) {
      setFormError("Invalid contract address format (must be 0x + 40 hex characters).");
      return;
    }

    try {
      await createMutation.mutateAsync({
        contractAddress: contractAddress.trim(),
        chain,
        collectionName: collectionName.trim(),
        featured,
      });
      setContractAddress("");
      setCollectionName("");
      setFeatured(false);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Failed to create collection");
    }
  };

  const handleToggleEnabled = async (collection: NftCollection) => {
    try {
      const newEnabled = !collection.enabled;
      await updateMutation.mutateAsync({
        collectionId: collection.collectionId,
        updates: newEnabled ? { enabled: true } : { enabled: false, featured: false },
      });
    } catch (err) {
      console.error("Toggle failed:", err);
    }
  };

  const handleToggleFeatured = async (collection: NftCollection) => {
    try {
      await updateMutation.mutateAsync({
        collectionId: collection.collectionId,
        updates: { featured: !collection.featured },
      });
    } catch (err) {
      console.error("Toggle featured failed:", err);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget.collectionId);
      setDeleteTarget(null);
    } catch (err) {
      console.error("Delete failed:", err);
    }
  };

  if (isLoading) {
    return (
      <AdminLayout>
        <PageLoading />
      </AdminLayout>
    );
  }

  const enabledCount = collections?.filter((c) => c.enabled).length ?? 0;
  const totalCount = collections?.length ?? 0;

  return (
    <AdminLayout>
      <SectionLayout className="!max-w-6xl !pt-0">
        {/* Header */}
        <div className="mb-10">
          <PageTitle as="h3" align="left">
            NFT Collection Management
          </PageTitle>
          <p className="text-nasun-white/80 max-w-2xl -mt-6">
            Manage which NFT collections are displayed in MY ASSETS. Only enabled collections will
            be shown to users. If no collections are registered, all NFTs will be displayed.
          </p>
        </div>

        <div className="flex flex-col gap-8 w-full">
          {/* Add Collection Form */}
          <OuterBox color="w1" padding="md">
            <h3 className="text-nasun-white font-medium text-lg mb-4">Add Collection</h3>
            <div className="flex flex-col gap-3">
              <div className="flex gap-3">
                <input
                  type="text"
                  value={contractAddress}
                  onChange={(e) => setContractAddress(e.target.value)}
                  placeholder="Contract address (0x...)"
                  className="flex-1 bg-gray-800/80 border border-nasun-c5/45 rounded-sm px-4 py-2.5 text-nasun-white placeholder:text-nasun-white/50 focus:outline-none focus:border-nasun-c4 font-mono text-sm"
                />
                <select
                  value={chain}
                  onChange={(e) => setChain(e.target.value as NFTChain)}
                  className="bg-gray-800/80 border border-nasun-c5/45 rounded-sm px-4 py-2.5 text-nasun-white focus:outline-none focus:border-nasun-c4"
                >
                  {CHAIN_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3 items-center">
                <input
                  type="text"
                  value={collectionName}
                  onChange={(e) => setCollectionName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                  placeholder="Collection name (e.g., Founders NFT)"
                  className="flex-1 bg-gray-800/80 border border-nasun-c5/45 rounded-sm px-4 py-2.5 text-nasun-white placeholder:text-nasun-white/50 focus:outline-none focus:border-nasun-c4"
                />
                <label className="flex items-center gap-1.5 text-nasun-white/85 text-sm cursor-pointer whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={featured}
                    onChange={(e) => setFeatured(e.target.checked)}
                    className="accent-amber-500"
                  />
                  Featured
                </label>
                <Button
                  variant="c4"
                  onClick={handleAdd}
                  disabled={createMutation.isPending}
                >
                  {createMutation.isPending ? "Adding..." : "Add"}
                </Button>
              </div>
              {formError && (
                <p className="text-red-400 text-sm">{formError}</p>
              )}
            </div>
          </OuterBox>

          {/* Collections Table */}
          <OuterBox color="w2" padding="md">
            <h3 className="text-nasun-white font-medium text-lg mb-4">
              Collections ({enabledCount} active / {totalCount} total)
            </h3>

            {error ? (
              <p className="text-red-400 text-center py-8">Failed to load collections: {error.message}</p>
            ) : !collections || collections.length === 0 ? (
              <p className="text-nasun-white/60 text-center py-8">
                No collections registered. All NFTs will be displayed to users.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-nasun-white/20 text-nasun-white/80">
                      <th className="text-left py-3 px-2 font-medium">Name</th>
                      <th className="text-left py-3 px-2 font-medium">Contract</th>
                      <th className="text-left py-3 px-2 font-medium">Chain</th>
                      <th className="text-left py-3 px-2 font-medium">Status</th>
                      <th className="text-center py-3 px-2 font-medium">Featured</th>
                      <th className="text-left py-3 px-2 font-medium">Created</th>
                      <th className="text-right py-3 px-2 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-nasun-white/5">
                    {collections.map((collection) => (
                      <tr key={collection.collectionId}>
                        <td className="py-3 px-2">
                          <span className="text-nasun-white font-medium">
                            {collection.collectionName}
                          </span>
                        </td>
                        <td className="py-3 px-2">
                          <a
                            href={
                              collection.chain === "polygon"
                                ? `https://polygonscan.com/address/${collection.contractAddress}`
                                : `https://etherscan.io/address/${collection.contractAddress}`
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-nasun-c4 hover:underline font-mono text-xs"
                            title={collection.contractAddress}
                          >
                            {truncateAddress(collection.contractAddress)}
                          </a>
                        </td>
                        <td className="py-3 px-2">
                          <ChainBadge chain={collection.chain} />
                        </td>
                        <td className="py-3 px-2">
                          <EnabledBadge enabled={collection.enabled} />
                        </td>
                        <td className="py-3 px-2 text-center">
                          <button
                            onClick={() => handleToggleFeatured(collection)}
                            disabled={!collection.enabled || updateMutation.isPending}
                            className="disabled:opacity-30"
                            title={collection.featured ? "Unset featured" : "Set featured"}
                          >
                            <Star
                              className={`w-4 h-4 transition-colors ${
                                collection.featured
                                  ? "text-amber-400 fill-amber-400"
                                  : "text-gray-500 hover:text-amber-400/50"
                              }`}
                            />
                          </button>
                        </td>
                        <td className="py-3 px-2 text-nasun-white/60">
                          {new Date(collection.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                        </td>
                        <td className="py-3 px-2 text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="outlineC5"
                              size="sm"
                              onClick={() => handleToggleEnabled(collection)}
                              disabled={updateMutation.isPending}
                            >
                              {collection.enabled ? "Disable" : "Enable"}
                            </Button>
                            <Button
                              variant="outlineC5"
                              size="sm"
                              onClick={() => setDeleteTarget(collection)}
                              className="text-red-400 border-red-400/30 hover:bg-red-400/10 hover:text-red-300 hover:border-red-400/50"
                            >
                              Delete
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </OuterBox>
        </div>

        {/* Delete Confirmation Modal */}
        {deleteTarget && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 backdrop-blur-sm">
            <OuterBox color="w5" padding="md" className="max-w-md w-full mx-4 shadow-2xl">
              <h3 className="text-nasun-white font-medium text-lg mb-4">Confirm Delete</h3>
              <p className="text-nasun-white/85 mb-6">
                Delete{" "}
                <strong className="text-nasun-white">{deleteTarget.collectionName}</strong>{" "}
                ({truncateAddress(deleteTarget.contractAddress)} on {deleteTarget.chain})?
                This action cannot be undone.
              </p>
              <div className="flex justify-end gap-3">
                <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDeleteConfirm}
                  disabled={deleteMutation.isPending}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  {deleteMutation.isPending ? "Deleting..." : "Confirm Delete"}
                </Button>
              </div>
            </OuterBox>
          </div>
        )}
      </SectionLayout>
    </AdminLayout>
  );
}
