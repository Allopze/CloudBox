/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          50: 'hsl(var(--color-primary-50, 0 84% 97%) / <alpha-value>)',
          100: 'hsl(var(--color-primary-100, 0 84% 94%) / <alpha-value>)',
          200: 'hsl(var(--color-primary-200, 0 84% 86%) / <alpha-value>)',
          300: 'hsl(var(--color-primary-300, 0 84% 77%) / <alpha-value>)',
          400: 'hsl(var(--color-primary-400, 0 84% 65%) / <alpha-value>)',
          500: 'hsl(var(--color-primary-500, 0 84% 55%) / <alpha-value>)',
          600: 'hsl(var(--color-primary-600, 0 84% 45%) / <alpha-value>)',
          700: 'hsl(var(--color-primary-700, 0 84% 38%) / <alpha-value>)',
          800: 'hsl(var(--color-primary-800, 0 84% 32%) / <alpha-value>)',
          900: 'hsl(var(--color-primary-900, 0 84% 26%) / <alpha-value>)',
          950: 'hsl(var(--color-primary-950, 0 84% 15%) / <alpha-value>)',
        },
        dark: {
          50: '#fafafa',
          100: '#f5f5f5',
          200: '#e5e5e5',
          300: '#d4d4d4',
          400: '#a3a3a3',
          500: '#737373',
          600: '#525252',
          700: '#404040',
          800: '#222222',
          900: '#121212',
          950: '#121212',
        },
      },
      animation: {
        'spin-slow': 'spin 3s linear infinite',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'shimmer': 'shimmer 2s ease-in-out infinite',
        'breathing': 'breathing 2s ease-in-out infinite',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
        breathing: {
          '0%, 100%': { opacity: '0.6', transform: 'scale(1)' },
          '50%': { opacity: '1', transform: 'scale(1.02)' },
        },
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}
