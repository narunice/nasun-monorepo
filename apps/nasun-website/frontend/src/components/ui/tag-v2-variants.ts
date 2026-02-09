import { cva } from "class-variance-authority";

export const tagV2Variants = cva(
  "inline-flex items-center justify-center rounded-full transition-all uppercase",
  {
    variants: {
      variant: {
        // Filled variants — solid color background, contrasting text
        // nw1-3: dark enough to need white text; nw4-5: light, needs dark text
        filledNw1: "bg-nasun-nw1 text-white",
        filledNw2: "bg-nasun-nw2 text-white",
        filledNw3: "bg-nasun-nw3 text-white",
        filledNw4: "bg-nasun-nw4 text-nasun-black",
        filledNw5: "bg-nasun-nw5 text-nasun-black",

        // Subtle variants — tinted background + color text (best on dark backgrounds)
        // Higher opacity bg for visibility on dark themes
        subtleNw1: "border border-nasun-nw1/40 bg-nasun-nw1/15 text-nasun-nw1",
        subtleNw4: "border border-nasun-nw4/40 bg-nasun-nw4/15 text-nasun-nw4",
        subtleNw5: "border border-nasun-nw5/30 bg-nasun-nw5/10 text-nasun-nw5",

        // Outline variants — transparent bg, border + text in color
        // On dark backgrounds, only nw1/nw4/nw5 have sufficient contrast
        outlineNw1: "border border-nasun-nw1 bg-transparent text-nasun-nw1",
        outlineNw2: "border border-nasun-nw2 bg-transparent text-nasun-nw2",
        outlineNw4: "border border-nasun-nw4 bg-transparent text-nasun-nw4",
        outlineNw5: "border border-nasun-nw5/70 bg-transparent text-nasun-nw5",
      },
      size: {
        xs: "text-xs px-5 py-1",
        sm: "text-xs lg:text-sm px-5 md:px-7 lg:px-9 py-1",
        default: "text-xs lg:text-sm px-6 md:px-8 lg:px-10 py-1",
        md: "text-sm lg:text-base px-7 md:px-9 lg:px-11 py-1 lg:py-1.5",
        lg: "text-base lg:text-lg px-8 md:px-10 lg:px-12 py-1",
      },
    },
    defaultVariants: {
      variant: "filledNw1",
      size: "default",
    },
  },
);
