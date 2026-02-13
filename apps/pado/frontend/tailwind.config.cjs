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
        // Trading typography scale — aligned with industry standard (Binance, Bybit, OKX)
        // Use xl: breakpoint variants in components for desktop scaling
        'trading-xs': ['12px', { lineHeight: '16px' }],
        'trading-sm': ['13px', { lineHeight: '18px' }],
        'trading-lg': ['14px', { lineHeight: '20px' }],
        'trading-xl': ['18px', { lineHeight: '24px' }],
        'trading-2xl': ['22px', { lineHeight: '28px' }],
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
        'fill-flash-buy': {
          '0%': { backgroundColor: 'rgba(34, 197, 94, 0.45)', boxShadow: '0 0 8px rgba(34, 197, 94, 0.3)' },
          '50%': { backgroundColor: 'rgba(34, 197, 94, 0.2)' },
          '100%': { backgroundColor: 'transparent', boxShadow: 'none' },
        },
        'fill-flash-sell': {
          '0%': { backgroundColor: 'rgba(239, 68, 68, 0.45)', boxShadow: '0 0 8px rgba(239, 68, 68, 0.3)' },
          '50%': { backgroundColor: 'rgba(239, 68, 68, 0.2)' },
          '100%': { backgroundColor: 'transparent', boxShadow: 'none' },
        },
        'checkmark-draw': {
          '0%': { strokeDashoffset: '24' },
          '100%': { strokeDashoffset: '0' },
        },
      },
      animation: {
        'flash-buy': 'flash-buy 1s ease-out',
        'flash-sell': 'flash-sell 1s ease-out',
        'pulse-up': 'pulse-up 0.5s ease-out',
        'pulse-down': 'pulse-down 0.5s ease-out',
        'fill-flash-buy': 'fill-flash-buy 2s ease-out',
        'fill-flash-sell': 'fill-flash-sell 2s ease-out',
        'checkmark-draw': 'checkmark-draw 0.4s ease-out forwards',
      },
      colors: {
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
