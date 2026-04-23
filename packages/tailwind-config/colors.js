/** @type {import('tailwindcss').Config['theme']['colors']} */
module.exports = {
  background: "var(--background)",
  text: "var(--text)",

  // ============================================================
  // NASUN Global Palette
  // ============================================================
  nasun: {
    // Base backgrounds and text
    white: "#faf7f4", // Default background (warm white)
    black: "#191615", // Default text (warm dark)
    gray: "#242424", // Dark gray for UI components

    // Point colors (brand accents)
    scarlet: "#fa3102", // Main point color
    coral: "#FF4D4D", // Sub point color

    // New color palette
    c1: "#f9a824", // color-1 (yellow/gold)
    c2: "#f6e5a2", // color-2 (light yellow)
    c3: "#94e1d3", // color-3 (teal/cyan)
    c4: "#448BBB", // color-4 (blue)
    c5: "#2A64C5", // color-5 (deep blue)
    c6: "#1b374a", // color-6 (dark blue/navy)
    c7: "#B3E0FF", // color-7 (light blue)

    // Nasun Network palette
    nw1: "#6697b7",
    nw2: "#4c7d9a",
    nw3: "#3e5c7a",
    nw4: "#afc3cf",
    nw5: "#e6e6e6",

    // Gensol colors
    "gensol-red": "#d52933",
    "gensol-shade": "#b22432",
  },

  // ============================================================
  // Baram Brand Palette (br-1 ~ br-5)
  // ============================================================
  br: {
    1: "#a7d7bf", // Mint green
    2: "#a6c9e2", // Light blue
    3: "#d1c9e8", // Light lavender
    4: "#b2e2b1", // Light green
    5: "#e4f1df", // Pale green
    // Darkened variants (~40% darker, for dark backgrounds)
    "1d": "#5a9e7d",
    "2d": "#5a8fad",
    "3d": "#8a7db8",
    "4d": "#5e9e5c",
    "5d": "#8fbf85",
    // Text-safe variants (WCAG AA contrast on white)
    "1t": "#3d7a5a",
    "2t": "#3a6d8a",
    "3t": "#6a5d96",
    "4t": "#3d7a3c",
    "5t": "#5a8a50",
  },

  // ============================================================
  // Pado Brand Palette
  // ============================================================
  pado: {
    1: "#1a8cbc", // Primary - deep teal
    2: "#3bb9d8", // Secondary - bright teal
    3: "#5ee1e4", // Accent - cyan
    4: "#86f3b7", // Highlight - mint
    5: "#d2f6a2", // Light - lime
    violet: "#7C5CFF", // Accent - electric violet (primary point)
    lavender: "#C9A7FF", // Accent - soft lavender (secondary point)
  },
  // Pado custom palette (dark navy -> light gray-blue)
  pd0: "#0b1120",
  "pd0s": "#131c2b",
  pd1: "#1f3a61",
  pd2: "#3a5f78",
  pd3: "#7d9dbf",
  pd4: "#aac9d5",
  pd5: "#e1e5ea",

  // ============================================================
  // GenSol Sci-Fi Palette (sf-*)
  // ============================================================
  "sf-blue": "#2eacd6",
  "sf-yellow": "#ffd64f",
  "sf-red": "#d52933",
  "sf-darkred": "#b22432",
  "sf-orange": "#f05340",
  "sf-green": "#6ac17c",
  "sf-darkblue": "#2b3856",
  "sf-purple": "#7e1956",
  "sf-gray": "#7f8c8d",

  // ============================================================
  // Network Explorer Palette (ne*)
  // ============================================================
  ne0: "#0e1219",
  "ne0s": "#1a2332",
  ne1: "#496c9c",
  ne2: "#7d9dbf",
  ne3: "#a2c5d8",
  ne4: "#cee2e8",
  ne5: "#f5f5f5",

  // ============================================================
  // uju Dashboard Palette
  // ============================================================
  uju: {
    bg:        '#0D1117',  // page background (deep dark)
    card:      '#161B27',  // card background (elevated dark)
    border:    '#252D42',  // border (subtle blue-tinted)
    primary:   '#F1F5F9',  // primary text (bright white)
    secondary: '#8B9CB3',  // secondary text (explicit, no opacity)
  },
};
