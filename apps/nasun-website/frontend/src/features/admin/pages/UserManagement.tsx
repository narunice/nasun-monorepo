import { useState, useEffect, useCallback, useRef } from "react";
import { AdminLayout } from "../components/AdminLayout";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { Button } from "@/components/ui/button";
import { PageTitle } from "@/components/ui/PageTitle";
import { OuterBox } from "@/components/ui/OuterBox";
import { PageLoading } from "@/components/ui/PageLoading";
import { useAdminAuth } from "../hooks/useAdminAuth";
import { useUserList, useUserDetail } from "../hooks/useUserManagement";
import { truncateAddress } from "@/utils/addressUtils";
import type { UserProfile } from "../types";

const PROVIDERS = ["All", "Google", "Twitter", "MetaMask"] as const;
const PAGE_SIZE = 50;

function ProviderBadge({ provider }: { provider?: string }) {
  if (!provider) return <span className="text-nasun-white/30">-</span>;
  const lower = provider.toLowerCase();
  const styles: Record<string, string> = {
    google: "bg-blue-500/20 text-blue-300",
    twitter: "bg-sky-500/20 text-sky-300",
    metamask: "bg-orange-500/20 text-orange-300",
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${styles[lower] || "bg-gray-500/20 text-gray-400"}`}>
      {provider}
    </span>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text).catch(() => {
      // Clipboard API unavailable — silently fail
    });
    setCopied(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center justify-center w-5 h-5 rounded hover:bg-nasun-white/10 text-nasun-white/30 hover:text-nasun-white/60 transition-colors"
      title="Copy address"
    >
      {copied ? (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3 text-green-400">
          <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd" />
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
          <path d="M5.5 3.5A1.5 1.5 0 0 1 7 2h2.879a1.5 1.5 0 0 1 1.06.44l2.122 2.12a1.5 1.5 0 0 1 .439 1.061V9.5A1.5 1.5 0 0 1 12 11V8.621a3 3 0 0 0-.879-2.121L9 4.379A3 3 0 0 0 6.879 3.5H5.5Z" />
          <path d="M4 5a1.5 1.5 0 0 0-1.5 1.5v6A1.5 1.5 0 0 0 4 14h5a1.5 1.5 0 0 0 1.5-1.5V8.621a1.5 1.5 0 0 0-.44-1.06L7.94 5.439A1.5 1.5 0 0 0 6.878 5H4Z" />
        </svg>
      )}
    </button>
  );
}

function RoleBadge({ role }: { role?: string }) {
  if (role !== "ADMIN") return null;
  return (
    <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-amber-500/20 text-amber-300">
      ADMIN
    </span>
  );
}

function UserDetailModal({
  user,
  onClose,
}: {
  user: UserProfile;
  onClose: () => void;
}) {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  const Field = ({ label, value }: { label: string; value?: string | boolean | null }) => (
    <div>
      <dt className="text-xs uppercase tracking-widest text-nasun-white/40 mb-1">{label}</dt>
      <dd className="text-sm text-nasun-white break-all">
        {value === undefined || value === null || value === "" ? (
          <span className="text-nasun-white/20">-</span>
        ) : typeof value === "boolean" ? (
          value ? "Yes" : "No"
        ) : (
          value
        )}
      </dd>
    </div>
  );

  return (
    <div
      className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <OuterBox
        color="w5"
        padding="md"
        className="max-w-2xl w-full mx-4 shadow-2xl max-h-[85vh] overflow-y-auto"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            {user.profileImageUrl ? (
              <img
                src={user.profileImageUrl}
                alt={user.username || "User"}
                className="w-12 h-12 rounded-full"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-nasun-c5/30 flex items-center justify-center text-nasun-white/40 text-lg">
                ?
              </div>
            )}
            <div>
              <h3 className="text-nasun-white font-medium text-lg">
                {user.username || "Unknown User"}
              </h3>
              <p className="text-nasun-white/40 text-xs font-mono">{user.identityId}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>

        {/* Status warning */}
        {user.status === "DEACTIVATED" && (
          <div className="mb-4 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded text-red-300 text-sm">
            This account has been deactivated.
          </div>
        )}

        {/* Fields grid */}
        <dl className="grid grid-cols-2 gap-4 mb-6">
          <Field label="Username" value={user.username} />
          <Field label="Email" value={user.email} />
          <Field label="Provider" value={user.provider} />
          <Field label="Role" value={user.role || "USER"} />
          <Field label="Twitter Handle" value={user.originalTwitterHandle || user.twitterHandle ? `@${user.originalTwitterHandle || user.twitterHandle}` : undefined} />
          <Field label="Twitter ID" value={user.twitterId} />
          <div>
            <dt className="text-xs uppercase tracking-widest text-nasun-white/40 mb-1">Wallet Address</dt>
            <dd className="text-sm text-nasun-white break-all">
              {user.walletAddress ? (
                <span className="inline-flex items-center gap-1">
                  {user.walletAddress}
                  <CopyButton text={user.walletAddress} />
                </span>
              ) : (
                <span className="text-nasun-white/20">-</span>
              )}
            </dd>
          </div>
          <Field label="Verified" value={user.verified} />
          <Field label="Telegram Connected" value={user.isTelegramMember} />
          <Field label="Telegram Username" value={user.telegramUsername} />
          <Field label="Status" value={user.status || "ACTIVE"} />
          <Field label="Telegram User ID" value={user.telegramUserId} />
          <Field label="Created" value={user.createdAt ? new Date(user.createdAt).toLocaleString("en-US") : undefined} />
          <Field label="Updated" value={user.updatedAt ? new Date(user.updatedAt).toLocaleString("en-US") : undefined} />
        </dl>

        {/* Linked Accounts */}
        {user.linkedAccounts && Object.keys(user.linkedAccounts).length > 0 && (
          <div>
            <h4 className="text-nasun-white/60 text-xs uppercase tracking-widest mb-3 border-t border-nasun-white/10 pt-4">
              Linked Accounts
            </h4>
            <div className="space-y-3">
              {Object.entries(user.linkedAccounts).map(([provider, account]) => {
                if (!account) return null;
                return (
                  <div key={provider} className="bg-nasun-black/30 border border-nasun-white/5 rounded px-3 py-2">
                    <ProviderBadge provider={provider} />
                    <dl className="grid grid-cols-2 gap-2 mt-2 text-xs">
                      {account.username && (
                        <div>
                          <dt className="text-nasun-white/30">Username</dt>
                          <dd className="text-nasun-white/70">{account.username}</dd>
                        </div>
                      )}
                      {account.email && (
                        <div>
                          <dt className="text-nasun-white/30">Email</dt>
                          <dd className="text-nasun-white/70">{account.email}</dd>
                        </div>
                      )}
                      {account.twitterHandle && (
                        <div>
                          <dt className="text-nasun-white/30">Twitter</dt>
                          <dd className="text-nasun-white/70">@{account.twitterHandle}</dd>
                        </div>
                      )}
                      {account.walletAddress && (
                        <div>
                          <dt className="text-nasun-white/30">Wallet</dt>
                          <dd className="text-nasun-white/70 font-mono inline-flex items-center gap-1">
                            {truncateAddress(account.walletAddress)}
                            <CopyButton text={account.walletAddress} />
                          </dd>
                        </div>
                      )}
                    </dl>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </OuterBox>
    </div>
  );
}

export function UserManagement() {
  const { cognitoToken } = useAdminAuth();

  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedProvider, setSelectedProvider] = useState<string>("All");
  const [page, setPage] = useState(1);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Reset page when provider changes
  useEffect(() => {
    setPage(1);
  }, [selectedProvider]);

  const providerParam = selectedProvider === "All" ? undefined : selectedProvider;

  const { data, isPending, error } = useUserList(cognitoToken, {
    page,
    limit: PAGE_SIZE,
    search: debouncedSearch || undefined,
    provider: providerParam,
  });

  const { data: detailData } = useUserDetail(cognitoToken, selectedUserId);

  const handleCloseModal = useCallback(() => setSelectedUserId(null), []);

  if (isPending && !data) {
    return (
      <AdminLayout>
        <PageLoading />
      </AdminLayout>
    );
  }

  const users = data?.users || [];
  const total = data?.total || 0;
  const totalPages = data?.totalPages || 1;

  return (
    <AdminLayout>
      <SectionLayout className="!max-w-6xl !pt-0">
        {/* Header */}
        <div className="mb-10">
          <PageTitle as="h3" align="left">
            User Management
          </PageTitle>
          <p className="text-nasun-white/60 max-w-2xl -mt-6">
            Browse and search all registered user accounts. Click on a user row to view detailed information.
          </p>
        </div>

        <div className="flex flex-col gap-8 w-full">
          {/* Search & Filter */}
          <OuterBox color="w1" padding="md">
            <h3 className="text-nasun-white font-medium text-lg mb-4">Search & Filter</h3>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search by username, email, twitter, or wallet..."
                aria-label="Search users"
                className="flex-1 bg-gray-800/80 border border-nasun-c5/30 rounded-sm px-4 py-2.5 text-nasun-white placeholder:text-nasun-white/30 focus:outline-none focus:border-nasun-c4"
              />
              <div className="flex gap-1.5">
                {PROVIDERS.map((p) => (
                  <Button
                    key={p}
                    variant={selectedProvider === p ? "c4" : "outlineC5"}
                    size="sm"
                    onClick={() => setSelectedProvider(p)}
                  >
                    {p}
                  </Button>
                ))}
              </div>
            </div>
          </OuterBox>

          {/* Users Table */}
          <OuterBox color="w2" padding="md">
            <h3 className="text-nasun-white font-medium text-lg mb-4">
              Users ({total})
            </h3>

            {error ? (
              <p className="text-red-400 text-center py-8">
                Failed to load users: {error.message}
              </p>
            ) : users.length === 0 ? (
              <p className="text-nasun-white/40 text-center py-8">
                {debouncedSearch || providerParam ? "No users found matching your search." : "No registered users."}
              </p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="border-b border-nasun-white/10 text-nasun-white/60">
                        <th className="text-left py-3 px-2 font-medium w-8"></th>
                        <th className="text-left py-3 px-2 font-medium">Username</th>
                        <th className="text-left py-3 px-2 font-medium">Email</th>
                        <th className="text-left py-3 px-2 font-medium">Provider</th>
                        <th className="text-left py-3 px-2 font-medium">Twitter</th>
                        <th className="text-left py-3 px-2 font-medium">Wallet</th>
                        <th className="text-left py-3 px-2 font-medium">TG</th>
                        <th className="text-left py-3 px-2 font-medium">Role</th>
                        <th className="text-left py-3 px-2 font-medium">Joined</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-nasun-white/5">
                      {users.map((user) => (
                        <tr
                          key={user.identityId}
                          onClick={() => setSelectedUserId(user.identityId)}
                          className="hover:bg-nasun-white/5 cursor-pointer transition-colors"
                        >
                          <td className="py-3 px-2">
                            {user.profileImageUrl ? (
                              <img
                                src={user.profileImageUrl}
                                alt=""
                                className="w-6 h-6 rounded-full"
                              />
                            ) : (
                              <div className="w-6 h-6 rounded-full bg-nasun-c5/30 flex items-center justify-center text-nasun-white/30 text-xs">
                                ?
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-2 text-nasun-white font-medium">
                            {user.username || "-"}
                          </td>
                          <td className="py-3 px-2 text-nasun-white/60 max-w-[180px] truncate">
                            {user.email || "-"}
                          </td>
                          <td className="py-3 px-2">
                            <ProviderBadge provider={user.provider} />
                          </td>
                          <td className="py-3 px-2 text-nasun-white/60">
                            {user.originalTwitterHandle || user.twitterHandle
                              ? `@${user.originalTwitterHandle || user.twitterHandle}`
                              : "-"}
                          </td>
                          <td className="py-3 px-2 text-nasun-white/40 font-mono text-xs">
                            {user.walletAddress ? (
                              <span className="inline-flex items-center gap-1">
                                {truncateAddress(user.walletAddress, 2, 4)}
                                <CopyButton text={user.walletAddress} />
                              </span>
                            ) : "-"}
                          </td>
                          <td className="py-3 px-2">
                            {user.isTelegramMember ? (
                              <span className="text-green-400">✓</span>
                            ) : (
                              <span className="text-nasun-white/20">-</span>
                            )}
                          </td>
                          <td className="py-3 px-2">
                            <RoleBadge role={user.role} />
                          </td>
                          <td className="py-3 px-2 text-nasun-white/40 whitespace-nowrap">
                            {user.createdAt
                              ? new Date(user.createdAt).toLocaleString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })
                              : "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4 pt-4 border-t border-nasun-white/10">
                    <p className="text-nasun-white/40 text-sm">
                      Page {page} of {totalPages}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outlineC5"
                        size="sm"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page <= 1}
                      >
                        Previous
                      </Button>
                      {/* Page number buttons (show up to 5 around current) */}
                      {Array.from({ length: totalPages }, (_, i) => i + 1)
                        .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
                        .map((p, idx, arr) => {
                          const prev = arr[idx - 1];
                          const showEllipsis = prev !== undefined && p - prev > 1;
                          return (
                            <span key={p} className="flex items-center">
                              {showEllipsis && (
                                <span className="text-nasun-white/30 px-1">...</span>
                              )}
                              <Button
                                variant={p === page ? "c4" : "outlineC5"}
                                size="sm"
                                onClick={() => setPage(p)}
                                className="min-w-[36px]"
                              >
                                {p}
                              </Button>
                            </span>
                          );
                        })}
                      <Button
                        variant="outlineC5"
                        size="sm"
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={page >= totalPages}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </OuterBox>
        </div>

        {/* Detail Modal */}
        {selectedUserId && detailData?.user && (
          <UserDetailModal user={detailData.user} onClose={handleCloseModal} />
        )}
      </SectionLayout>
    </AdminLayout>
  );
}
