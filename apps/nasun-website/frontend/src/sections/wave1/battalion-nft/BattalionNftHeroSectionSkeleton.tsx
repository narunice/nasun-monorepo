import { InlineLoading } from "@/components/ui/InlineLoading";

export default function BattalionNftHeroSectionSkeleton() {
  return (
    <div className="relative flex items-start justify-center h-screen overflow-hidden bg-nasun-black">
      <div className="absolute inset-0 bg-nasun-black flex items-center justify-center z-20">
        <InlineLoading message="Loading..." size="lg" />
      </div>
    </div>
  );
}
