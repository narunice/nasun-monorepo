import { useState, useCallback, useRef, useEffect } from "react";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";
import { OuterBox } from "@/components/ui/OuterBox";
import { useUserList, useUserDetail, useUserSearch } from "../../hooks/useUserManagement";
import { useAdminAuth } from "../../hooks/useAdminAuth";
import { useBannedList, useBanAccount, useUnbanAccount } from "../../hooks/useEcosystemBan";
import { truncateAddress } from "@/utils/addressUtils";
import type { UserProfile, SearchField } from "../../types";
import type { BannedAccount } from "../../services/banApi";
import { SearchBar } from "./SearchBar";
import { Pagination } from "./Pagination";

const PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 300;

function ProviderBadge({ provider }: { provider?: string }) {
  if (!provider) return <span className="text-nasun-white/50">-</span>;
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
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center justify-center w-5 h-5 rounded hover:bg-nasun-white/10 text-nasun-white/50 hover:text-nasun-white/80 transition-colors"
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

/**
 * Two-step unban prompt. Returns { mode, reason } or null if cancelled.
 *
 * Mode choice matters:
 *   - 'retroactive' restores every ban-period point the user accumulated.
 *     Use when the ban was a mistake (false positive).
 *   - 'forward-only' lifts the flag but keeps ban-period rows invisible.
 *     Use when the ban was justified but you're granting a fresh start.
 */
function promptUnbanIntent(): { mode: 'retroactive' | 'forward-only'; reason?: string } | null {
  const restorePoints = window.confirm(
    'Restore ban-period points?\n\n' +
    'OK = RESTORE  (the ban was a mistake; user gets back every point earned during the ban)\n' +
    'Cancel = FORWARD-ONLY  (the ban was justified; user starts fresh from now; ban-period points stay invisible)',
  );
  const mode = restorePoints ? 'retroactive' : 'forward-only';
  const reason = window.prompt(`Reason for ${mode} unban (optional):`, '');
  if (reason === null) return null;
  return { mode, reason: reason.trim() || undefined };
}

function RowBanButton({ user, banned }: { user: UserProfile; banned: boolean }) {
  const { cognitoToken } = useAdminAuth();
  const banMutation = useBanAccount(cognitoToken);
  const unbanMutation = useUnbanAccount(cognitoToken);
  const isAdmin = user.role === "ADMIN";
  const pending = banMutation.isPending || unbanMutation.isPending;

  if (isAdmin) {
    return <span className="text-xs text-nasun-white/30">—</span>;
  }

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (banned) {
      const intent = promptUnbanIntent();
      if (!intent) return;
      unbanMutation.mutate(
        { identityId: user.identityId, reason: intent.reason, mode: intent.mode },
        {
          onSuccess: (res) => {
            const r = res.applied?.[0];
            const detail = r?.mode === 'forward-only'
              ? `forward-only (${r.reflaggedRows ?? 0} rows kept invisible)`
              : `points restored (${r?.unflaggedRows ?? 0} rows)`;
            toast.success(`Account unbanned: ${detail}`);
          },
          onError: (err: Error) => toast.error(`Unban failed: ${err.message}`),
        },
      );
      return;
    }
    const reason = window.prompt("Reason for ban (visible to admins only):", "");
    if (reason === null) return;
    if (!reason.trim()) {
      toast.error("Reason is required");
      return;
    }
    if (!window.confirm(
      `Ban @${user.originalTwitterHandle || user.twitterHandle || user.username}? ` +
      "All ecosystem points accrual stops; user disappears from leaderboards. " +
      "Existing settled snapshots are not modified.",
    )) return;
    banMutation.mutate(
      { identityId: user.identityId, handle: user.twitterHandle, reason: reason.trim() },
      {
        onSuccess: () => toast.success("Account banned"),
        onError: (err: Error) => toast.error(`Ban failed: ${err.message}`),
      },
    );
  };

  return (
    <button
      onClick={handleClick}
      disabled={pending}
      className={`text-xs font-medium px-2 py-1 rounded transition-colors ${
        banned
          ? "bg-nasun-white/10 hover:bg-nasun-white/15 text-nasun-white/80"
          : "bg-red-500/15 hover:bg-red-500/25 text-red-300"
      } disabled:opacity-50`}
      title={banned ? "Unban this account" : "Ban this account (stops all ecosystem points)"}
    >
      {pending ? "..." : banned ? "Unban" : "Ban"}
    </button>
  );
}

function BannedBadge({ banned }: { banned?: boolean }) {
  if (!banned) return null;
  return (
    <span
      className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-red-500/20 text-red-300"
      title="Account banned: excluded from all ecosystem points"
    >
      BANNED
    </span>
  );
}

function BanStatusPanel({ user, banEntry }: { user: UserProfile; banEntry?: BannedAccount }) {
  const { cognitoToken } = useAdminAuth();
  const banMutation = useBanAccount(cognitoToken);
  const unbanMutation = useUnbanAccount(cognitoToken);
  const banned = !!banEntry;
  const isAdmin = user.role === "ADMIN";
  const pending = banMutation.isPending || unbanMutation.isPending;

  return (
    <div
      className={`mt-2 rounded p-3 border ${
        banned ? "bg-red-500/5 border-red-400/30" : "bg-nasun-white/[0.03] border-nasun-white/10"
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs uppercase tracking-widest text-nasun-white/60">Ban Status</span>
        <span className={`text-xs font-medium ${banned ? "text-red-300" : "text-nasun-white/40"}`}>
          {banned ? "BANNED" : "Not banned"}
        </span>
      </div>

      {banned && banEntry && (
        <div className="text-xs text-nasun-white/70 space-y-0.5 mb-3">
          {banEntry.reason && (
            <div className="text-red-200/80">Reason: {banEntry.reason}</div>
          )}
          {banEntry.bannedAt && (
            <div>At: {new Date(banEntry.bannedAt).toLocaleString("en-US")}</div>
          )}
          {banEntry.bannedBy && (
            <div className="font-mono break-all">By: {banEntry.bannedBy}</div>
          )}
        </div>
      )}

      {isAdmin ? (
        <p className="text-xs text-nasun-white/40">Admin accounts cannot be banned.</p>
      ) : banned ? (
        <Button
          variant="outlineC5"
          size="sm"
          onClick={() => {
            const intent = promptUnbanIntent();
            if (!intent) return;
            unbanMutation.mutate(
              { identityId: user.identityId, reason: intent.reason, mode: intent.mode },
              {
                onSuccess: (res) => {
                  const r = res.applied?.[0];
                  const detail = r?.mode === 'forward-only'
                    ? `forward-only (${r.reflaggedRows ?? 0} rows kept invisible)`
                    : `points restored (${r?.unflaggedRows ?? 0} rows)`;
                  toast.success(`Account unbanned: ${detail}`);
                },
                onError: (err: Error) => toast.error(`Unban failed: ${err.message}`),
              },
            );
          }}
          disabled={pending}
          className="w-full"
        >
          {pending ? "Updating..." : "Unban account"}
        </Button>
      ) : (
        <Button
          variant="c4"
          size="sm"
          onClick={() => {
            const reason = window.prompt("Reason for ban (visible to admins only):", "");
            if (reason === null) return;
            if (!reason.trim()) {
              toast.error("Reason is required");
              return;
            }
            if (!window.confirm(
              "Ban this account? All ecosystem points accrual stops; user disappears " +
              "from leaderboards. Existing settled snapshots are not modified.",
            )) return;
            banMutation.mutate(
              { identityId: user.identityId, handle: user.twitterHandle, reason: reason.trim() },
              {
                onSuccess: () => toast.success("Account banned"),
                onError: (err: Error) => toast.error(`Ban failed: ${err.message}`),
              },
            );
          }}
          disabled={pending}
          className="w-full bg-red-600/80 hover:bg-red-600 text-white"
        >
          {pending ? "Updating..." : "Ban account (stops all ecosystem points)"}
        </Button>
      )}

      <p className="text-[10px] text-nasun-white/40 mt-2">
        Ban writes to banned_users + activity_points.flagged. Past settled snapshots are
        not modified.
      </p>
    </div>
  );
}

function UserDetailModal({
  user,
  banEntry,
  onClose,
}: {
  user: UserProfile;
  banEntry?: BannedAccount;
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
      <dt className="text-xs uppercase tracking-widest text-nasun-white/60 mb-1">{label}</dt>
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
              <div className="w-12 h-12 rounded-full bg-nasun-c5/30 flex items-center justify-center text-nasun-white/60 text-lg">
                ?
              </div>
            )}
            <div>
              <h3 className="text-nasun-white font-medium text-lg">
                {user.username || "Unknown User"}
              </h3>
              <p className="text-nasun-white/60 text-xs font-mono">{user.identityId}</p>
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

        {/* Ban controls */}
        <div className="mb-6">
          <BanStatusPanel user={user} banEntry={banEntry} />
        </div>

        {/* Fields grid */}
        <dl className="grid grid-cols-2 gap-4 mb-6">
          <Field label="Username" value={user.username} />
          <Field label="Display Name" value={user.customDisplayName} />
          <Field label="Email" value={user.email} />
          <Field label="Provider" value={user.provider} />
          <Field label="Role" value={user.role || "USER"} />
          <Field label="Twitter Handle" value={user.originalTwitterHandle || user.twitterHandle ? `@${user.originalTwitterHandle || user.twitterHandle}` : undefined} />
          <Field label="Twitter ID" value={user.twitterId} />
          <div>
            <dt className="text-xs uppercase tracking-widest text-nasun-white/60 mb-1">Wallet Address</dt>
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
          <Field label="Created" value={user.createdAt ? new Date(user.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }) : undefined} />
          <Field label="Updated" value={user.updatedAt ? new Date(user.updatedAt).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }) : undefined} />
        </dl>

        {/* Linked Accounts */}
        {user.linkedAccounts && Object.keys(user.linkedAccounts).length > 0 && (
          <div>
            <h4 className="text-nasun-white/80 text-xs uppercase tracking-widest mb-3 border-t border-nasun-white/20 pt-4">
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
                          <dt className="text-nasun-white/50">Username</dt>
                          <dd className="text-nasun-white/85">{account.username}</dd>
                        </div>
                      )}
                      {account.email && (
                        <div>
                          <dt className="text-nasun-white/50">Email</dt>
                          <dd className="text-nasun-white/85">{account.email}</dd>
                        </div>
                      )}
                      {account.twitterHandle && (
                        <div>
                          <dt className="text-nasun-white/50">Twitter</dt>
                          <dd className="text-nasun-white/85">@{account.twitterHandle}</dd>
                        </div>
                      )}
                      {account.walletAddress && (
                        <div>
                          <dt className="text-nasun-white/50">Wallet</dt>
                          <dd className="text-nasun-white/85 font-mono inline-flex items-center gap-1">
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

export function UsersTab() {
  const { cognitoToken } = useAdminAuth();
  const { bannedIdentityIds, data: bannedListData } = useBannedList(cognitoToken);

  // Search state
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [field, setField] = useState<SearchField>("auto");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  // Cursor-based pagination: cursorStack[i] = nextToken needed to fetch page i+1
  // page 1 uses undefined (no token), page 2 uses cursorStack[0], etc.
  const [cursorStack, setCursorStack] = useState<string[]>([]);
  const [page, setPage] = useState(1);

  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const isSearching = q.trim().length > 0;

  // Debounce search input
  const handleQChange = (value: string) => {
    setQInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setQ(value), SEARCH_DEBOUNCE_MS);
  };

  const handleClear = () => {
    setQInput("");
    setQ("");
    setPage(1);
    setCursorStack([]);
  };

  const handleFieldChange = (f: SearchField) => {
    setField(f);
    // Trigger a new search with the same q but different field
    setQ(qInput);
  };

  // List query (active when not searching)
  const nextToken = page > 1 ? cursorStack[page - 2] : undefined; // page 1 has no token, page N uses cursorStack[N-2]
  const listQuery = useUserList(
    cognitoToken,
    { limit: PAGE_SIZE, nextToken, page },
    { enabled: !isSearching },
  );

  // Search query (active when searching)
  const searchQuery = useUserSearch(
    cognitoToken,
    { q, field },
    { enabled: isSearching },
  );

  const { data: detailData } = useUserDetail(cognitoToken, selectedUserId);

  // Pagination handlers
  const handleNext = () => {
    if (!listQuery.data?.nextToken) return;
    setCursorStack((prev) => {
      const next = [...prev];
      next[page - 1] = listQuery.data!.nextToken!;
      return next;
    });
    setPage((p) => p + 1);
  };

  const handlePrev = () => {
    if (page <= 1) return;
    setPage((p) => p - 1);
  };

  const handleFirst = () => {
    setPage(1);
    setCursorStack([]);
  };

  const handleCloseModal = useCallback(() => setSelectedUserId(null), []);

  // Derive display users from active query
  const displayUsers: UserProfile[] = isSearching
    ? (searchQuery.data?.matches ?? [])
    : (listQuery.data?.users ?? []);

  const isLoading = isSearching ? searchQuery.isLoading : listQuery.isLoading;
  const error = isSearching ? searchQuery.error : listQuery.error;
  const truncated = isSearching && (searchQuery.data?.truncated ?? false);

  const hasPrev = page > 1;
  const hasNext = !isSearching && !!listQuery.data?.nextToken;

  return (
    <div className="flex flex-col gap-8 w-full">
      <OuterBox color="w2" padding="md">
        <h3 className="text-nasun-white font-medium text-lg mb-4">Registered Users</h3>

        <SearchBar
          q={qInput}
          field={field}
          onQChange={handleQChange}
          onFieldChange={handleFieldChange}
          onClear={handleClear}
        />

        {isSearching && !isLoading && searchQuery.data && (
          <div className="mb-3 text-sm text-nasun-white/60">
            {searchQuery.data.matches.length === 0
              ? `No users matched "${q}".`
              : `${searchQuery.data.matches.length} match${searchQuery.data.matches.length > 1 ? "es" : ""} found.`}
            {truncated && (
              <span className="ml-2 text-amber-400 text-xs">
                Showing first 500 results. Refine your search for more precision.
              </span>
            )}
          </div>
        )}

        {error ? (
          <p className="text-red-400 text-center py-8">
            Failed to load users: {error.message}
          </p>
        ) : displayUsers.length === 0 && isLoading ? (
          <p className="text-nasun-white/60 text-center py-8">Loading...</p>
        ) : displayUsers.length === 0 ? (
          <p className="text-nasun-white/60 text-center py-8">No users found.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-nasun-white/20 text-nasun-white/80">
                    <th className="text-left py-3 px-2 font-medium w-8"></th>
                    <th className="text-left py-3 px-2 font-medium">Username</th>
                    <th className="text-left py-3 px-2 font-medium">Wallet</th>
                    <th className="text-left py-3 px-2 font-medium">X Account</th>
                    <th className="text-left py-3 px-2 font-medium">Google</th>
                    <th className="text-left py-3 px-2 font-medium">TG</th>
                    <th className="text-left py-3 px-2 font-medium">Role</th>
                    <th className="text-left py-3 px-2 font-medium">Joined</th>
                    <th className="text-right py-3 px-2 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-nasun-white/5">
                  {displayUsers.map((user) => {
                    const banned = bannedIdentityIds.has(user.identityId);
                    return (
                    <tr
                      key={user.identityId}
                      onClick={() => setSelectedUserId(user.identityId)}
                      className={`cursor-pointer transition-colors ${
                        banned
                          ? "bg-red-500/10 hover:bg-red-500/15 border-l-2 border-red-400/60"
                          : "hover:bg-nasun-white/5"
                      }`}
                    >
                      <td className="py-3 px-2">
                        {user.profileImageUrl ? (
                          <img
                            src={user.profileImageUrl}
                            alt=""
                            loading="lazy"
                            className="w-6 h-6 rounded-full"
                          />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-nasun-c5/30 flex items-center justify-center text-nasun-white/50 text-xs">
                            ?
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-2 text-nasun-white font-medium">
                        {user.username || "-"}
                      </td>
                      <td className="py-3 px-2 text-nasun-white/60 font-mono text-xs">
                        {user.walletAddress ? (
                          <span className="inline-flex items-center gap-1">
                            {truncateAddress(user.walletAddress, 2, 4)}
                            <CopyButton text={user.walletAddress} />
                          </span>
                        ) : "-"}
                      </td>
                      <td className="py-3 px-2 text-nasun-white/80">
                        {user.originalTwitterHandle || user.twitterHandle ? (
                          <a
                            href={`https://x.com/${user.originalTwitterHandle || user.twitterHandle}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-blue-400 hover:underline"
                          >
                            @{user.originalTwitterHandle || user.twitterHandle}
                          </a>
                        ) : (
                          <span className="text-nasun-white/20">-</span>
                        )}
                      </td>
                      <td className="py-3 px-2 text-nasun-white/80 max-w-[180px] truncate">
                        {user.googleEmail || <span className="text-nasun-white/20">-</span>}
                      </td>
                      <td className="py-3 px-2">
                        {user.isTelegramMember ? (
                          <span className="text-green-400">✓</span>
                        ) : (
                          <span className="text-nasun-white/20">-</span>
                        )}
                      </td>
                      <td className="py-3 px-2">
                        <div className="flex flex-wrap gap-1">
                          <RoleBadge role={user.role} />
                          <BannedBadge banned={banned} />
                        </div>
                      </td>
                      <td className="py-3 px-2 text-nasun-white/60 whitespace-nowrap">
                        {user.createdAt
                          ? new Date(user.createdAt).toLocaleString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                              second: "2-digit",
                            })
                          : "-"}
                      </td>
                      <td className="py-3 px-2 text-right whitespace-nowrap">
                        <RowBanButton user={user} banned={banned} />
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {!isSearching && (
              <Pagination
                page={page}
                hasPrev={hasPrev}
                hasNext={hasNext}
                onPrev={handlePrev}
                onNext={handleNext}
                onFirst={handleFirst}
                isLoading={isLoading}
              />
            )}
          </>
        )}
      </OuterBox>

      {selectedUserId && detailData?.user && (
        <UserDetailModal
          user={detailData.user}
          banEntry={bannedListData?.bans.find((b) => b.identityId === detailData.user.identityId)}
          onClose={handleCloseModal}
        />
      )}
    </div>
  );
}
