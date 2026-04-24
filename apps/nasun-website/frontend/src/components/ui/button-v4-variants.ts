import { cva } from "class-variance-authority";

export const buttonV4Variants = cva(
  "inline-flex items-center justify-center rounded-full font-light whitespace-nowrap active:scale-[0.97] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 disabled:active:scale-100 transition-all cursor-pointer",
  {
    variants: {
      color: {
        dark: "bg-nasun-black text-white hover:bg-neutral-800",
        light: "bg-white text-nasun-black hover:bg-neutral-100",
        // Transparent with white border/text — for use on dark backgrounds
        ghost:
          "bg-transparent border border-white text-white hover:bg-white/10",
        // Project gradient colors
        "sf-orange":
          "bg-gradient-to-r from-[#f05340] to-[#f5826e] hover:from-[#d94433] hover:to-[#e57260] text-white",
        baram:
          "bg-gradient-to-r from-[#5e9e5c] to-[#a2d4a0] hover:from-[#518c50] hover:to-[#90c68e] text-white",
        pado: "bg-gradient-to-r from-[#1a8cbc] to-[#5ee1e4] hover:from-[#167aa5] hover:to-[#4dcdd0] text-white",
        // Pado palette gradients (pado.1 #1a8cbc, pado.2 #3bb9d8, pado.3 #5ee1e4, pado.4 #86f3b7, pado.5 #d2f6a2, violet #7C5CFF, lavender #C9A7FF)
        "pado-ocean":
          "bg-gradient-to-r from-[#1a8cbc] to-[#3bb9d8] hover:from-[#167aa5] hover:to-[#33a5c2] text-white",
        "pado-aqua":
          "bg-gradient-to-r from-[#3bb9d8] to-[#5ee1e4] hover:from-[#33a5c2] hover:to-[#4dcdd0] text-white",
        "pado-mint":
          "bg-gradient-to-l from-[#5ee1e4] to-[#86f3b7] hover:from-[#4dcdd0] hover:to-[#74dfa4] text-nasun-black hover:text-pd1",
        "pado-lime":
          "bg-gradient-to-r from-[#86f3b7] to-[#d2f6a2] hover:from-[#74dfa4] hover:to-[#bde08e] text-nasun-black",
        "pado-tropical":
          "bg-gradient-to-r from-[#1a8cbc] via-[#5ee1e4] to-[#86f3b7] hover:from-[#167aa5] hover:via-[#4dcdd0] hover:to-[#74dfa4] text-white",
        "pado-spectrum":
          "bg-gradient-to-r from-[#1a8cbc] via-[#5ee1e4] via-[#86f3b7] to-[#d2f6a2] hover:from-[#167aa5] hover:via-[#4dcdd0] hover:to-[#bde08e] text-white",
        "pado-violet":
          "bg-gradient-to-r from-[#7C5CFF] to-[#C9A7FF] hover:from-[#6a4ae6] hover:to-[#b893ee] text-white",
        "pado-electric":
          "bg-gradient-to-r from-[#7C5CFF] to-[#5ee1e4] hover:from-[#6a4ae6] hover:to-[#4dcdd0] text-white",
        "nasun-network":
          "bg-gradient-to-r from-[#496c9c] to-[#a2c5d8] hover:from-[#3d5e8a] hover:to-[#92b9ce] text-white",
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
      {
        color: "dark",
        outline: true,
        class: "border-nasun-black text-nasun-black hover:bg-nasun-black/10",
      },
      {
        color: "light",
        outline: true,
        class: "border-white text-white hover:bg-white/10",
      },
      {
        color: "sf-orange",
        outline: true,
        class:
          "bg-none bg-transparent border-[#f05340] text-[#f05340] hover:bg-[#f05340]/10",
      },
      {
        color: "baram",
        outline: true,
        class:
          "bg-none bg-transparent border-[#5e9e5c] text-[#5e9e5c] hover:bg-[#5e9e5c]/10",
      },
      {
        color: "pado",
        outline: true,
        class:
          "bg-none bg-transparent border-[#1a8cbc] text-[#1a8cbc] hover:bg-[#1a8cbc]/10",
      },
      {
        color: "pado-ocean",
        outline: true,
        class:
          "bg-none bg-transparent border-[#1a8cbc] text-[#1a8cbc] hover:bg-[#1a8cbc]/10",
      },
      {
        color: "pado-aqua",
        outline: true,
        class:
          "bg-none bg-transparent border-[#3bb9d8] text-[#3bb9d8] hover:bg-[#3bb9d8]/10",
      },
      {
        color: "pado-mint",
        outline: true,
        class:
          "bg-none bg-transparent border-[#5ee1e4] text-[#5ee1e4] hover:bg-[#5ee1e4]/10",
      },
      {
        color: "pado-lime",
        outline: true,
        class:
          "bg-none bg-transparent border-[#86f3b7] text-[#86f3b7] hover:bg-[#86f3b7]/10",
      },
      {
        color: "pado-tropical",
        outline: true,
        class:
          "bg-none bg-transparent border-[#3bb9d8] text-[#3bb9d8] hover:bg-[#3bb9d8]/10",
      },
      {
        color: "pado-spectrum",
        outline: true,
        class:
          "bg-none bg-transparent border-[#5ee1e4] text-[#5ee1e4] hover:bg-[#5ee1e4]/10",
      },
      {
        color: "pado-violet",
        outline: true,
        class:
          "bg-none bg-transparent border-[#7C5CFF] text-[#7C5CFF] hover:bg-[#7C5CFF]/10",
      },
      {
        color: "pado-electric",
        outline: true,
        class:
          "bg-none bg-transparent border-[#7C5CFF] text-[#7C5CFF] hover:bg-[#7C5CFF]/10",
      },
      {
        color: "nasun-network",
        outline: true,
        class:
          "bg-none bg-transparent border-[#496c9c] text-[#496c9c] hover:bg-[#496c9c]/10",
      },
    ],
    defaultVariants: {
      color: "dark",
      outline: false,
      size: "md",
    },
  },
);
