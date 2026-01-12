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
        // Compact typography scale for trading UI
        'trading-xs': ['10px', { lineHeight: '14px' }],
        'trading-sm': ['11px', { lineHeight: '16px' }],
        'trading-base': ['12px', { lineHeight: '18px' }],
        'trading-md': ['13px', { lineHeight: '20px' }],
        'trading-lg': ['14px', { lineHeight: '20px' }],
        'trading-xl': ['18px', { lineHeight: '24px' }],
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
      },
    },
  },
  plugins: [],
};
