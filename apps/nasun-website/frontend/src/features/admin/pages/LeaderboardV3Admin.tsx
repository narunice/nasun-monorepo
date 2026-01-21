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

import { useState } from 'react';
import { AdminLayout } from '../components/AdminLayout';
import { SectionLayout } from '@/components/layout/SectionLayout';
import { useAdminAuth } from '../hooks/useAdminAuth';
import {
  AdminTabs,
  DashboardTab,
  PostRegistrationTab,
  LeaderboardViewTab,
  SeasonManagementTab,
  type AdminTabId,
} from '../components/leaderboard-v3';

export function LeaderboardV3Admin() {
  const [activeTab, setActiveTab] = useState<AdminTabId>('post');
  const { profile } = useAdminAuth();

  // Admin identifier for display
  const adminIdentifier = profile?.twitterHandle || profile?.username || profile?.email || 'unknown';

  return (
    <AdminLayout>
      <div className="bg-nasun-black min-h-screen">
        <SectionLayout className="!max-w-5xl !pt-12">
          {/* Header */}
          <div className="w-full mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-nasun-white uppercase mb-2">
                Leaderboard V3 Admin
              </h2>
              <p className="text-nasun-white/60 text-sm font-light">
                Manage seasons, posts, and view leaderboard data.
              </p>
            </div>
            <div className="text-xs text-nasun-white/40">
              Logged in as <span className="text-nasun-c3">@{adminIdentifier}</span>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="w-full mb-6">
            <AdminTabs activeTab={activeTab} onTabChange={setActiveTab} />
          </div>

          {/* Tab Content */}
          <div className="w-full">
            {activeTab === 'dashboard' && <DashboardTab />}
            {activeTab === 'post' && <PostRegistrationTab />}
            {activeTab === 'leaderboard' && <LeaderboardViewTab />}
            {activeTab === 'seasons' && <SeasonManagementTab />}
          </div>
        </SectionLayout>
      </div>
    </AdminLayout>
  );
}
