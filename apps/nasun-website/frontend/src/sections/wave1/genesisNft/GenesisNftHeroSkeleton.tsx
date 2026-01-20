import { InlineLoading } from "@/components/ui/InlineLoading";

export default function GenesisNftHeroSkeleton() {
  return (
    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-[1920px] aspect-[16/9] min-h-[700px] z-0 bg-nasun-black flex items-center justify-center">
      <InlineLoading message="Loading..." size="lg" />
    </div>
  );
}
