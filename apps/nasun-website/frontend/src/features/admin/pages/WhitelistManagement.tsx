import { useState } from "react";
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
} from "../services/adminApi";
import { useWhitelistStats } from "../hooks/useWhitelistStats";

type Tab = "battalion" | "genesis-pass";

export function WhitelistManagement() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("battalion");
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: stats, isLoading: isLoadingStats, error: statsError } = useWhitelistStats();

  const handleExport = async (tab: Tab, format: "default" | "opensea" = "default") => {
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
        });
        prefix = format === "opensea" ? "genesis-pass-opensea-allowlist" : "genesis-pass-allowlist";
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
            Allowlist Export
          </PageTitle>
          <p className="text-nasun-white/60 max-w-2xl -mt-6">
            Download NFT allowlist data as CSV files for OpenSea or internal analysis.
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
              <button className={tabClass("battalion")} onClick={() => { setActiveTab("battalion"); setError(null); }}>
                Battalion NFT
              </button>
              <button className={tabClass("genesis-pass")} onClick={() => { setActiveTab("genesis-pass"); setError(null); }}>
                Genesis Pass
              </button>
            </div>

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

            {activeTab === "genesis-pass" && (
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

                <div className="flex flex-col sm:flex-row gap-4">
                  <Button
                    onClick={() => handleExport("genesis-pass", "default")}
                    disabled={isExporting}
                    variant="outlineC5"
                    size="lg"
                    className="min-w-[180px]"
                  >
                    {isExporting ? "Exporting..." : "Download CSV"}
                  </Button>
                  <Button
                    onClick={() => handleExport("genesis-pass", "opensea")}
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
