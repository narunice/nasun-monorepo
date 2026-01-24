import { useState } from 'react';
import { AdminLayout } from '../components/AdminLayout';
import { SectionLayout } from '@/components/layout/SectionLayout';
import { Button } from '@/components/ui/button';
import { PageTitle } from '@/components/ui/PageTitle';
import { useBlacklist } from '../hooks/useBlacklist';
import { useAdminAuth } from '../hooks/useAdminAuth';
import type { BannedAccount } from '../types/index';

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
  const {
    bannedAccounts,
    total,
    isLoading,
    ban,
    unban,
    isBanning,
    isUnbanning,
  } = useBlacklist(ADMIN_PASSWORD);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Ban confirmation state
  const [banTarget, setBanTarget] = useState<SearchResult | null>(null);
  const [banReason, setBanReason] = useState('');

  // Unban confirmation state
  const [unbanTarget, setUnbanTarget] = useState<BannedAccount | null>(null);

  const handleSearch = async () => {
    if (searchQuery.trim().length < 2) return;
    setIsSearching(true);
    try {
      const response = await fetch(
        `${LEADERBOARD_V3_API_URL}/v3/accounts/search?q=${encodeURIComponent(searchQuery)}&limit=10`,
        { headers: { 'Content-Type': 'application/json' } }
      );
      if (response.ok) {
        const data = await response.json();
        setSearchResults(data.accounts || []);
      }
    } catch (error) {
      console.error('Search failed:', error);
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
        adminUsername: profile?.email || profile?.username || 'admin',
      });
      setBanTarget(null);
      setBanReason('');
      setSearchResults((prev) => prev.filter((r) => r.accountId !== banTarget.accountId));
    } catch (error) {
      console.error('Ban failed:', error);
    }
  };

  const handleUnbanConfirm = async () => {
    if (!unbanTarget) return;
    try {
      await unban(unbanTarget.accountId);
      setUnbanTarget(null);
    } catch (error) {
      console.error('Unban failed:', error);
    }
  };

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="bg-nasun-black min-h-screen flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-nasun-c4 border-t-transparent" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="bg-nasun-black min-h-screen">
        <SectionLayout className="!max-w-6xl !pt-12">
          {/* Header */}
          <div className="mb-10">
            <PageTitle as="h2" align="left" className="!mb-4">
              Blacklist Management
            </PageTitle>
            <p className="text-nasun-white/60 text-lg font-light max-w-2xl leading-relaxed">
              Manage banned accounts on the leaderboard. Banned accounts are hidden from rankings
              and cannot register new posts.
            </p>
          </div>

          <div className="flex flex-col gap-8 w-full">
            {/* Search Section */}
            <div className="bg-nasun-c6/30 border border-white/10 rounded-lg p-6">
              <h3 className="text-nasun-white font-semibold text-lg mb-4">Search Account</h3>
              <div className="flex gap-3">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder="Enter username to search..."
                  className="flex-1 bg-nasun-black/50 border border-white/20 rounded-md px-4 py-2.5 text-nasun-white placeholder:text-nasun-white/30 focus:outline-none focus:border-nasun-c4"
                />
                <Button
                  variant="c4"
                  onClick={handleSearch}
                  disabled={isSearching || searchQuery.trim().length < 2}
                >
                  {isSearching ? 'Searching...' : 'Search'}
                </Button>
              </div>

              {/* Search Results */}
              {searchResults.length > 0 && (
                <div className="mt-4 space-y-2">
                  {searchResults.map((result) => (
                    <div
                      key={result.accountId}
                      className="flex items-center justify-between bg-nasun-black/30 border border-white/5 rounded-md px-4 py-3"
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
                          <span className="text-nasun-white text-sm font-medium">
                            @{result.originalUsername || result.username}
                          </span>
                          {result.displayName && (
                            <span className="text-nasun-white/40 text-xs ml-2">
                              {result.displayName}
                            </span>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="outlineC1"
                        size="sm"
                        onClick={() => setBanTarget(result)}
                        className="text-red-400 border-red-400/30 hover:bg-red-400/10"
                      >
                        Ban
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Banned Accounts Table */}
            <div className="bg-nasun-c6/30 border border-white/10 rounded-lg p-6">
              <h3 className="text-nasun-white font-semibold text-lg mb-4">
                Banned Accounts ({total})
              </h3>

              {bannedAccounts.length === 0 ? (
                <p className="text-nasun-white/40 text-center py-8">No banned accounts</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/10 text-nasun-white/60">
                        <th className="text-left py-3 px-2">Username</th>
                        <th className="text-left py-3 px-2">Reason</th>
                        <th className="text-left py-3 px-2">Banned At</th>
                        <th className="text-left py-3 px-2">Banned By</th>
                        <th className="text-right py-3 px-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bannedAccounts.map((account) => (
                        <tr key={account.accountId} className="border-b border-white/5">
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
                            {account.banReason || '-'}
                          </td>
                          <td className="py-3 px-2 text-nasun-white/40">
                            {account.bannedAt
                              ? new Date(account.bannedAt).toLocaleString('en-US')
                              : '-'}
                          </td>
                          <td className="py-3 px-2 text-nasun-white/40">
                            {account.bannedBy || '-'}
                          </td>
                          <td className="py-3 px-2 text-right">
                            <Button
                              variant="outlineC1"
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
            </div>
          </div>

          {/* Ban Confirmation Modal */}
          {banTarget && (
            <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
              <div className="bg-nasun-c6 border border-white/20 rounded-lg p-6 max-w-md w-full mx-4">
                <h3 className="text-nasun-white font-semibold text-lg mb-4">Confirm Ban</h3>
                <p className="text-nasun-white/70 mb-4">
                  Ban <strong className="text-nasun-white">@{banTarget.originalUsername || banTarget.username}</strong> from the leaderboard?
                </p>
                <textarea
                  value={banReason}
                  onChange={(e) => setBanReason(e.target.value)}
                  placeholder="Reason for ban (optional)"
                  className="w-full bg-nasun-black/50 border border-white/20 rounded-md px-4 py-2.5 text-nasun-white placeholder:text-nasun-white/30 focus:outline-none focus:border-nasun-c4 mb-4 h-20 resize-none"
                />
                <div className="flex justify-end gap-3">
                  <Button
                    variant="outlineC1"
                    onClick={() => { setBanTarget(null); setBanReason(''); }}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="c4"
                    onClick={handleBanConfirm}
                    disabled={isBanning}
                    className="bg-red-500 hover:bg-red-600"
                  >
                    {isBanning ? 'Banning...' : 'Confirm Ban'}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Unban Confirmation Modal */}
          {unbanTarget && (
            <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
              <div className="bg-nasun-c6 border border-white/20 rounded-lg p-6 max-w-md w-full mx-4">
                <h3 className="text-nasun-white font-semibold text-lg mb-4">Confirm Unban</h3>
                <p className="text-nasun-white/70 mb-4">
                  Unban <strong className="text-nasun-white">@{unbanTarget.originalUsername || unbanTarget.username}</strong>?
                  They will reappear on the leaderboard.
                </p>
                <div className="flex justify-end gap-3">
                  <Button variant="outlineC1" onClick={() => setUnbanTarget(null)}>
                    Cancel
                  </Button>
                  <Button
                    variant="c4"
                    onClick={handleUnbanConfirm}
                    disabled={isUnbanning}
                  >
                    {isUnbanning ? 'Unbanning...' : 'Confirm Unban'}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </SectionLayout>
      </div>
    </AdminLayout>
  );
}
