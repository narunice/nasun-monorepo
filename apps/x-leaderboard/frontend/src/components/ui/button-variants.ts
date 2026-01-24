import { cva } from "class-variance-authority";

export const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-full active:scale-[0.97] ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 disabled:active:scale-100 transition-all",
  {
    variants: {
      variant: {
        black: "bg-nasun-black/80 text-nasun-white hover:bg-nasun-black",
        white: "bg-nasun-white text-nasun-black hover:bg-nasun-white/80",
        c1: "bg-nasun-c1 text-nasun-black hover:bg-nasun-c1/80",
        c3: "bg-nasun-c3 text-nasun-black hover:bg-nasun-c3/80",
        c4: "bg-nasun-c4 text-nasun-white hover:bg-sky-700",
        c5: "bg-nasun-c5 text-nasun-white hover:bg-nasun-c5/80",
        outlineC1:
          "ring-1 ring-inset ring-nasun-c1/70 bg-transparent text-nasun-c1 hover:bg-nasun-c1/10",
        outlineC4:
          "ring-1 ring-inset ring-nasun-c4/70 bg-transparent text-nasun-c4 hover:bg-nasun-c4/10",
        ghost: "text-nasun-white hover:bg-nasun-c1/20",
        link: "text-nasun-white/80 underline-offset-4 underline hover:text-white",
      },
      size: {
        xs: "text-xs px-5 py-1",
        sm: "text-xs lg:text-sm px-5 md:px-7 lg:px-9 py-1",
        default: "text-xs lg:text-sm px-6 md:px-8 lg:px-10 py-1",
        md: "text-sm lg:text-base px-7 md:px-9 lg:px-11 py-1 lg:py-1.5",
        lg: "text-base lg:text-lg px-8 md:px-10 lg:px-12 py-1",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "c1",
      size: "default",
    },
  },
);
