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
        // Scratch card result animations
        'scratch-drumroll': {
          '0%, 100%': { transform: 'translateX(0)' },
          '10%': { transform: 'translateX(-6px) rotate(-1deg)' },
          '20%': { transform: 'translateX(6px) rotate(1deg)' },
          '30%': { transform: 'translateX(-5px) rotate(-0.5deg)' },
          '40%': { transform: 'translateX(5px) rotate(0.5deg)' },
          '50%': { transform: 'translateX(-4px)' },
          '60%': { transform: 'translateX(4px)' },
          '70%': { transform: 'translateX(-3px)' },
          '80%': { transform: 'translateX(3px)' },
          '90%': { transform: 'translateX(-1px)' },
        },
        'scratch-bounce': {
          '0%': { transform: 'scale(0)', opacity: '0' },
          '50%': { transform: 'scale(1.15)' },
          '70%': { transform: 'scale(0.95)' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        'scratch-slam': {
          '0%': { transform: 'scale(2.5) translateY(-20px)', opacity: '0' },
          '60%': { transform: 'scale(0.95) translateY(2px)', opacity: '1' },
          '80%': { transform: 'scale(1.02)' },
          '100%': { transform: 'scale(1) translateY(0)' },
        },
        'scratch-flash': {
          '0%': { opacity: '0.8' },
          '100%': { opacity: '0' },
        },
        'scratch-golden-glow': {
          '0%': { transform: 'scale(0)', opacity: '0' },
          '50%': { opacity: '1' },
          '100%': { transform: 'scale(1)', opacity: '0.8' },
        },
        'scratch-typewriter-char': {
          '0%': { opacity: '0', transform: 'scale(1.5)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'scratch-text-fade': {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'scratch-card-shake': {
          '0%, 100%': { transform: 'translateX(0)' },
          '25%': { transform: 'translateX(-3px)' },
          '75%': { transform: 'translateX(3px)' },
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
        // Scratch card animations
        'scratch-drumroll': 'scratch-drumroll 0.6s ease-out',
        'scratch-bounce': 'scratch-bounce 0.4s ease-out forwards',
        'scratch-slam': 'scratch-slam 0.45s ease-out forwards',
        'scratch-flash': 'scratch-flash 0.15s ease-out forwards',
        'scratch-golden-glow': 'scratch-golden-glow 0.7s ease-out forwards',
        'scratch-typewriter-char': 'scratch-typewriter-char 0.1s ease-out forwards',
        'scratch-text-fade': 'scratch-text-fade 0.4s ease-out forwards',
        'scratch-card-shake': 'scratch-card-shake 0.1s ease-out 3',
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
        'theme-accent-hover': 'var(--color-accent-hover)',
        'theme-accent-active': 'var(--color-accent-active)',
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
      boxShadow: {
        'panel': '0 1px 3px var(--color-panel-shadow)',
        'panel-hover': '0 2px 8px var(--color-panel-shadow)',
        'glow': 'var(--shadow-glow)',
      },
    },
  },
  plugins: [],
};
