// frontend/src/shared/theme/themes.js
// Define theme properties here. Start simple.
// These aren't directly used by Tailwind classes but can be used
// for JS logic or potentially extending the Tailwind theme later.
export const lightTheme = {
    name: 'light',
    background: 'bg-gray-100', // Tailwind class for main background
    text: 'text-gray-900',       // Tailwind class for default text
    cardBg: 'bg-white',
    primaryButton: 'bg-blue-600 hover:bg-blue-700 text-white',
    // ... other theme-specific settings or classes
};

export const darkTheme = {
    name: 'dark',
    background: 'bg-gray-900',
    text: 'text-gray-100',
    cardBg: 'bg-gray-800',
    primaryButton: 'bg-blue-500 hover:bg-blue-600 text-white',
    // ... other theme-specific settings or classes
};

// Add more themes like 'neuro-blue' later