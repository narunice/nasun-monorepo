import { useState } from "react";
import { AdminLayout } from "../components/AdminLayout";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { PageTitle } from "@/components/ui/PageTitle";
import { PageLoading } from "@/components/ui/PageLoading";
import { useAdminAuth } from "../hooks/useAdminAuth";
import { useUserList } from "../hooks/useUserManagement";
import { useAdminDashboard } from "../hooks/useAdminDashboard";
import { StatCard } from "../components/StatCard";
import { UsersTab } from "../components/users/UsersTab";
import { UserAnalyticsTab } from "../components/users/UserAnalyticsTab";
import { cn } from "@/utils/utils";

type TabId = "users" | "analytics";

const TABS: { id: TabId; label: string }[] = [
  { id: "users", label: "Users" },
  { id: "analytics", label: "Analytics" },
];

export function UserManagement() {
  const { cognitoToken } = useAdminAuth();
  const [activeTab, setActiveTab] = useState<TabId>("users");

  const { data, isPending } = useUserList(cognitoToken, { limit: 50 });

  if (isPending && !data) {
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
        <div className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <PageTitle as="h3" align="left">
              User Management
            </PageTitle>
            <div className="flex flex-col gap-1 -mt-6">
              <p className="text-nasun-white/80 max-w-2xl">
                Browse all registered user accounts. Full statistics are available via Gemini request.
              </p>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-1 p-1 bg-gray-800/70 rounded-sm border border-nasun-c5/35 mb-6">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-sm text-sm font-medium transition-all",
                activeTab === tab.id
                  ? "bg-nasun-c4 text-nasun-white shadow-lg"
                  : "text-nasun-white/80 hover:text-nasun-white hover:bg-gray-700/50"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === "users" && <UsersTab />}
        {activeTab === "analytics" && <UserAnalyticsTab />}
      </SectionLayout>
    </AdminLayout>
  );
}
