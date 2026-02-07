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
        // Brand title font (Pirulen via Adobe Fonts) - for "PADO" logo and emphasis
        'brand': ['pirulen', 'sans-serif'],
        // Default UI font (Rubik)
        'sans': ['Rubik', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        // Trading typography scale — bumped 1-2px from original for readability
        // Use xl: breakpoint variants in components for desktop scaling
        'trading-xs': ['11px', { lineHeight: '16px' }],
        'trading-sm': ['12px', { lineHeight: '16px' }],
        'trading-lg': ['13px', { lineHeight: '18px' }],
        'trading-xl': ['16px', { lineHeight: '22px' }],
      },
      keyframes: {
        'flash-buy': {
          '0%': { backgroundColor: 'rgba(34, 197, 94, 0.25)' },
          '100%': { backgroundColor: 'transparent' },
        },
        'flash-sell': {
          '0%': { backgroundColor: 'rgba(239, 68, 68, 0.25)' },
          '100%': { backgroundColor: 'transparent' },
        },
        'pulse-up': {
          '0%': { backgroundColor: 'rgba(34, 197, 94, 0.2)' },
          '100%': { backgroundColor: 'transparent' },
        },
        'pulse-down': {
          '0%': { backgroundColor: 'rgba(239, 68, 68, 0.2)' },
          '100%': { backgroundColor: 'transparent' },
        },
      },
      animation: {
        'flash-buy': 'flash-buy 1s ease-out',
        'flash-sell': 'flash-sell 1s ease-out',
        'pulse-up': 'pulse-up 0.5s ease-out',
        'pulse-down': 'pulse-down 0.5s ease-out',
      },
      colors: {
        // Pado brand colors (Teal → Mint/Lime gradient)
        'pado': {
          1: '#1a8cbc',  // Primary - deep teal
          2: '#3bb9d8',  // Secondary - bright teal
          3: '#5ee1e4',  // Accent - cyan
          4: '#86f3b7',  // Highlight - mint
          5: '#d2f6a2',  // Light - lime
        },
        // Pado custom palette (dark navy → light gray-blue)
        pd0: '#0b1120',   // Dark mode page background (derived from pd1 hue)
        'pd0s': '#131c2b', // Dark mode surface/card (derived from pd1 hue)
        pd1: '#1f3a61',   // Darkest navy blue
        pd2: '#3a5f78',   // Dark teal blue
        pd3: '#7d9dbf',   // Medium steel blue
        pd4: '#aac9d5',   // Light blue
        pd5: '#e1e5ea',   // Very light blue-gray
        // Theme-aware colors using CSS variables
        'theme-bg-primary': 'var(--color-bg-primary)',
        'theme-bg-secondary': 'var(--color-bg-secondary)',
        'theme-bg-tertiary': 'var(--color-bg-tertiary)',
        'theme-text-primary': 'var(--color-text-primary)',
        'theme-text-secondary': 'var(--color-text-secondary)',
        'theme-text-muted': 'var(--color-text-muted)',
        'theme-border': 'var(--color-border)',
        'theme-accent': 'var(--color-accent)',
        'theme-success': 'var(--color-success)',
        'theme-error': 'var(--color-error)',
        'theme-warning': 'var(--color-warning)',
        // Trading-specific colors (subtle bid/ask)
        'trading-bid': 'var(--color-bid)',
        'trading-bid-muted': 'var(--color-bid-muted)',
        'trading-bid-bg': 'var(--color-bid-bg)',
        'trading-ask': 'var(--color-ask)',
        'trading-ask-muted': 'var(--color-ask-muted)',
        'trading-ask-bg': 'var(--color-ask-bg)',
        // Toggle switch
        'theme-toggle-off': 'var(--color-toggle-off)',
      },
    },
  },
  plugins: [],
};
