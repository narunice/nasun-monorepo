import { PageLayout } from "@/components/layout/PageLayout";
import {
  RiderProcessCardsSection,
  RiderOverviewContentSection,
} from "@/components/app/ips/rider-studio";

export default function RiderStudioOverviewPage() {
  return (
    <PageLayout>
      <RiderProcessCardsSection />
      <RiderOverviewContentSection />
    </PageLayout>
  );
}
