// src/components/ui/tag-variants.ts
import { cva } from "class-variance-authority";

export const tagVariants = cva(
  "inline-flex items-center justify-center rounded-full transition-all uppercase",
  {
    variants: {
      variant: {
        // Filled variants (배경 + 테두리)
        filledScarlet:
          "border border-nasun-scarlet bg-nasun-scarlet/10 text-nasun-scarlet bg-nasun-scarlet/20",
        filledC1: "border border-nasun-c1 bg-nasun-c1/10 text-nasun-c1 bg-nasun-c1/20",
        filledC2: "border border-nasun-c2 bg-nasun-c2/10 text-nasun-c2 bg-nasun-c2/20",
        filledC3: "border border-nasun-c3 bg-nasun-c3/10 text-nasun-c3 bg-nasun-c3/20",
        filledC4: "border border-nasun-c4 bg-nasun-c4/10 text-nasun-c4 bg-nasun-c4/20",
        filledC5: "border border-nasun-c5 bg-nasun-c5/10 text-nasun-c5",
        filledGensolRed: "border border-nasun-gensol-red bg-nasun-gensol-red/20 text-nasun-gensol-red",

        // Outline variants (테두리만)
        outlineScarlet: "border border-nasun-scarlet bg-transparent text-nasun-scarlet",
        outlineC1: "border border-nasun-c1 bg-transparent text-nasun-c1",
        outlineC2: "border border-nasun-c2 bg-transparent text-nasun-c2",
        outlineC3: "border border-nasun-c3 bg-transparent text-nasun-c3",
        outlineC4: "border border-nasun-c4 bg-transparent text-nasun-c4",
        outlineC5: "border border-nasun-c5 bg-transparent text-nasun-c5",
        outlineGensolRed: "border border-nasun-gensol-red bg-transparent text-nasun-gensol-red",
      },
      size: {
        xs: "text-xs px-3 py-1", // 12px - Button xs와 일치
        sm: "text-sm px-3 py-1", // 14px - Button sm과 일치
        default: "text-sm px-3 py-[6px]", // 14px - Button default와 일치
        md: "text-base px-4 py-[6px]", // 16px - Button md와 일치
        lg: "text-lg px-6 py-2", // 18px - Button lg와 일치
      },
    },
    defaultVariants: {
      variant: "filledC1",
      size: "default",
    },
  }
);
