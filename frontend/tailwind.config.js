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
      // Add custom animations
      animation: {
        'fadeIn': 'fadeIn 0.5s ease-in-out',
        'slideInBottom': 'slideInBottom 0.5s ease-out',
        'pulse-slow': 'pulse-slow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'pulse-subtle': 'pulse-slow 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'blink': 'blink 1s step-end infinite',
        'typing': 'typing 1.5s steps(30, end)',
        'zoom-fade': 'zoom-fade 0.5s ease-out',
        'tool-appear': 'tool-appear 0.3s ease-out',
        'tool-disappear': 'tool-disappear 0.3s ease-out',
        'thinking-dot-1': 'thinking-dots 1.4s infinite 0.2s',
        'thinking-dot-2': 'thinking-dots 1.4s infinite 0.4s',
        'thinking-dot-3': 'thinking-dots 1.4s infinite 0.6s',
      },
      // Define keyframes for animations
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideInBottom: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'pulse-slow': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
        blink: {
          '0%': { opacity: 1 },
          '49%': { opacity: 1 },
          '50%': { opacity: 0 },
          '100%': { opacity: 0 },
        },
        typing: {
          '0%': { width: '0%' },
          '100%': { width: '100%' }
        },
        'zoom-fade': {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        'tool-appear': {
          '0%': { opacity: 0, transform: 'translateY(-10px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' }
        },
        'tool-disappear': {
          '0%': { transform: 'translateY(0)', opacity: '1' },
          '100%': { transform: 'translateY(10px)', opacity: '0' },
        },
        'thinking-dots': {
          '0%, 100%': { opacity: 0.2 },
          '50%': { opacity: 1 }
        },
      },
      // Add background patterns
      backgroundImage: {
        'grid-white': `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32' width='32' height='32' fill='none' stroke='rgb(255 255 255 / 0.05)'%3e%3cpath d='M0 .5H31.5V32'/%3e%3c/svg%3e")`,
        'grid-black': `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32' width='32' height='32' fill='none' stroke='rgb(0 0 0 / 0.05)'%3e%3cpath d='M0 .5H31.5V32'/%3e%3c/svg%3e")`,
        'gradient-subtle-light': 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
        'gradient-subtle-dark': 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
      },
      // Add blur radius values
      blur: {
        '4xl': '128px',
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
        // Add animation delay utility classes
        '.animation-delay-3000': {
          'animation-delay': '3000ms',
        },
        '.animation-delay-5000': {
          'animation-delay': '5000ms',
        },
        // Streaming code editor style
        '.streaming-code': {
          'position': 'relative',
          'border-left': '3px solid #3b82f6',
          'padding-left': '1rem',
          'margin-bottom': '1rem',
        },
        '.typewriter': {
          'overflow': 'hidden',
          'white-space': 'nowrap',
          'animation': 'typing 1.5s steps(40, end)',
        },
      };
      addUtilities(newUtilities, ['responsive', 'hover', 'dark']);
    },
  ],
}