import type { FC, ReactNode } from "react";
import type { SlideKind, IconKey } from "./slideVariants";

// Shared visual primitives used by both BonusCelebrationSlide and
// OnboardingSlide. Centralizing here means a single change propagates to
// both slide types without copy-paste drift.

export const Sparkle: FC<{ className?: string }> = ({ className }) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
  >
    <path d="M12 2l1.5 6.5L20 10l-6.5 1.5L12 18l-1.5-6.5L4 10l6.5-1.5z" />
  </svg>
);

export const Icon: FC<{ name: IconKey; className?: string }> = ({
  name,
  className,
}) => {
  const common = {
    className: className ?? "w-4 h-4",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    viewBox: "0 0 24 24",
    "aria-hidden": true,
  };
  switch (name) {
    case "trophy":
      return (
        <svg {...common}>
          <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z" />
          <path d="M5 4H3v3a4 4 0 0 0 4 4M19 4h2v3a4 4 0 0 1-4 4" />
        </svg>
      );
    case "chart":
      return (
        <svg {...common}>
          <path d="M3 3v18h18" />
          <path d="M7 14l4-4 3 3 5-6" />
        </svg>
      );
    case "controller":
      return (
        <svg {...common}>
          <path d="M6 11h4M8 9v4M15 12h.01M18 10h.01" />
          <rect x="2" y="6" width="20" height="12" rx="6" />
        </svg>
      );
    case "bug":
      return (
        <svg {...common}>
          <path d="M8 6V4a4 4 0 0 1 8 0v2" />
          <rect x="6" y="6" width="12" height="14" rx="6" />
          <path d="M2 12h4M18 12h4M3 18l3-2M21 18l-3-2M3 6l3 2M21 6l-3 2" />
        </svg>
      );
    case "chat":
      return (
        <svg {...common}>
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        </svg>
      );
    case "gift":
      return (
        <svg {...common}>
          <rect x="3" y="8" width="18" height="4" />
          <path d="M12 8v13M5 12v9h14v-9M12 8S9 2 6 5s6 3 6 3M12 8s3-6 6-3-6 3-6 3" />
        </svg>
      );
    case "shield":
      return (
        <svg {...common}>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      );
    case "sunrise":
      return (
        <svg {...common}>
          <path d="M17 18a5 5 0 0 0-10 0M12 2v7M4.22 10.22l1.42 1.42M1 18h2M21 18h2M18.36 11.64l1.42-1.42M23 22H1M8 6l4-4 4 4" />
        </svg>
      );
    case "users":
      return (
        <svg {...common}>
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case "pen":
      return (
        <svg {...common}>
          <path d="M12 19l7-7 3 3-7 7-3-3z" />
          <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
          <path d="M2 2l7.586 7.586" />
        </svg>
      );
    case "sparkle":
    default:
      return (
        <svg {...common}>
          <path d="M12 3l1.9 4.6L18 9l-4.1 1.4L12 15l-1.9-4.6L6 9l4.1-1.4L12 3z" />
          <path d="M19 14l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2zM5 14l.7 2 2 .7-2 .7L5 19.4l-.7-2-2-.7 2-.7.7-2z" />
        </svg>
      );
  }
};

// Per-category icon tint. Exported so both slide types use identical coloring.
export function tagIconColor(kind: SlideKind): string {
  switch (kind) {
    case "leaderboard-eco":
    case "airdrop-alliance":
      return "text-nasun-c3";
    case "leaderboard-pado":
    case "game":
    case "creator-post":
    case "creators-appreciation":
      return "text-pado-lavender";
    case "bugreport":
    case "feedback":
      return "text-pado-3";
    case "airdrop-gp":
    case "earlybird":
      return "text-nasun-c1";
    case "referral":
      return "text-nasun-coral";
    default:
      return "text-pado-3";
  }
}

interface SlideShellProps {
  glowGradient: string;
  watermark: string;
  // Optional overlay rendered above the glow (e.g. ConfettiBurst)
  overlay?: ReactNode;
  children: ReactNode;
}

// Outer chrome shared by both BonusCelebrationSlide and OnboardingSlide:
// glow background, grain texture, decorative sparkles, and watermark.
// Content is rendered inside via children.
export const SlideShell: FC<SlideShellProps> = ({
  glowGradient,
  watermark,
  overlay,
  children,
}) => (
  <div className="relative w-full h-full overflow-hidden rounded-md">
    <div className={`absolute inset-0 ${glowGradient}`} aria-hidden />
    <div
      className="absolute inset-0 opacity-[0.04] mix-blend-overlay pointer-events-none"
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
      }}
      aria-hidden
    />
    <Sparkle className="absolute top-3 right-12 w-4 h-4 text-pado-3/30" />
    <Sparkle className="absolute bottom-10 left-4 w-3 h-3 text-pado-3/25" />
    <Sparkle className="absolute top-12 left-10 w-2.5 h-2.5 text-nasun-c3/30" />
    {overlay}
    <span className="absolute top-3 right-4 sm:right-5 text-xs text-uju-secondary/60 tabular-nums z-10">
      {watermark}
    </span>
    {children}
  </div>
);
