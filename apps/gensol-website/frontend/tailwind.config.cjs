const baseConfig = require("@nasun/tailwind-config");

/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [baseConfig],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "../../../packages/wallet-ui/src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    fontFamily: {
      // Gensol-specific fonts (override base)
      ddt: ['"ddt"', "sans-serif"],
      pirulen: ['"pirulen"', "sans-serif"],
      rajdhani: ['"rajdhani"', "sans-serif"],
      rubik: ['"Rubik"', "sans-serif"],
    },
    container: {
      center: true,
      screens: {},
    },
    extend: {
      maxWidth: {
        "screen-3xl": "1920px",
      },
      fontFamily: {
        sans: ["var(--default-font-family)"],
        heading: ["var(--heading-font-family)"],
      },
      transitionProperty: {
        font: "font-family",
      },
      colors: {
        // Gensol Sci-Fi colors
        "sf-blue": "#2eacd6",
        "sf-yellow": "#ffd64f",
        "sf-red": "#d52933",
        "sf-darkred": "#b22432",
        "sf-orange": "#f05340",
        "sf-green": "#6ac17c",
        "sf-darkblue": "#2b3856",
        "sf-purple": "#7e1956",
        "sf-gray": "#7f8c8d",
        // Radix UI variables
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: "hsl(var(--secondary))",
        button: {
          bg: "hsl(var(--button-bg))",
          text: "hsl(var(--button-text))",
          hover: "hsl(var(--button-hover))",
          hoverText: "hsl(var(--button-hover-text))",
        },
        "custom-red": "rgba(178, 36, 50, 0.8)",
      },
    },
  },
  plugins: [
    require("@tailwindcss/typography"),
    require("tailwindcss-radix")({
      variantPrefix: "rdx",
    }),
  ],
};
