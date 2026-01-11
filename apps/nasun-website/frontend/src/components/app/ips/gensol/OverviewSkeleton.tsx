import { InlineLoading } from "../../../ui/InlineLoading";
import { SectionLayout } from "../../../layout/SectionLayout";

export default function OverviewSkeleton() {
  // Use h-screen to push content down and prevent layout shift of elements below (like the button)
  const containerClassName = "relative !p-0 h-screen w-full flex items-center justify-center";

  return (
    <SectionLayout className={containerClassName}>
      <div className="absolute inset-0 flex items-center justify-center z-20">
        <InlineLoading message="Loading..." size="lg" />
      </div>
    </SectionLayout>
  );
}
