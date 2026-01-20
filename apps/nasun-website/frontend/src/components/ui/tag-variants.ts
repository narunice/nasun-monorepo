// src/components/ui/tag-variants.ts
import { cva } from "class-variance-authority";

export const tagVariants = cva(
  "inline-flex items-center justify-center rounded-full transition-all uppercase",
  {
    variants: {
      variant: {
        // Filled variants (배경 + 테두리)
        filledScarlet: "border border-nasun-scarlet/80 bg-nasun-scarlet/10 text-nasun-scarlet ",
        filledC1: "border border-nasun-c1/80 bg-nasun-c1/10 text-nasun-c1 ",
        filledC2: "border border-nasun-c2/80 bg-nasun-c2/10 text-nasun-c2 ",
        filledC3: "border border-nasun-c3/80 bg-nasun-c3/10 text-nasun-c3 ",
        filledC4: "border border-nasun-c4/80 bg-nasun-c4/10 text-nasun-c4 ",
        filledC5: "border border-nasun-c5/80 bg-nasun-c5/10 text-nasun-c5 ",
        filledGensolRed:
          "border border-nasun-gensol-red bg-nasun-gensol-red/20 text-nasun-gensol-red",

        // Outline variants (테두리만)
        outlineScarlet: "border border-nasun-scarlet bg-transparent text-nasun-scarlet",
        outlineC1: "border border-nasun-c1/70 bg-transparent text-nasun-c1",
        outlineC2: "border border-nasun-c2/70 bg-transparent text-nasun-c2",
        outlineC3: "border border-nasun-c3/70 bg-transparent text-nasun-c3",
        outlineC4: "border border-nasun-c4/70 bg-transparent text-nasun-c4",
        outlineC5: "border border-nasun-c5/70 bg-transparent text-nasun-c5",
        outlineGensolRed: "border border-nasun-gensol-red/70 bg-transparent text-nasun-gensol-red",
      },
      size: {
        xs: "text-xs px-5 py-1",
        sm: "text-xs lg:text-sm px-5 md:px-7 lg:px-9 py-1",
        default: "text-xs lg:text-sm px-6 md:px-8 lg:px-10 py-1 ",
        md: "text-sm lg:text-base px-7 md:px-9 lg:px-11 py-1 lg:py-1.5",
        lg: "text-base lg:text-lg  px-8 md:px-10 lg:px-12 py-1  ",
      },
    },
    defaultVariants: {
      variant: "filledC1",
      size: "default",
    },
  },
);
