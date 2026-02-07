// src/components/ui/button-v2-variants.ts
// Gradient button system v2 — sleek, modern style with left-to-right gradients
import { cva } from "class-variance-authority";

export const buttonV2Variants = cva(
  "inline-flex items-center justify-center rounded-full font-light text-nasun-white bg-gradient-to-r active:scale-[0.97] ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 disabled:active:scale-100 transition-all cursor-pointer",
  {
    variants: {
      variant: {
        red: "from-[#C4634A] to-[#E8A58A] hover:from-[#B85A42] hover:to-[#D4947A]",
        blue: "from-[#6898B8] to-[#9CC0D8] hover:from-[#5C8AAA] hover:to-[#8EB4CE]",
      },
      size: {
        xs: "text-xs px-6 py-1.5",
        sm: "text-sm px-8 py-2",
        md: "text-base px-10 py-2.5",
        lg: "text-lg px-12 py-2.5",
        xl: "text-xl px-14 py-3",
      },
    },
    defaultVariants: {
      variant: "red",
      size: "md",
    },
  },
);
