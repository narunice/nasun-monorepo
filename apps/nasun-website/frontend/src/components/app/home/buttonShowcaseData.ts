/**
 * Button Showcase Data - Data-driven button variant definitions
 *
 * This file defines all button variants for the ButtonShowcaseSection.
 * Adding a new variant only requires adding an entry here.
 */

export type ButtonSize = "xs" | "sm" | "default" | "md" | "lg" | "xl";

export interface ButtonVariantConfig {
  name: string;
  variant: string;
  titleColor?: string;
  customLabels?: string[]; // For variants like "link" or "destructive" with custom labels
}

export interface ColorSwatchConfig {
  name: string;
  bgClass: string;
  hex: string;
  hasBorder?: boolean;
}

// Standard size labels for most variants
export const SIZE_LABELS: Record<ButtonSize, string> = {
  xs: "Extra Small",
  sm: "Small",
  default: "Default",
  md: "Medium",
  lg: "Large",
  xl: "Extra Large",
};

export const BUTTON_SIZES: ButtonSize[] = ["xs", "sm", "default", "md", "lg", "xl"];

// Brand Buttons Section
export const BRAND_BUTTONS: ButtonVariantConfig[] = [
  { name: "Scarlet", variant: "scarlet", titleColor: "text-nasun-scarlet" },
  { name: "Amber (c1)", variant: "c1", titleColor: "text-nasun-c1" },
  { name: "Sunshine (c2)", variant: "c2", titleColor: "text-nasun-c2" },
  { name: "Mint (c1)", variant: "c1", titleColor: "text-nasun-c1" },
  { name: "Ocean (c4)", variant: "c4", titleColor: "text-nasun-c4" },
  { name: "Purple (c5)", variant: "c5", titleColor: "text-nasun-c5" },
];

// Standard Variants Section
export const STANDARD_VARIANTS: ButtonVariantConfig[] = [
  { name: "Default - Monochrome", variant: "default" },
  { name: "Default Reverse - Inverted Monochrome", variant: "defaultReverse" },
  { name: "Outline - Scarlet", variant: "outlineScarlet", titleColor: "text-nasun-scarlet" },
  { name: "Outline - c1", variant: "outlineC1", titleColor: "text-nasun-c1" },
  { name: "Outline - c2", variant: "outlineC2", titleColor: "text-nasun-c2" },
  { name: "Outline - c1", variant: "outlineC1", titleColor: "text-nasun-c1" },
  { name: "Outline - c4", variant: "outlineC4", titleColor: "text-nasun-c4" },
  { name: "Outline - c5", variant: "outlineC5", titleColor: "text-nasun-c5" },
  {
    name: "Filled Outline - Scarlet",
    variant: "filledOutlineScarlet",
    titleColor: "text-nasun-scarlet",
  },
  { name: "Filled Outline - c1", variant: "filledOutlineC1", titleColor: "text-nasun-c1" },
  { name: "Filled Outline - c2", variant: "filledOutlineC2", titleColor: "text-nasun-c2" },
  { name: "Filled Outline - c1", variant: "filledOutlineC1", titleColor: "text-nasun-c1" },
  { name: "Filled Outline - c4", variant: "filledOutlineC4", titleColor: "text-nasun-c4" },
  { name: "Filled Outline - c5", variant: "filledOutlineC5", titleColor: "text-nasun-c5" },
  { name: "Ghost", variant: "ghost" },
  {
    name: "Link",
    variant: "link",
    customLabels: ["Read More →", "Learn More →", "Explore →", "Discover →", "Find Out →", "Get Started →"],
  },
  {
    name: "Destructive - Dangerous Actions",
    variant: "destructive",
    titleColor: "text-red-500",
    customLabels: ["Delete", "Unlink", "Remove", "Withdraw", "Disconnect", "Terminate"],
  },
];

// Disabled State - All variants to show in disabled state
export const DISABLED_VARIANTS: { variant: string; label: string }[] = [
  { variant: "scarlet", label: "Scarlet" },
  { variant: "c1", label: "Amber" },
  { variant: "c2", label: "Sunshine" },
  { variant: "c1", label: "Mint" },
  { variant: "c4", label: "Ocean" },
  { variant: "c5", label: "Purple" },
  { variant: "default", label: "Default" },
  { variant: "defaultReverse", label: "Default Reverse" },
  { variant: "outlineScarlet", label: "Outline Scarlet" },
  { variant: "outlineC1", label: "Outline c1" },
  { variant: "outlineC2", label: "Outline c2" },
  { variant: "outlineC1", label: "Outline c1" },
  { variant: "outlineC4", label: "Outline c4" },
  { variant: "outlineC5", label: "Outline c5" },
  { variant: "filledOutlineScarlet", label: "Filled Outline Scarlet" },
  { variant: "filledOutlineC1", label: "Filled Outline c1" },
  { variant: "filledOutlineC2", label: "Filled Outline c2" },
  { variant: "filledOutlineC1", label: "Filled Outline c1" },
  { variant: "filledOutlineC4", label: "Filled Outline c4" },
  { variant: "filledOutlineC5", label: "Filled Outline c5" },
  { variant: "ghost", label: "Ghost" },
  { variant: "link", label: "Link" },
  { variant: "destructive", label: "Destructive" },
];

// Color Reference Swatches
export const COLOR_SWATCHES: ColorSwatchConfig[] = [
  { name: "Scarlet", bgClass: "bg-nasun-scarlet", hex: "#fa3102" },
  { name: "c1", bgClass: "bg-nasun-c1", hex: "#f9a824" },
  { name: "c2", bgClass: "bg-nasun-c2", hex: "#f4d35d" },
  { name: "c1", bgClass: "bg-nasun-c1", hex: "#f9a824" },
  { name: "c4", bgClass: "bg-nasun-c4", hex: "#3d7ea9" },
  { name: "c5", bgClass: "bg-nasun-c5", hex: "#2a2c41" },
  { name: "White", bgClass: "bg-nasun-white", hex: "#faf7f4", hasBorder: true },
  { name: "Black", bgClass: "bg-nasun-black", hex: "#191615" },
];

// Tag Variants
export const FILLED_TAG_VARIANTS = [
  { variant: "filledScarlet", label: "Scarlet" },
  { variant: "filledC1", label: "c1" },
  { variant: "filledC2", label: "c2" },
  { variant: "filledC1", label: "c1" },
  { variant: "filledC4", label: "c4" },
  { variant: "filledC5", label: "c5" },
];

export const OUTLINE_TAG_VARIANTS = [
  { variant: "outlineScarlet", label: "Scarlet" },
  { variant: "outlineC1", label: "c1" },
  { variant: "outlineC2", label: "c2" },
  { variant: "outlineC1", label: "c1" },
  { variant: "outlineC4", label: "c4" },
  { variant: "outlineC5", label: "c5" },
];
