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
    },
  },
  plugins: [require("@tailwindcss/typography")],
};
