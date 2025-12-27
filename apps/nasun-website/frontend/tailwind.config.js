/** @type {import('tailwindcss').Config} */

module.exports = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    fontFamily: {
      rubik: ['"rubik", "sans-serif"'],
      archivo: ['"archivo"', "sans-serif"],
      rajdhani: ['"rajdhani"', "sans-serif"],
      changeling: ['"changeling-neo"', "sans-serif"],
      eurostile: ['"eurostile-extended"', "sans-serif"],
      founders: ['"Founders Grotesk"', "sans-serif"],
      pirulen: ['"pirulen"', "sans-serif"],
    },
    container: {
      center: true,
      screens: {},
    },
    extend: {
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
      },
      keyframes: {
        fadeInUp: {
          "0%": {
            opacity: "0",
            transform: "translateY(10px)",
          },
          "100%": {
            opacity: "1",
            transform: "translateY(0)",
          },
        },
        fadeIn: {
          "0%": {
            opacity: "0",
          },
          "100%": {
            opacity: "1",
          },
        },
      },
      translate: {
        4: "1rem", // 16px
        12: "3rem", // 48px
        20: "5rem", // 80px
        24: "6rem", // 96px
      },
      borderWidth: {
        1: "1px",
        2: "2px",
        3: "3px",
        4: "4px",
        5: "5px",
      },
      borderRadius: {
        "4xl": "2rem", // 32px
        "5xl": "2.5rem", // 40px
      },
      fontWeight: {
        light: 300,
        normal: 400,
        medium: 500,
        semibold: 600,
        bold: 700,
        extrabold: 800,
      },
      colors: {
        background: "var(--background)",
        text: "var(--text)",
        // NASUN 색상 팔레트 (2025 Color Scheme)
        nasun: {
          // 기본 배경 및 텍스트
          white: "#faf7f4", // 기본 배경 (따뜻한 화이트)
          black: "#191615", // 기본 텍스트 (따뜻한 다크)

          // 포인트 컬러 (브랜드 강조)
          scarlet: "#fa3102", // 메인 포인트 컬러
          coral: "#FF4D4D", // 서브 포인트 컬러

          // 새로운 색상 팔레트
          c1: "#f9a824", // color-1
          c2: "#f6e5a2", // color-2
          c3: "#94e1d3", // color-3
          c4: "#448BBB", // color-4
          c5: "#2A64C5", // color-5
          c6: "#1b374a", // color-6 (dark c4, OuterBox background)

          // Gensol colors
          "gensol-red": "#d52933", // Gensol main red
          "gensol-shade": "#b22432", // Gensol dark shade (OuterBox background)
        },
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
        nav: "1090px", // custom breakpoint for desktop/mobile navigation switch
        xlg: "1160px", // custom breakpoint for NasunTokenSection
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
  plugins: [require("@tailwindcss/typography")],
};
