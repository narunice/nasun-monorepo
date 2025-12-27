// /src/components/common/Loading.tsx
import { ReloadIcon } from "@radix-ui/react-icons";

export default function Loading() {
  return (
    <div className="h-screen w-full flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <ReloadIcon
          className="animate-spin text-nasun-white"
          width={32}
          height={32}
        />
        <p className="text-nasun-white/70 text-sm font-medium tracking-wide">
          Loading...
        </p>
      </div>
    </div>
  );
}
