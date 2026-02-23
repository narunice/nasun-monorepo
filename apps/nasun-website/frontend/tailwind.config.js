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
    container: {
      screens: {},
    },
    extend: {
      translate: {
        4: "1rem",
        12: "3rem",
        20: "5rem",
        24: "6rem",
      },
      keyframes: {
        "marquee-scroll": {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
      },
      animation: {
        marquee: "marquee-scroll 28s linear infinite",
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};
