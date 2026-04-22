import { cva } from "class-variance-authority";

export const buttonV4Variants = cva(
  "inline-flex items-center justify-center rounded-full font-light whitespace-nowrap active:scale-[0.97] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 disabled:active:scale-100 transition-all cursor-pointer",
  {
    variants: {
      color: {
        dark: "bg-nasun-black text-white hover:bg-neutral-800",
        light: "bg-white text-nasun-black hover:bg-neutral-100",
        // Transparent with white border/text — for use on dark backgrounds
        ghost: "bg-transparent border border-white text-white hover:bg-white/10",
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
    ],
    defaultVariants: {
      color: "dark",
      outline: false,
      size: "md",
    },
  },
);
