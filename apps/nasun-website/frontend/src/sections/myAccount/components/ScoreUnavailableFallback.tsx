export function ScoreUnavailableFallback() {
  return (
    <div className="flex flex-col items-center justify-center py-8 gap-2 text-center">
      <p className="text-sm font-medium text-amber-400">Score data temporarily unavailable</p>
      <p className="text-xs text-nasun-white/60">We're working on it. Your points are safe.</p>
    </div>
  );
}
