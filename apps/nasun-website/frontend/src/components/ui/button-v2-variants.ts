// src/components/ui/button-v2-variants.ts
// Gradient button system v2 — sleek, modern style with left-to-right gradients
import { cva } from "class-variance-authority";

export const buttonV2Variants = cva(
  "inline-flex items-center justify-center rounded-full font-light whitespace-nowrap active:scale-[0.97] ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 disabled:active:scale-100 transition-all cursor-pointer",
  {
    variants: {
      variant: {
        red: "from-[#C4634A] to-[#E8A58A] hover:from-[#B85A42] hover:to-[#D4947A]",
        blue: "from-[#6898B8] to-[#9CC0D8] hover:from-[#5C8AAA] hover:to-[#8EB4CE]",
        white:
          "from-[#E0DAD0] to-[#FFFFFF] !text-nasun-black hover:from-[#D4CEC4] hover:to-[#F5F0E8]",
        purple: "from-[#7B68AE] to-[#A594D0] hover:from-[#6E5CA0] hover:to-[#9786C2]",
        "gensol-red": "from-[#d52933] to-[#e85a62] hover:from-[#c0242d] hover:to-[#d54a52]",
        "sf-orange": "from-[#f05340] to-[#f5826e] hover:from-[#d94433] hover:to-[#e57260]",
        baram: "from-[#5e9e5c] to-[#a2d4a0] hover:from-[#518c50] hover:to-[#90c68e]",
        pado: "from-[#3a5f78] to-[#aac9d5] hover:from-[#30516a] hover:to-[#9abdc9]",
        "nasun-network": "from-[#496c9c] to-[#a2c5d8] hover:from-[#3d5e8a] hover:to-[#92b9ce]",
      },
      outline: {
        true: "bg-transparent border",
        false: "text-nasun-white bg-gradient-to-r",
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
      {
        variant: "red",
        outline: true,
        class: "border-[#C4634A] text-[#C4634A] hover:bg-[#C4634A]/10",
      },
      {
        variant: "blue",
        outline: true,
        class: "border-[#6898B8] text-[#6898B8] hover:bg-[#6898B8]/10",
      },
      {
        variant: "white",
        outline: true,
        class: "border-[#E0DAD0] text-[#E0DAD0] hover:bg-[#E0DAD0]/10",
      },
      {
        variant: "purple",
        outline: true,
        class: "border-[#7B68AE] text-[#7B68AE] hover:bg-[#7B68AE]/10",
      },
      {
        variant: "gensol-red",
        outline: true,
        class: "border-[#d52933] text-[#d52933] hover:bg-[#d52933]/10",
      },
      {
        variant: "sf-orange",
        outline: true,
        class: "border-[#f05340] text-[#f05340] hover:bg-[#f05340]/10",
      },
      {
        variant: "baram",
        outline: true,
        class: "border-[#5e9e5c] text-[#5e9e5c] hover:bg-[#5e9e5c]/10",
      },
      {
        variant: "pado",
        outline: true,
        class: "border-[#3a5f78] text-[#3a5f78] hover:bg-[#3a5f78]/10",
      },
      {
        variant: "nasun-network",
        outline: true,
        class: "border-[#496c9c] text-[#496c9c] hover:bg-[#496c9c]/10",
      },
    ],
    defaultVariants: {
      variant: "red",
      outline: false,
      size: "md",
    },
  },
);
