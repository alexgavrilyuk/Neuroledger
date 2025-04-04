// frontend/tailwind.config.js
const defaultTheme = require('tailwindcss/defaultTheme'); // Import default theme
const colors = require('tailwindcss/colors'); // Import Tailwind colors

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
        sans: ['Inter var', 'Inter', ...defaultTheme.fontFamily.sans],
      },
      // Custom colors that extend Tailwind's defaults
      colors: {
        // Add custom gray-850 for dark mode layering
        gray: {
          ...colors.gray,
          '750': '#242937',
          '850': '#131825',
        },
        // Add more subtle accent colors if needed
        // 'primary': colors.blue, // Using standard blue
      },
      // Custom shadow variations for more refined elevation
      boxShadow: {
        'soft-sm': '0 1px 2px rgba(0, 0, 0, 0.02), 0 1px 3px rgba(0, 0, 0, 0.03)',
        'soft-md': '0 4px 6px rgba(0, 0, 0, 0.03), 0 2px 4px rgba(0, 0, 0, 0.03)',
        'soft-lg': '0 10px 15px rgba(0, 0, 0, 0.04), 0 4px 6px rgba(0, 0, 0, 0.02)',
        'soft-xl': '0 15px 25px rgba(0, 0, 0, 0.05), 0 5px 10px rgba(0, 0, 0, 0.03)',
        // Dark mode variations
        'soft-dark-sm': '0 1px 2px rgba(0, 0, 0, 0.1), 0 1px 3px rgba(0, 0, 0, 0.15)',
        'soft-dark-md': '0 4px 6px rgba(0, 0, 0, 0.15), 0 2px 4px rgba(0, 0, 0, 0.2)',
        'soft-dark-lg': '0 10px 15px rgba(0, 0, 0, 0.2), 0 4px 6px rgba(0, 0, 0, 0.25)',
        'soft-dark-xl': '0 15px 25px rgba(0, 0, 0, 0.25), 0 5px 10px rgba(0, 0, 0, 0.3)',
      },
      // Animation durations
      transitionDuration: {
        '250': '250ms',
        '350': '350ms',
      },
      // Animation timing functions
      transitionTimingFunction: {
        'in-out-soft': 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
      // Additional border radius
      borderRadius: {
        'xl': '1rem',
        '2xl': '1.5rem',
      },
      // Background opacity variations
      backgroundOpacity: {
        '15': '0.15',
        '85': '0.85',
        '95': '0.95',
      },
      // Add backdrop blur values
      backdropBlur: {
        'xs': '2px',
      },
      // Scale transformations for hover/focus effects
      scale: {
        '102': '1.02',
        '98': '0.98',
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms')({
      strategy: 'class', // Use a class strategy for more control
    }),
    require('@tailwindcss/typography'), // For rich text content

    // Add a custom plugin for additional utilities
    function({ addUtilities }) {
      const newUtilities = {
        // Glass effect for card-like elements
        '.bg-glass-light': {
          'background': 'rgba(255, 255, 255, 0.7)',
          'backdrop-filter': 'blur(12px)',
          'border': '1px solid rgba(255, 255, 255, 0.125)',
        },
        '.bg-glass-dark': {
          'background': 'rgba(17, 24, 39, 0.75)',
          'backdrop-filter': 'blur(12px)',
          'border': '1px solid rgba(255, 255, 255, 0.08)',
        },
        // Custom scrollbar styling
        '.custom-scrollbar': {
          '&::-webkit-scrollbar': {
            'width': '8px',
            'height': '8px',
          },
          '&::-webkit-scrollbar-track': {
            'background': 'transparent',
          },
          '&::-webkit-scrollbar-thumb': {
            'background': 'rgba(0, 0, 0, 0.15)',
            'border-radius': '4px',
          },
          '&::-webkit-scrollbar-thumb:hover': {
            'background': 'rgba(0, 0, 0, 0.25)',
          },
          '&.dark::-webkit-scrollbar-thumb': {
            'background': 'rgba(255, 255, 255, 0.15)',
          },
          '&.dark::-webkit-scrollbar-thumb:hover': {
            'background': 'rgba(255, 255, 255, 0.25)',
          },
        },
        // Truncated text with ellipsis
        '.truncate-2-lines': {
          'display': '-webkit-box',
          '-webkit-line-clamp': '2',
          '-webkit-box-orient': 'vertical',
          'overflow': 'hidden',
        },
        // Drop cap (for first letter in paragraphs)
        '.drop-cap:first-letter': {
          'float': 'left',
          'font-size': '3em',
          'line-height': '0.8',
          'padding-right': '0.1em',
        },
      };
      addUtilities(newUtilities, ['responsive', 'hover', 'dark']);
    },
  ],
}