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
        // Baram brand palette (ㅂㅏㄹㅏㅁ → br)
        'br': {
          1: '#a7d7bf', // Mint green
          2: '#a6c9e2', // Light blue
          3: '#d1c9e8', // Light lavender
          4: '#b2e2b1', // Light green
          5: '#e4f1df', // Pale green
          // Darkened variants (~40% darker, for dark backgrounds)
          '1d': '#5a9e7d',
          '2d': '#5a8fad',
          '3d': '#8a7db8',
          '4d': '#5e9e5c',
          '5d': '#8fbf85',
          // Text-safe variants (WCAG AA contrast on white)
          '1t': '#3d7a5a',
          '2t': '#3a6d8a',
          '3t': '#6a5d96',
          '4t': '#3d7a3c',
          '5t': '#5a8a50',
        },
      },
    },
  },
  plugins: [],
};
