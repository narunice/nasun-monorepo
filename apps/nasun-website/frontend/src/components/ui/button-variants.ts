// src/components/ui/button-variants.ts
import { cva } from "class-variance-authority";

export const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-full active:scale-[0.97] ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 disabled:active:scale-100 transition-all",
  {
    variants: {
      variant: {
        // Default: NASUN 모노톤 스타일
        black: "bg-nasun-black/80 text-nasun-white hover:bg-nasun-black",

        // Default Reverse: NASUN 색상 반전 모노톤 스타일
        white: "bg-nasun-white  text-nasun-black hover:bg-nasun-white/80",

        // Scarlet: Solid red button
        scarlet: "bg-nasun-scarlet text-nasun-white hover:bg-nasun-scarlet/80",

        // Amber: Solid amber button (c1)
        c1: "bg-nasun-c1 text-nasun-black hover:bg-nasun-c1/80",

        // Sunshine: Solid yellow button (c2)
        c2: "bg-nasun-c2 text-nasun-black hover:bg-nasun-c2/80",

        // Mint: Solid mint button (c3)
        c3: "bg-nasun-c3 text-nasun-black hover:bg-nasun-c3/80",

        // Ocean: Solid ocean button (c4)
        c4: "bg-nasun-c4 text-nasun-white hover:bg-sky-700",

        //  (c5)
        c5: "bg-nasun-c5 text-nasun-white hover:bg-nasun-c5/80",

        // Coral: Solid coral button
        coral: "bg-nasun-coral text-nasun-white hover:bg-nasun-coral/80",

        // Green: Success button
        green: "bg-green-500 text-white hover:bg-green-600",

        // Gensol Red: Solid red button
        "gensol-red": "bg-nasun-gensol-red text-nasun-white hover:bg-nasun-gensol-red/80",

        // Outline Scarlet (투명 배경)
        outlineScarlet:
          "ring-1 ring-inset ring-nasun-scarlet bg-transparent text-nasun-scarlet hover:bg-nasun-scarlet/10",

        // Outline c1 (투명 배경)
        outlineC1:
          "ring-1 ring-inset ring-nasun-c1 bg-transparent text-nasun-c1 hover:bg-nasun-c1/10",

        // Outline c2 (투명 배경)
        outlineC2:
          "ring-1 ring-inset ring-nasun-c2 bg-transparent text-nasun-c2 hover:bg-nasun-c2/10",

        // Outline c3 (투명 배경)
        outlineC3:
          "ring-1 ring-inset ring-nasun-c3 bg-transparent text-nasun-c3 hover:bg-nasun-c3/10",

        // Outline c4 (투명 배경)
        outlineC4:
          "ring-1 ring-inset ring-nasun-c4 bg-transparent text-nasun-c4 hover:bg-nasun-c4/10",

        // Outline c5 (투명 배경)
        outlineC5:
          "ring-1 ring-inset ring-nasun-c5 bg-transparent text-nasun-c5 hover:bg-nasun-c5/10",

        // Outline Coral (투명 배경)
        outlineCoral:
          "ring-1 ring-inset ring-nasun-coral bg-transparent text-nasun-coral hover:bg-nasun-coral/10",

        // Outline Gensol Red (투명 배경)
        outlineGensolRed:
          "ring-1 ring-inset ring-nasun-gensol-red bg-transparent text-nasun-gensol-red hover:bg-nasun-gensol-red/10",

        // Filled Outline Scarlet (연한 배경색)
        filledOutlineScarlet:
          "ring-1 ring-inset ring-nasun-scarlet bg-nasun-scarlet/10 text-nasun-scarlet hover:bg-transparent",

        // Filled Outline c1 (연한 배경색)
        filledOutlineC1:
          "ring-1 ring-inset ring-nasun-c1 bg-nasun-c1/10 text-nasun-c1 hover:bg-transparent",

        // Filled Outline c2 (연한 배경색)
        filledOutlineC2:
          "ring-1 ring-inset ring-nasun-c2 bg-nasun-c2/10 text-nasun-c2 hover:bg-transparent",

        // Filled Outline c3 (연한 배경색)
        filledOutlineC3:
          "ring-1 ring-inset ring-nasun-c3 bg-nasun-c3/10 text-nasun-c3 hover:bg-transparent",

        // Filled Outline c4 (연한 배경색)
        filledOutlineC4:
          "ring-1 ring-inset ring-nasun-c4 bg-nasun-c4/10 text-nasun-c4 hover:bg-transparent",

        // Filled Outline c5 (연한 배경색)
        filledOutlineC5:
          "ring-1 ring-inset ring-nasun-c5 bg-nasun-c5/10 text-nasun-c5 hover:bg-transparent",

        // Filled Outline Coral (연한 배경색)
        filledOutlineCoral:
          "ring-1 ring-inset ring-nasun-coral bg-nasun-coral/10 text-nasun-coral hover:bg-transparent",

        // Filled Outline Gensol Red (연한 배경색)
        filledOutlineGensolRed:
          "ring-1 ring-inset ring-nasun-gensol-red bg-nasun-gensol-red/10 text-nasun-gensol-red hover:bg-transparent",

        // Ghost: 기존 유지
        ghost: "text-nasun-white hover:bg-nasun-c1/20",

        // Link
        link: "text-nasun-white/80 underline-offset-4 underline hover:text-white ",

        // Action: (어두운 배경용)
        //  action:
        //    "bg-nasun-c1/20 hover:bg-nasun-c1/10 text-nasun-white hover:text-nasun-c1 capitalize",

        // Action Dark:  (밝은 배경용)
        //  actionDark: "bg-nasun-c4/70 hover:bg-nasun-c5/30 text-black capitalize",

        // Destructive: 위험한 동작용 빨간색 버튼 (Unlink, Delete 등)
        destructive:
          "ring-1 ring-inset ring-red-500 bg-red-500/10 text-red-500 hover:bg-transparent",
      },
      size: {
        xs: "text-xs px-5 py-1",
        sm: "text-xs lg:text-sm px-5 md:px-7 lg:px-9 py-1",
        default: "text-xs lg:text-sm px-6 md:px-8 lg:px-10 py-1 ",
        md: "text-sm lg:text-base px-7 md:px-9 lg:px-11 py-1 lg:py-1.5",
        lg: "text-base lg:text-lg  px-8 md:px-10 lg:px-12 py-1  ",
        xl: "text-lg lg:text-xl px-9 md:px-11 lg:px-13 py-1 lg:py-1.5",
        "2xl": "text-lg lg:text-xl px-11 md:px-13 lg:px-15 py-1 lg:py-1.5",
        hero: "text-xl lg:text-2xl px-12 md:px-13 lg:px-14 py-1.5 lg:py-2 tracking-wider",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "c1",
      size: "default",
    },
  },
);
