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
    extend: {
      fontFamily: {
        'sans': ['Rubik', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Baram brand colors (purple/violet gradient)
        'baram': {
          1: '#6366f1', // Primary - indigo
          2: '#8b5cf6', // Secondary - violet
          3: '#a78bfa', // Accent - light violet
          4: '#c4b5fd', // Highlight - lavender
          5: '#e0e7ff', // Light - pale indigo
        },
      },
    },
  },
  plugins: [],
};
