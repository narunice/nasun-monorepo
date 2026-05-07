import { AdminLayout } from "../components/AdminLayout";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { PageTitle } from "@/components/ui/PageTitle";
import { PageLoading } from "@/components/ui/PageLoading";
import { useAdminAuth } from "../hooks/useAdminAuth";
import { useUserList } from "../hooks/useUserManagement";
import { UsersTab } from "../components/users/UsersTab";

export function UserManagement() {
  const { cognitoToken } = useAdminAuth();

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
                Browse all registered user accounts. Full statistics are available via Gemini request.
              </p>
            </div>
          </div>
        </div>

        <UsersTab />
      </SectionLayout>
    </AdminLayout>
  );
}
