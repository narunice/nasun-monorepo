import { InlineLoading } from "../../../ui/InlineLoading";

export default function PadoHeroSectionSkeleton() {
  const containerClassName = "relative !p-0 -mt-14 md:mt-0 mx-auto flex items-center justify-center bg-nasun-black h-screen";

  return (
    <div className={containerClassName}>
      <div className="absolute inset-0 bg-nasun-black flex items-center justify-center z-20">
        <InlineLoading message="Loading..." size="lg" />
      </div>
    </div>
  );
}
