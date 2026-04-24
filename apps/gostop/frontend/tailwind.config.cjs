/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
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
      },
      animation: {
        'shimmer': 'shimmer 3s linear infinite',
        'pulse-gold': 'pulse-gold 3s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
