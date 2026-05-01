interface UjuLayoutProps {
  children: React.ReactNode;
}

export function UjuLayout({ children }: UjuLayoutProps) {
  return (
    <div className="bg-uju-bg min-h-screen relative font-light font-inter">
      {/* Subtle ambient glow: pado teal palette top-to-bottom.
          Pinned to viewport so scroll content stays crisp. */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
      >
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full bg-pado-1/[0.18] blur-3xl" />
        <div className="absolute -bottom-40 -right-40 w-[600px] h-[600px] rounded-full bg-pado-2/15 blur-3xl" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[300px] h-[300px] rounded-full bg-pado-3/10 blur-3xl" />
      </div>
      <div className="relative z-10">{children}</div>
    </div>
  );
}
