const baseConfig = require('@nasun/tailwind-config')

/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [baseConfig],
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
    '../../../packages/wallet-ui/src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        'display': ['"Playfair Display"', 'Georgia', 'serif'],
        'sans': ['Inter', 'system-ui', 'sans-serif'],
        'mono': ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        // Luxury dark palette — Vegas high-roller
        ink: {
          950: '#07070a',
          900: '#0b0b10',
          800: '#141420',
          700: '#1c1c2b',
          600: '#2a2a3a',
          500: '#3a3a4c',
        },
        gold: {
          50: '#fdf6e3',
          100: '#f8e8b6',
          200: '#f2d67b',
          300: '#e8c158',
          400: '#d4af37', // signature rich gold
          500: '#b68d22',
          600: '#8a6a18',
          700: '#5d4710',
        },
        emerald: {
          500: '#10b981',
          600: '#059669',
          700: '#047857',
          800: '#065f46',
          900: '#064e3b',
          950: '#022c22',
        },
        crimson: {
          500: '#dc2626',
          600: '#b91c1c',
          700: '#991b1b',
        },
      },
      boxShadow: {
        'gold-glow': '0 0 20px -5px rgba(212, 175, 55, 0.4), 0 0 40px -20px rgba(212, 175, 55, 0.3)',
        'gold-glow-lg': '0 0 30px -5px rgba(212, 175, 55, 0.5), 0 0 60px -20px rgba(212, 175, 55, 0.4)',
        'emerald-glow': '0 0 20px -5px rgba(16, 185, 129, 0.4)',
        'panel': '0 1px 3px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(212, 175, 55, 0.08) inset',
      },
      backgroundImage: {
        'gold-gradient': 'linear-gradient(135deg, #f2d67b 0%, #d4af37 50%, #b68d22 100%)',
        'luxury-panel': 'linear-gradient(180deg, rgba(20, 20, 32, 0.9) 0%, rgba(11, 11, 16, 0.95) 100%)',
      },
      keyframes: {
        'shimmer': {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'pulse-gold': {
          '0%, 100%': { boxShadow: '0 0 20px -5px rgba(212, 175, 55, 0.3)' },
          '50%': { boxShadow: '0 0 40px -5px rgba(212, 175, 55, 0.6)' },
        },
        // Tiered win celebration keyframes (ported from pado scratchcard)
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
        // Number Match slam variant (ported from pado numbermatch)
        'nm-win-slam': {
          '0%': { transform: 'scale(3) translateY(-10px)', opacity: '0' },
          '50%': { transform: 'scale(0.9) translateY(2px)', opacity: '1' },
          '70%': { transform: 'scale(1.05)' },
          '100%': { transform: 'scale(1) translateY(0)' },
        },
        'nm-win-glow': {
          '0%, 100%': { boxShadow: '0 0 20px rgba(212, 175, 55, 0.4), 0 0 40px rgba(212, 175, 55, 0.1)' },
          '50%': { boxShadow: '0 0 30px rgba(212, 175, 55, 0.7), 0 0 60px rgba(212, 175, 55, 0.3)' },
        },
        'nm-win-flash': {
          '0%': { opacity: '0.7' },
          '100%': { opacity: '0' },
        },
        // Jackpot luxury accents (gostop-specific)
        'gold-shimmer': {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'jackpot-sweep': {
          '0%': { transform: 'translateX(-100%) skewX(-12deg)', opacity: '0' },
          '50%': { opacity: '0.6' },
          '100%': { transform: 'translateX(100%) skewX(-12deg)', opacity: '0' },
        },
      },
      animation: {
        'shimmer': 'shimmer 3s linear infinite',
        'pulse-gold': 'pulse-gold 3s ease-in-out infinite',
        // Celebration animations
        'scratch-drumroll': 'scratch-drumroll 0.6s ease-out',
        'scratch-bounce': 'scratch-bounce 0.4s ease-out forwards',
        'scratch-slam': 'scratch-slam 0.45s ease-out forwards',
        'scratch-flash': 'scratch-flash 0.15s ease-out forwards',
        'scratch-golden-glow': 'scratch-golden-glow 0.7s ease-out forwards',
        'scratch-typewriter-char': 'scratch-typewriter-char 0.1s ease-out forwards',
        'scratch-text-fade': 'scratch-text-fade 0.4s ease-out forwards',
        'scratch-card-shake': 'scratch-card-shake 0.1s ease-out 3',
        'nm-win-slam': 'nm-win-slam 0.5s ease-out forwards',
        'nm-win-glow': 'nm-win-glow 1.5s ease-in-out infinite',
        'nm-win-flash': 'nm-win-flash 0.2s ease-out forwards',
        // Jackpot luxury (bounded duration; provider gates on mobile + reduced-motion)
        'gold-shimmer': 'gold-shimmer 4s linear 2',
        'jackpot-sweep': 'jackpot-sweep 1.2s ease-out forwards',
      },
    },
  },
  plugins: [],
}
