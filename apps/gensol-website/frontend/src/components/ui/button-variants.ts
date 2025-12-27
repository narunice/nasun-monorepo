// src/components/ui/button-variants.ts
import { cva } from "class-variance-authority"

export const buttonVariants = cva(
  "transition-all inline-flex items-center justify-center rounded-md font-normal font-archivo transition-colors ring-offset-white dark:ring-offset-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 dark:focus-visible:ring-gray-600 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-gray-300 text-gray-900 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-800",
        destructive:
          "bg-red-600 text-white hover:bg-red-700 dark:bg-red-500 dark:text-white dark:hover:bg-red-600",
        outline:
          "border border-gray-300 bg-white hover:bg-gray-100 hover:text-black dark:border-gray-600 dark:bg-black dark:text-white dark:hover:bg-gray-800",
        secondary:
          "bg-gray-900 text-white hover:bg-gray-800 dark:bg-gray-100 dark:text-black dark:hover:bg-gray-200",
        ghost: "bg-transparent text-black hover:bg-gray-100 dark:text-white dark:hover:bg-gray-800",
        link: "text-black underline-offset-4 hover:underline dark:text-white",
        nasunline:
          "text-nasun-dark border border-[#e6c9ae] bg-transparent hover:bg-white hover:text-black dark:border-[#845733] dark:bg-transparent dark:text-nasun-light dark:hover:bg-black",
        chocolate:
          "bg-[#e79256] text-black hover:bg-nasun-orange dark:bg-[#60310e] dark:text-white dark:hover:bg-nasun-darkorange",
        latte:
          "bg-[#e6c9ae] text-gray-900 hover:bg-nasun-latte dark:bg-[#845733] dark:text-white dark:hover:bg-nasun-darklatte",
        whitelatte:
          "bg-[#e6c9ae] text-gray-900 hover:bg-[#ebd3be] dark:bg-[#845733] dark:text-white dark:hover:bg-[#694528]",
        "sf-red": "bg-sf-red/70 text-white/90 hover:bg-sf-darkred",
      },
      size: {
        default: "text-base px-4 py-2",
        sm: "text-sm rounded-md px-3 py-2",
        lg: "text-lg rounded-md px-8 py-3",
        xl: "text-xl rounded-md px-11 py-4",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)
