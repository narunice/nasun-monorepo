import { useState } from "react";
import { AdminLayout } from "../components/AdminLayout";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { PageTitle } from "@/components/ui/PageTitle";
import { PageLoading } from "@/components/ui/PageLoading";
import { useAdminAuth } from "../hooks/useAdminAuth";
import { useUserList } from "../hooks/useUserManagement";
import { UsersTab } from "../components/users/UsersTab";
import { ReferralReviewTab } from "../components/users/ReferralReviewTab";

type AdminUserTab = "users" | "referral-review";

export function UserManagement() {
  const { cognitoToken } = useAdminAuth();
  const [tab, setTab] = useState<AdminUserTab>("users");

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
        <div className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <PageTitle as="h3" align="left">
              User Management
            </PageTitle>
            <div className="flex flex-col gap-1 -mt-6">
              <p className="text-nasun-white/80 max-w-2xl">
                Browse registered users and review pending referrals.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-6 border-b border-nasun-white/10">
          <button
            onClick={() => setTab("users")}
            className={
              "px-3 py-2 text-sm border-b-2 -mb-px " +
              (tab === "users"
                ? "border-nasun-c4 text-nasun-white"
                : "border-transparent text-nasun-white/60 hover:text-nasun-white")
            }
          >
            Users
          </button>
          <button
            onClick={() => setTab("referral-review")}
            className={
              "px-3 py-2 text-sm border-b-2 -mb-px " +
              (tab === "referral-review"
                ? "border-nasun-c4 text-nasun-white"
                : "border-transparent text-nasun-white/60 hover:text-nasun-white")
            }
          >
            Referral Review
          </button>
        </div>

        {tab === "users" && <UsersTab />}
        {tab === "referral-review" && <ReferralReviewTab />}
      </SectionLayout>
    </AdminLayout>
  );
}
