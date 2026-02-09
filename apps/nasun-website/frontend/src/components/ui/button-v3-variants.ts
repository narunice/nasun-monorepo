// Button V3 — Nasun Network (NW) color palette with solid variants
// Designed for dark-themed backgrounds (nasun-website default)
import { cva } from "class-variance-authority";

export const buttonV3Variants = cva(
  "inline-flex items-center justify-center rounded-full font-light whitespace-nowrap active:scale-[0.97] ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 disabled:active:scale-100 transition-all cursor-pointer",
  {
    variants: {
      variant: {
        // Solid variants — all visible on dark backgrounds
        nw1: "bg-[#6697b7] text-white hover:bg-[#5a87a5]",
        nw2: "bg-[#4c7d9a] text-white hover:bg-[#416d87]",
        nw3: "bg-[#3e5c7a] text-white hover:bg-[#344e68]",
        nw4: "bg-[#afc3cf] text-nasun-black hover:bg-[#9bb3c0]",
        nw5: "bg-[#e6e6e6] text-nasun-black hover:bg-[#d4d4d4]",

        // Gradient variant
        gradient:
          "bg-gradient-to-r from-[#6697b7] to-[#9CC0D8] text-white hover:from-[#5a87a5] hover:to-[#8EB4CE]",
      },
      outline: {
        true: "bg-transparent bg-none border",
        false: "",
      },
      size: {
        xs: "text-xs px-6 py-1",
        sm: "text-sm px-8 py-1.5",
        md: "text-base px-10 py-2",
        lg: "text-lg px-12 py-2",
        xl: "text-xl px-14 py-2.5",
      },
    },
    compoundVariants: [
      // Outline variants — only colors with sufficient contrast on dark backgrounds
      { variant: "nw1", outline: true, class: "border-[#6697b7] text-[#6697b7] hover:bg-[#6697b7]/10" },
      { variant: "nw2", outline: true, class: "border-[#6697b7] text-[#6697b7] hover:bg-[#6697b7]/10" },
      { variant: "nw3", outline: true, class: "border-[#6697b7] text-[#6697b7] hover:bg-[#6697b7]/10" },
      { variant: "nw4", outline: true, class: "border-[#afc3cf] text-[#afc3cf] hover:bg-[#afc3cf]/10" },
      { variant: "nw5", outline: true, class: "border-[#e6e6e6] text-[#e6e6e6] hover:bg-[#e6e6e6]/10" },
    ],
    defaultVariants: {
      variant: "nw1",
      outline: false,
      size: "md",
    },
  },
);
