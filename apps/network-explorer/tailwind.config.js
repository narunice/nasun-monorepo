/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        text: "var(--text)",
        nasun: {
          // 기본 배경 및 텍스트
          white: "#faf7f4",
          black: "#191615",
          // 포인트 컬러 (브랜드 강조)
          scarlet: "#fa3102",
          coral: "#FF4D4D",
          // 색상 팔레트
          c1: "#f9a824",
          c2: "#f6e5a2",
          c3: "#94e1d3",
          c4: "#448BBB",
          c5: "#2A64C5",
          c6: "#1b374a",
        }
      }
    },
  },
  plugins: [],
}

