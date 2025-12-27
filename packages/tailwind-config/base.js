const colors = require("./colors");

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  theme: {
    fontFamily: {
      rubik: ['"rubik"', "sans-serif"],
      archivo: ['"archivo"', "sans-serif"],
      rajdhani: ['"rajdhani"', "sans-serif"],
      changeling: ['"changeling-neo"', "sans-serif"],
      eurostile: ['"eurostile-extended"', "sans-serif"],
      founders: ['"Founders Grotesk"', "sans-serif"],
      pirulen: ['"pirulen"', "sans-serif"],
    },
    container: {
      center: true,
    },
    extend: {
      colors,
      backdropBlur: {
        sm: "4px",
        DEFAULT: "6px",
        md: "8px",
      },
      backdropBrightness: {
        80: ".8",
      },
      animation: {
        fadeInUp: "fadeInUp 1s ease-out forwards",
        "fade-in": "fadeIn 0.8s ease-out forwards",
        fadeIn: "fadeIn 0.8s ease-out forwards",
      },
      keyframes: {
        fadeInUp: {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
      },
      borderWidth: {
        1: "1px",
        2: "2px",
        3: "3px",
        4: "4px",
        5: "5px",
      },
      borderRadius: {
        "4xl": "2rem",
        "5xl": "2.5rem",
      },
      fontWeight: {
        light: 300,
        normal: 400,
        medium: 500,
        semibold: 600,
        bold: 700,
        extrabold: 800,
      },
      filter: {
        "saturate-80": "saturate(80%)",
        "saturate-100": "saturate(100%)",
      },
      maxWidth: {
        "8xl": "1440px",
        "9xl": "1920px",
      },
      screens: {
        nav: "1090px",
        xlg: "1160px",
        xl: "1350px",
      },
      transitionDuration: {
        1500: "1500ms",
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
      },
    },
  },
};
