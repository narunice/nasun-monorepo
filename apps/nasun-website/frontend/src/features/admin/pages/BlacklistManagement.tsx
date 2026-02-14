import { useState } from "react";
import { AdminLayout } from "../components/AdminLayout";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { Button } from "@/components/ui/button";
import { PageTitle } from "@/components/ui/PageTitle";
import { OuterBox } from "@/components/ui/OuterBox";
import { PageLoading } from "@/components/ui/PageLoading";
import { useBlacklist } from "../hooks/useBlacklist";
import { useAdminAuth } from "../hooks/useAdminAuth";
import type { BannedAccount } from "../types/index";

const ADMIN_PASSWORD = import.meta.env.VITE_LEADERBOARD_V3_ADMIN_PASSWORD;
const LEADERBOARD_V3_API_URL = import.meta.env.VITE_LEADERBOARD_V3_API_URL;

interface SearchResult {
  accountId: string;
  username: string;
  originalUsername?: string;
  platform: string;
  displayName?: string;
  profileImageUrl?: string;
  userScore?: number;
  rank?: number;
}

export function BlacklistManagement() {
  const { profile } = useAdminAuth();
  const { bannedAccounts, total, isLoading, ban, unban, isBanning, isUnbanning } =
    useBlacklist(ADMIN_PASSWORD);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Ban confirmation state
  const [banTarget, setBanTarget] = useState<SearchResult | null>(null);
  const [banReason, setBanReason] = useState("");

  // Unban confirmation state
  const [unbanTarget, setUnbanTarget] = useState<BannedAccount | null>(null);

  const handleSearch = async () => {
    if (searchQuery.trim().length < 2) return;
    setIsSearching(true);
    try {
      const response = await fetch(
        `${LEADERBOARD_V3_API_URL}/v3/accounts/search?q=${encodeURIComponent(searchQuery)}&limit=10`,
        { headers: { "Content-Type": "application/json" } },
      );
      if (response.ok) {
        const data = await response.json();
        setSearchResults(data.accounts || []);
      }
    } catch (error) {
      console.error("Search failed:", error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleBanConfirm = async () => {
    if (!banTarget) return;
    try {
      await ban({
        accountId: banTarget.accountId,
        reason: banReason || undefined,
        adminUsername: profile?.email || profile?.username || "admin",
      });
      setBanTarget(null);
      setBanReason("");
      setSearchResults((prev) => prev.filter((r) => r.accountId !== banTarget.accountId));
    } catch (error) {
      console.error("Ban failed:", error);
    }
  };

  const handleUnbanConfirm = async () => {
    if (!unbanTarget) return;
    try {
      await unban(unbanTarget.accountId);
      setUnbanTarget(null);
    } catch (error) {
      console.error("Unban failed:", error);
    }
  };

  if (isLoading) {
    return (
      <AdminLayout>
        <PageLoading />
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <SectionLayout className="!max-w-6xl !pt-0">
        {/* Header */}
        <div className="mb-10">
          <PageTitle as="h3" align="left" className="">
            Blacklist Management
          </PageTitle>
          <p className="text-nasun-white/60 max-w-2xl  -mt-6">
            Manage banned accounts on the leaderboard. Banned accounts are hidden from rankings and
            cannot register new posts.
          </p>
        </div>

        <div className="flex flex-col gap-8 w-full">
          {/* Search Section */}
          <OuterBox color="w1" padding="md">
            <h3 className="text-nasun-white font-medium text-lg mb-4">Search Account</h3>
            <div className="flex gap-3">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="Enter username to search..."
                className="flex-1 bg-gray-800/80 border border-nasun-c5/30 rounded-sm px-4 py-2.5 text-nasun-white placeholder:text-nasun-white/30 focus:outline-none focus:border-nasun-c4"
              />
              <Button
                variant="c4"
                onClick={handleSearch}
                disabled={isSearching || searchQuery.trim().length < 2}
              >
                {isSearching ? "Searching..." : "Search"}
              </Button>
            </div>

            {/* Search Results */}
            {searchResults.length > 0 && (
              <div className="mt-4 space-y-2">
                {searchResults.map((result) => (
                  <div
                    key={result.accountId}
                    className="flex items-center justify-between bg-nasun-black/30 border border-nasun-white/5 rounded-sm px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      {result.profileImageUrl && (
                        <img
                          src={result.profileImageUrl}
                          alt={result.username}
                          className="w-8 h-8 rounded-full"
                        />
                      )}
                      <div>
                        <span className="text-nasun-white text-base font-medium">
                          @{result.originalUsername || result.username}
                        </span>
                        {result.displayName && (
                          <span className="text-nasun-white/40 text-sm ml-2">
                            {result.displayName}
                          </span>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="outlineC5"
                      size="sm"
                      onClick={() => setBanTarget(result)}
                      className="text-red-400 border-red-400/30 hover:bg-red-400/10 hover:text-red-300 hover:border-red-400/50"
                    >
                      Ban
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </OuterBox>

          {/* Banned Accounts Table */}
          <OuterBox color="w2" padding="md">
            <h3 className="text-nasun-white font-medium text-lg mb-4">Banned Accounts ({total})</h3>

            {bannedAccounts.length === 0 ? (
              <p className="text-nasun-white/40 text-center py-8">No banned accounts</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-base border-collapse">
                  <thead>
                    <tr className="border-b border-nasun-white/10 text-nasun-white/60">
                      <th className="text-left py-3 px-2 font-medium">Username</th>
                      <th className="text-left py-3 px-2 font-medium">Reason</th>
                      <th className="text-left py-3 px-2 font-medium">Banned At</th>
                      <th className="text-left py-3 px-2 font-medium">Banned By</th>
                      <th className="text-right py-3 px-2 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-nasun-white/5">
                    {bannedAccounts.map((account) => (
                      <tr key={account.accountId}>
                        <td className="py-3 px-2">
                          <div className="flex items-center gap-2">
                            {account.profileImageUrl && (
                              <img
                                src={account.profileImageUrl}
                                alt={account.username}
                                className="w-6 h-6 rounded-full"
                              />
                            )}
                            <span className="text-nasun-white">
                              @{account.originalUsername || account.username}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-2 text-nasun-white/60 max-w-[200px] truncate">
                          {account.banReason || "-"}
                        </td>
                        <td className="py-3 px-2 text-nasun-white/40">
                          {account.bannedAt
                            ? new Date(account.bannedAt).toLocaleString("en-US")
                            : "-"}
                        </td>
                        <td className="py-3 px-2 text-nasun-white/40">{account.bannedBy || "-"}</td>
                        <td className="py-3 px-2 text-right">
                          <Button
                            variant="outlineC5"
                            size="sm"
                            onClick={() => setUnbanTarget(account)}
                            disabled={isUnbanning}
                          >
                            Unban
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </OuterBox>
        </div>

        {/* Ban Confirmation Modal */}
        {banTarget && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 backdrop-blur-sm">
            <OuterBox color="w5" padding="md" className="max-w-md w-full mx-4 shadow-2xl">
              <h3 className="text-nasun-white font-medium text-lg mb-4">Confirm Ban</h3>
              <p className="text-nasun-white/70 mb-4">
                Ban{" "}
                <strong className="text-nasun-white">
                  @{banTarget.originalUsername || banTarget.username}
                </strong>{" "}
                from the leaderboard?
              </p>
              <textarea
                value={banReason}
                onChange={(e) => setBanReason(e.target.value)}
                placeholder="Reason for ban (optional)"
                className="w-full bg-gray-800/80 border border-nasun-c5/30 rounded-sm px-4 py-2.5 text-nasun-white placeholder:text-nasun-white/30 focus:outline-none focus:border-nasun-c4 mb-6 h-24 resize-none"
              />
              <div className="flex justify-end gap-3">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setBanTarget(null);
                    setBanReason("");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleBanConfirm}
                  disabled={isBanning}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  {isBanning ? "Banning..." : "Confirm Ban"}
                </Button>
              </div>
            </OuterBox>
          </div>
        )}

        {/* Unban Confirmation Modal */}
        {unbanTarget && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 backdrop-blur-sm">
            <OuterBox color="w5" padding="md" className="max-w-md w-full mx-4 shadow-2xl">
              <h3 className="text-nasun-white font-medium text-lg mb-4">Confirm Unban</h3>
              <p className="text-nasun-white/70 mb-6">
                Unban{" "}
                <strong className="text-nasun-white">
                  @{unbanTarget.originalUsername || unbanTarget.username}
                </strong>
                ? They will reappear on the leaderboard.
              </p>
              <div className="flex justify-end gap-3">
                <Button variant="ghost" onClick={() => setUnbanTarget(null)}>
                  Cancel
                </Button>
                <Button variant="c4" onClick={handleUnbanConfirm} disabled={isUnbanning}>
                  {isUnbanning ? "Unbanning..." : "Confirm Unban"}
                </Button>
              </div>
            </OuterBox>
          </div>
        )}
      </SectionLayout>
    </AdminLayout>
  );
}
