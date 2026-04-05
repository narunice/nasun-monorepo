// Button V3 — Nasun Network (NW) color palette with solid variants
// Designed for dark-themed backgrounds (nasun-website default)
import { cva } from "class-variance-authority";

export const buttonV3Variants = cva(
  "inline-flex items-center justify-center rounded-full font-light whitespace-nowrap active:scale-[0.97] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 disabled:active:scale-100 transition-all cursor-pointer",
  {
    variants: {
      variant: {
        // Solid variants — all visible on dark backgrounds
        nw1: "bg-[#6697b7] text-white hover:bg-[#5a87a5]",
        nw2: "bg-[#4c7d9a] text-white relative overflow-hidden before:absolute before:inset-0 before:bg-gradient-to-r before:from-white/30 before:via-white/15 before:to-transparent before:-translate-x-full before:transition-transform before:duration-500 before:ease-out hover:before:translate-x-0",
        nw3: "bg-[#3e5c7a] text-white hover:bg-[#344e68]",
        nw4: "bg-[#afc3cf] text-nasun-black hover:bg-[#9bb3c0]",
        nw5: "bg-[#e6e6e6] text-nasun-black hover:bg-[#d4d4d4]",

        // Brand variants
        "gensol-red": "bg-[#d52933] text-white hover:bg-[#c0242d]",
        "sf-orange": "bg-[#f05340] text-white hover:bg-[#d94433]",

        // Semantic variants
        red: "bg-red-600 text-white hover:bg-red-700",
        green: "bg-green-600 text-white hover:bg-green-700",

        // Gradient variants
        gradient:
          "bg-gradient-to-r from-[#6697b7] to-[#9CC0D8] text-white hover:from-[#5a87a5] hover:to-[#8EB4CE]",
        gradientDark:
          "bg-gradient-to-r from-[#4c7d9a] to-[#85B3CC] text-white hover:from-[#416d87] hover:to-[#78A5BD]",
        "sf-orange-gradient":
          "bg-gradient-to-r from-[#f05340] to-[#f5826e] text-white hover:from-[#d94433] hover:to-[#e57260]",
        "c1-gradient":
          "bg-gradient-to-r from-[#f9a824] to-[#fbc96a] text-nasun-black hover:from-[#e09620] hover:to-[#f0b94e]",
      },
      outline: {
        true: "bg-transparent bg-none border",
        false: "",
      },
      size: {
        xs: "text-xs px-6 py-1",
        sm: "text-sm px-8 py-1.5",
        md: "text-base px-12 py-2",
        lg: "text-lg px-14 py-2",
        xl: "text-xl px-16 py-2.5",
      },
    },
    compoundVariants: [
      // Outline variants — only colors with sufficient contrast on dark backgrounds
      {
        variant: "sf-orange",
        outline: true,
        class: "border-[#f05340] text-[#f05340] hover:bg-[#f05340]/10",
      },
      {
        variant: "sf-orange-gradient",
        outline: true,
        class: "border-[#f05340] text-[#f05340] hover:bg-[#f05340]/10",
      },
      {
        variant: "nw1",
        outline: true,
        class: "border-[#6697b7] text-[#6697b7] hover:bg-[#6697b7]/10",
      },
      {
        variant: "nw2",
        outline: true,
        class: "border-[#6697b7] text-[#6697b7] hover:bg-[#6697b7]/10",
      },
      {
        variant: "nw3",
        outline: true,
        class: "border-[#6697b7] text-[#6697b7] hover:bg-[#6697b7]/10",
      },
      {
        variant: "nw4",
        outline: true,
        class: "border-[#afc3cf] text-[#afc3cf] hover:bg-[#afc3cf]/10",
      },
      {
        variant: "nw5",
        outline: true,
        class: "border-[#e6e6e6] text-[#e6e6e6] hover:bg-[#e6e6e6]/10",
      },
    ],
    defaultVariants: {
      variant: "nw1",
      outline: false,
      size: "md",
    },
  },
);
