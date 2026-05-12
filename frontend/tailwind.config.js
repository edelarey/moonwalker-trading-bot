/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        profit: '#22c55e',
        loss: '#ef4444',
        warning: '#f59e0b',
      },
    },
  },
  plugins: [require('daisyui'), require('@tailwindcss/forms')],
  daisyui: {
    themes: ['night', 'light'],
    defaultTheme: 'night',
    darkTheme: 'night',
  },
}
