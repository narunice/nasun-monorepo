import { AdminLayout } from "../components/AdminLayout";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { PageTitle } from "@/components/ui/PageTitle";
import { FeaturedFeedTab } from "../components/leaderboard-v3";

export function FeaturedFeedManagement() {
  return (
    <AdminLayout>
      <SectionLayout className="!max-w-6xl !pt-0">
        <div className="mb-8">
          <PageTitle as="h3" align="left" className="">
            Featured Feed
          </PageTitle>
          <p className="text-nasun-white/60 -mt-6">
            Curate the featured posts that appear on the leaderboard sidebar.
          </p>
        </div>

        <div className="w-full">
          <FeaturedFeedTab />
        </div>
      </SectionLayout>
    </AdminLayout>
  );
}
