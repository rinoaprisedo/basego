/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      colors: {
        primary: {
          DEFAULT: '#2563EB',
          dark: '#1D4ED8',
        },
        sidebar: {
          bg: '#0F172A',
          text: '#94A3B8',
          active: '#2563EB',
        },
        surface: {
          bg: '#F8FAFC',
          card: '#FFFFFF',
          border: '#E2E8F0',
        },
        text: {
          primary: '#0F172A',
          secondary: '#64748B',
        },
        danger: '#EF4444',
        success: '#22C55E',
        warning: '#F59E0B',
      },
    },
  },
  plugins: [],
}
