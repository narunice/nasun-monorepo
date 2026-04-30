export function UjuScoreUnavailableFallback() {
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-3 text-center bg-uju-bg/30 rounded-2xl border border-uju-border/10">
      <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center border border-amber-500/20">
        <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
      </div>
      <div>
        <p className="text-base font-normal text-amber-400">Score data temporarily unavailable</p>
        <p className="text-sm font-light text-uju-secondary mt-1">We're working on it. Your points are safe.</p>
      </div>
    </div>
  );
}
