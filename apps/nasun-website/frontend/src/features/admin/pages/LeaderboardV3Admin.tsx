/**
 * Leaderboard V3 Admin Page
 *
 * Comprehensive admin interface for Leaderboard V3 management.
 * Features:
 * - Dashboard: System statistics and overview
 * - Post: Manual post registration with keyboard shortcuts
 * - Leaderboard: Season/Cumulative view with CSV export
 * - Seasons: Season CRUD management
 */

import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AdminLayout } from "../components/AdminLayout";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { PageTitle } from "@/components/ui/PageTitle";
import { useAdminAuth } from "../hooks/useAdminAuth";
import {
  AdminTabs,
  DashboardTab,
  PostRegistrationTab,
  LeaderboardViewTab,
  SeasonManagementTab,
  ScoreAdjustmentTab,
  type AdminTabId,
} from "../components/leaderboard-v3";

export function LeaderboardV3Admin() {
  const [activeTab, setActiveTab] = useState<AdminTabId>("post");
  const { profile } = useAdminAuth();
  const queryClient = useQueryClient();

  const handleTabChange = useCallback((tab: AdminTabId) => {
    setActiveTab(tab);
    // Invalidate all admin queries so the new tab shows fresh data
    queryClient.invalidateQueries({ queryKey: ['leaderboard-v3'] });
    queryClient.invalidateQueries({ queryKey: ['admin-cumulative-leaderboard'] });
    queryClient.invalidateQueries({ queryKey: ['admin-dashboard-stats'] });
    queryClient.invalidateQueries({ queryKey: ['admin-seasons'] });
  }, [queryClient]);

  // Admin identifier for display
  const adminIdentifier =
    profile?.twitterHandle || profile?.username || profile?.email || "unknown";

  return (
    <AdminLayout>
      <SectionLayout className="!max-w-6xl !pt-0">
        {/* Header */}
        <div className="w-full mb-8 flex items-end justify-between">
          <div>
            <PageTitle as="h3" align="left" className="">
              Leaderboard V3 Admin
            </PageTitle>
            <p className="text-nasun-white/60 -mt-6">
              Manage seasons, posts, and view leaderboard data.
            </p>
          </div>
          <div className="text-sm text-nasun-white/40 mb-1">
            Logged in as <span className="text-nasun-c1 font-medium">@{adminIdentifier}</span>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="w-full mb-6">
          <AdminTabs activeTab={activeTab} onTabChange={handleTabChange} />
        </div>

        {/* Tab Content */}
        <div className="w-full">
          {activeTab === "dashboard" && <DashboardTab />}
          {activeTab === "post" && <PostRegistrationTab />}
          {activeTab === "leaderboard" && <LeaderboardViewTab />}
          {activeTab === "seasons" && <SeasonManagementTab />}
          {activeTab === "adjust" && <ScoreAdjustmentTab />}
        </div>
      </SectionLayout>
    </AdminLayout>
  );
}
