import { PageLayout } from "../../../components/layout/PageLayout";
import {
  RiderStudioImageHeroSection,
  RiderStudioHeroSection,
} from "../../../components/app/ips/rider-studio";

export default function RiderStudioMainPage() {
  return (
    <PageLayout className="!pt-0">
      <RiderStudioImageHeroSection />
      <RiderStudioHeroSection />
    </PageLayout>
  );
}
