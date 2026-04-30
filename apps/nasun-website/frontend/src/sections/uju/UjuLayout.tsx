interface UjuLayoutProps {
  children: React.ReactNode;
}

export function UjuLayout({ children }: UjuLayoutProps) {
  return (
    <div className="bg-uju-bg min-h-screen relative font-light">
      {/* Subtle ambient glow: violet from top-left, lavender from bottom-right.
          Pinned to viewport so scroll content stays crisp. */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
      >
        <div className="absolute -top-40 -left-40 w-[420px] h-[420px] rounded-full bg-blue-500/15 blur-3xl" />
        <div className="absolute -bottom-40 -right-40 w-[480px] h-[480px] rounded-full bg-pado-1/20 blur-3xl" />
      </div>
      <div className="relative z-10">{children}</div>
    </div>
  );
}
