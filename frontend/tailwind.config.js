// frontend/tailwind.config.js
const defaultTheme = require('tailwindcss/defaultTheme'); // Import default theme

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
       // Set 'Inter' as the default sans-serif font
      fontFamily: {
        sans: ['Inter', ...defaultTheme.fontFamily.sans],
      },
      // Optional: Define specific color names if needed,
      // but we'll mostly use default blue/gray for simplicity now.
      // colors: {
      //   primary: defaultTheme.colors.blue, // Example using blue
      //   neutral: defaultTheme.colors.gray, // Example using gray
      // }
       boxShadow: { // Add softer shadow options if desired
        'soft-sm': '0 1px 2px 0 rgba(0, 0, 0, 0.03), 0 1px 3px 0 rgba(0, 0, 0, 0.03)',
        'soft-md': '0 4px 6px -1px rgba(0, 0, 0, 0.04), 0 2px 4px -1px rgba(0, 0, 0, 0.04)',
        'soft-lg': '0 10px 15px -3px rgba(0, 0, 0, 0.05), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
      }
    },
  },
  plugins: [
     require('@tailwindcss/forms'), // Add official forms plugin for better default input styles
     require('@tailwindcss/typography'), // Add official forms plugin for better default input styles
  ],
}