/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    fontFamily: {
      archivo: ['"archivo"', "sans-serif"],
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
      animation: {
        fadeInUp: "fadeInUp 1s ease-out forwards",
        fadeIn: "fadeIn 1.5s ease-in-out forwards",
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
      fontWeight: {
        light: 300,
        normal: 400,
        medium: 500,
        semibold: 600,
        bold: 700,
        extrabold: 800,
      },
      maxWidth: {
        "8xl": "1440px",
        "9xl": "1920px",
        "screen-3xl": "1920px",
      },
      fontFamily: {
        sans: ["var(--default-font-family)"], // Radix의 폰트 사용
        heading: ["var(--heading-font-family)"],
      },
      // transitionDuration 확장
      transitionDuration: {
        1500: "1500ms",
      },
      // 폰트 로딩이 완료되면 자동으로 적용되도록 설정
      transitionProperty: {
        font: "font-family",
      },
      filter: {
        "saturate-80": "saturate(80%)",
        "saturate-100": "saturate(100%)",
      },
      colors: {
        // CSS 변수 기반 색상 시스템
        "sf-blue": "#2eacd6",
        "sf-yellow": "#ffd64f",
        "sf-red": "#d52933",
        "sf-darkred": "#b22432",
        "sf-orange": "#f05340",
        "sf-green": "#6ac17c",
        "sf-darkblue": "#2b3856",
        "sf-purple": "#7e1956",
        "sf-gray": "#7f8c8d",
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
      // Radix의 폰트 변수 오버라이드 방지
      variantPrefix: "rdx",
    }),
  ],
}
