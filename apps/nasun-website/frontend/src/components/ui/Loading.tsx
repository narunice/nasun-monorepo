import { Spinner } from "./Spinner";

export default function Loading() {
  return (
    <div className="h-screen w-full flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <Spinner size="lg" />
        <p className="text-nasun-white/70 text-sm font-medium tracking-wide">
          Loading...
        </p>
      </div>
    </div>
  );
}
