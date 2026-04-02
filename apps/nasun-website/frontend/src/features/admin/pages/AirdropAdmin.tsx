/**
 * AirdropAdmin - April 16th Airdrop Registration Management
 *
 * Lists all registrations, shows stats, allows approve/revert.
 */

import { useState, useEffect, useCallback } from "react";
import { AdminLayout } from "../components/AdminLayout";
import { StatCard } from "../components/StatCard";
import { OuterBox } from "@/components/ui";
import { useAdminAuth } from "../hooks/useAdminAuth";
import {
  listAirdropRegistrations,
  updateAirdropStatus,
  type AirdropRegistration,
} from "../services/airdropAdminApi";

export const AirdropAdmin = () => {
  return (
    <AdminLayout>
      <h1 className="text-2xl font-bold text-nasun-white mb-6">
        April 16th Airdrop
      </h1>
      <AirdropContent />
    </AdminLayout>
  );
};

function AirdropContent() {
  const { cognitoToken } = useAdminAuth();
  const [registrations, setRegistrations] = useState<AirdropRegistration[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!cognitoToken) return;
    try {
      setIsLoading(true);
      setError(null);
      const items = await listAirdropRegistrations(cognitoToken);
      setRegistrations(items);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, [cognitoToken]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleStatusChange = useCallback(
    async (identityId: string, newStatus: "pending" | "approved" | "rejected") => {
      if (!cognitoToken) return;
      try {
        setUpdatingId(identityId);
        await updateAirdropStatus(cognitoToken, identityId, newStatus);
        setRegistrations((prev) =>
          prev.map((r) =>
            r.identityId === identityId
              ? { ...r, status: newStatus, ...(newStatus === "approved" ? { approvedAt: new Date().toISOString() } : {}) }
              : r
          )
        );
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setUpdatingId(null);
      }
    },
    [cognitoToken]
  );

  const total = registrations.length;
  const pending = registrations.filter((r) => r.status === "pending").length;
  const approved = registrations.filter((r) => r.status === "approved").length;
  const rejected = registrations.filter((r) => r.status === "rejected").length;

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Total" value={total} />
        <StatCard label="Pending" value={pending} />
        <StatCard label="Approved" value={approved} />
        <StatCard label="Rejected" value={rejected} />
      </div>

      {/* Table */}
      <OuterBox color="c5" padding="sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-nasun-white">
            Registrations
          </h2>
          <button
            onClick={fetchData}
            disabled={isLoading}
            className="text-xs text-nasun-white/50 hover:text-nasun-white transition-colors"
          >
            {isLoading ? "Loading..." : "Refresh"}
          </button>
        </div>

        {error && (
          <p className="text-red-400 text-sm mb-4">{error}</p>
        )}

        {isLoading && registrations.length === 0 ? (
          <p className="text-nasun-white/50 text-sm py-8 text-center">
            Loading registrations...
          </p>
        ) : registrations.length === 0 ? (
          <p className="text-nasun-white/50 text-sm py-8 text-center">
            No registrations yet
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-nasun-white/50 text-xs uppercase border-b border-nasun-white/10">
                  <th className="text-left py-2 px-2">#</th>
                  <th className="text-left py-2 px-2">Twitter</th>
                  <th className="text-left py-2 px-2">Wallet</th>
                  <th className="text-left py-2 px-2">Status</th>
                  <th className="text-left py-2 px-2">Registered</th>
                  <th className="text-left py-2 px-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {registrations.map((r, i) => (
                  <tr
                    key={r.identityId}
                    className="border-b border-nasun-white/5 hover:bg-nasun-white/5 transition-colors"
                  >
                    <td className="py-2 px-2 text-nasun-white/40">
                      {i + 1}
                    </td>
                    <td className="py-2 px-2 text-nasun-white">
                      {r.twitterHandle ? (
                        <a
                          href={`https://x.com/${r.twitterHandle}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-nasun-c7 hover:underline"
                        >
                          @{r.twitterHandle}
                        </a>
                      ) : (
                        <span className="text-nasun-white/30">-</span>
                      )}
                    </td>
                    <td className="py-2 px-2 font-mono text-xs text-nasun-white/60">
                      {r.walletAddress
                        ? `${r.walletAddress.slice(0, 8)}...${r.walletAddress.slice(-6)}`
                        : "-"}
                    </td>
                    <td className="py-2 px-2">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                          r.status === "approved"
                            ? "bg-emerald-500/20 text-emerald-400"
                            : r.status === "rejected"
                              ? "bg-red-500/20 text-red-400"
                              : "bg-yellow-500/20 text-yellow-400"
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-nasun-white/50 text-xs">
                      {r.registeredAt
                        ? new Date(r.registeredAt).toLocaleString("en-US", {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "-"}
                    </td>
                    <td className="py-2 px-2">
                      <div className="flex gap-1">
                        {r.status !== "approved" && (
                          <button
                            onClick={() => handleStatusChange(r.identityId, "approved")}
                            disabled={updatingId === r.identityId}
                            className="text-xs px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 transition-colors"
                          >
                            {updatingId === r.identityId ? "..." : "Approve"}
                          </button>
                        )}
                        {r.status !== "rejected" && (
                          <button
                            onClick={() => handleStatusChange(r.identityId, "rejected")}
                            disabled={updatingId === r.identityId}
                            className="text-xs px-2.5 py-1 rounded bg-red-600/80 hover:bg-red-500 text-white disabled:opacity-50 transition-colors"
                          >
                            {updatingId === r.identityId ? "..." : "Reject"}
                          </button>
                        )}
                        {r.status !== "pending" && (
                          <button
                            onClick={() => handleStatusChange(r.identityId, "pending")}
                            disabled={updatingId === r.identityId}
                            className="text-xs px-2.5 py-1 rounded bg-nasun-white/10 hover:bg-nasun-white/20 text-nasun-white/60 disabled:opacity-50 transition-colors"
                          >
                            {updatingId === r.identityId ? "..." : "Revert"}
                          </button>
                        )}
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
  );
}
