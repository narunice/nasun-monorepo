import { AdminLayout } from "../components/AdminLayout";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { OuterBox } from "@/components/ui/OuterBox";
import { PageTitle } from "@/components/ui/PageTitle";
import { AdminFeatureCard } from "../components/AdminFeatureCard";
import { ADMIN_DASHBOARD_FEATURES } from "../config/adminConfig";

export function AdminDashboard() {
  return (
    <AdminLayout>
      <SectionLayout className="!max-w-6xl !pt-0">
        <div className="w-full mb-10">
          <PageTitle as="h3" align="left" className="">
            Admin Dashboard
          </PageTitle>
          <p className="text-nasun-white/60 max-w-2xl -mt-6 ">
            Manage allowlist exports, governance proposals, and monitor platform health through the
            centralized admin console.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full">
          {ADMIN_DASHBOARD_FEATURES.map((feature, index) => (
            <AdminFeatureCard key={index} {...feature} />
          ))}
        </div>

        {/* Quick Stats / Info */}
        <div className="w-full mt-12">
          <OuterBox color="w3" padding="md" className="w-full">
            <h2 className="text-lg font-medium text-nasun-white mb-3 flex items-center gap-2">
              <span className="w-1 h-5 bg-nasun-c4 rounded-full"></span>
              System Information
            </h2>
            <p className="text-nasun-white/60 text-base leading-relaxed">
              This admin panel allows you to manage NFT allowlist exports and governance features
              securely. All actions are logged. Please ensure you are connected with an authorized
              wallet address before proceeding with sensitive operations.
            </p>
          </OuterBox>
        </div>
      </SectionLayout>
    </AdminLayout>
  );
}
