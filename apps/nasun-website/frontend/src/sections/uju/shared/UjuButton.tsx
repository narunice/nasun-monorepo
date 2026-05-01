import {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ElementType,
  forwardRef,
  ReactNode,
} from "react";

/**
 * Uju button system — hierarchy & semantics
 *
 *   primary    The single most important CTA on a surface ("Stake", "Mint",
 *              "Claim All Tokens"). Bright violet→cyan gradient pill with
 *              glow. There should be at most one primary per card.
 *   accent     Value-positive / connection action ("Connect MetaMask",
 *              "Activate"). Cyan gradient pill, slightly less weight than
 *              primary so the two can coexist when needed.
 *   secondary  Alternative or sub-CTA ("Phantom", "Solflare", "View on
 *              OpenSea", empty-state "Manage in App Directory"). Solid
 *              tinted pill with visible border — clearly a button, but
 *              quieter than primary/accent.
 *   ghost     Low-emphasis navigation / "browse" action ("Manage in App
 *              Directory" when items already exist). Transparent fill,
 *              outlined pill.
 *   danger    Destructive ("Disconnect", "Deactivate"). Coral pill.
 *   link      Inline-text action inside dense rows ("Missions", "Open ↗").
 *              No chrome, only color + hover. Use sparingly so it does not
 *              compete with badges.
 *
 * Size scale
 *   xs  28px  inline / compact rows
 *   sm  36px  card actions, list items
 *   md  44px  default — section CTA
 *   lg  52px  hero / banner CTA
 *
 * iconOnly
 *   Renders a square pill (w==h) with no horizontal padding. Use for
 *   refresh, three-dot menu, close glyphs. The icon should be the only
 *   child.
 */

export type UjuButtonVariant =
  | "primary"
  | "accent"
  | "secondary"
  | "ghost"
  | "danger"
  | "link";
export type UjuButtonSize = "xs" | "sm" | "md" | "lg";

type UjuButtonOwnProps = {
  variant?: UjuButtonVariant;
  size?: UjuButtonSize;
  fullWidth?: boolean;
  iconOnly?: boolean;
  /** Optional leading glyph rendered inside the button before children. */
  leadingIcon?: ReactNode;
  /** Optional trailing glyph rendered inside the button after children. */
  trailingIcon?: ReactNode;
  /** Render as a different element (e.g. "a" for external links). Defaults to "button". */
  as?: "button" | "a";
};

type UjuButtonProps = UjuButtonOwnProps &
  (
    | ({ as?: "button" } & ButtonHTMLAttributes<HTMLButtonElement>)
    | ({ as: "a" } & AnchorHTMLAttributes<HTMLAnchorElement>)
  );

// Shape: pill (rounded-full) for everything except link.
const SHAPE = "rounded-full";

// Single unified gradient (pado cyan → lime) for ALL value-positive CTAs.
// primary and accent share visuals on purpose: only one gradient style appears
// across the whole uju dashboard so the eye learns "cyan→lime pill = action".
// Dark text (uju-bg) on the bright gradient keeps WCAG contrast comfortable.
const PILL_GRADIENT =
  "bg-gradient-to-r from-pado-3 via-pado-4 to-pado-5 text-uju-bg font-semibold " +
  "shadow-[0_6px_20px_rgba(94,225,228,0.4)] " +
  "hover:brightness-110 hover:shadow-[0_8px_28px_rgba(134,243,183,0.55)] hover:-translate-y-0.5 " +
  "active:scale-95 active:translate-y-0 " +
  "disabled:opacity-50 disabled:shadow-none disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:brightness-100";

// Pill variants share the same shape and motion baseline; only fills differ.
const VARIANT: Record<UjuButtonVariant, string> = {
  primary: PILL_GRADIENT,
  accent: PILL_GRADIENT,
  secondary:
    "bg-pado-3/15 text-pado-4 font-medium border border-pado-3/60 " +
    "shadow-[0_2px_10px_rgba(94,225,228,0.15)] " +
    "hover:bg-pado-3/25 hover:text-pado-5 hover:border-pado-3 hover:shadow-[0_4px_14px_rgba(134,243,183,0.28)] " +
    "active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed",
  ghost:
    "bg-transparent text-uju-secondary font-medium border border-uju-border " +
    "hover:text-pado-4 hover:bg-uju-bg/40 hover:border-pado-3/50 " +
    "active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed",
  danger:
    "bg-nasun-coral/20 text-nasun-coral font-medium border border-nasun-coral/50 " +
    "hover:bg-nasun-coral/35 hover:text-white hover:border-nasun-coral " +
    "hover:shadow-[0_4px_14px_rgba(255,77,77,0.3)] " +
    "active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed",
  link:
    "bg-transparent text-pado-2 hover:text-pado-4 underline-offset-4 hover:underline " +
    "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:no-underline",
};

// Pill sizes (text-only or text+icon).
const SIZE_PILL: Record<UjuButtonSize, string> = {
  xs: "px-3 py-1 text-sm min-h-[28px]",
  sm: "px-4 py-1.5 text-base min-h-[36px]",
  md: "px-5 py-2.5 text-base min-h-[44px]",
  lg: "px-6 py-3 text-lg min-h-[52px]",
};

// Square pill sizes — used when iconOnly is true.
const SIZE_ICON: Record<UjuButtonSize, string> = {
  xs: "w-7 h-7 min-w-[28px] min-h-[28px]",
  sm: "w-9 h-9 min-w-[36px] min-h-[36px]",
  md: "w-11 h-11 min-w-[44px] min-h-[44px]",
  lg: "w-13 h-13 min-w-[52px] min-h-[52px]",
};

// Link sizes — no padding/min-h, inherits row height.
const SIZE_LINK: Record<UjuButtonSize, string> = {
  xs: "text-sm",
  sm: "text-base",
  md: "text-base",
  lg: "text-lg",
};

export const UjuButton = forwardRef<HTMLButtonElement | HTMLAnchorElement, UjuButtonProps>(
  (props, ref) => {
    const {
      variant = "primary",
      size = "md",
      fullWidth = false,
      iconOnly = false,
      leadingIcon,
      trailingIcon,
      as = "button",
      className = "",
      children,
      ...rest
    } = props;

    const isLink = variant === "link";
    const shape = isLink ? "" : SHAPE;
    const sizeClass = isLink
      ? SIZE_LINK[size]
      : iconOnly
        ? SIZE_ICON[size]
        : SIZE_PILL[size];

    const motion = isLink
      ? "transition-colors"
      : "transition-all duration-200 ease-out";

    const resolvedClassName = `inline-flex items-center justify-center gap-2 ${motion} disabled:cursor-not-allowed ${VARIANT[variant]} ${shape} ${sizeClass} ${fullWidth ? "w-full" : ""} ${className}`;

    const inner = (
      <>
        {leadingIcon && <span className="shrink-0 inline-flex">{leadingIcon}</span>}
        {children}
        {trailingIcon && <span className="shrink-0 inline-flex">{trailingIcon}</span>}
      </>
    );

    const Tag = as as ElementType;
    return (
      <Tag
        ref={ref as never}
        {...(rest as Record<string, unknown>)}
        className={resolvedClassName}
      >
        {inner}
      </Tag>
    );
  },
);
UjuButton.displayName = "UjuButton";
