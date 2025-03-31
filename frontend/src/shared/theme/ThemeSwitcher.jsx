// frontend/src/shared/theme/ThemeSwitcher.jsx
// ** UPDATED FILE **
import React from 'react';
import { useTheme } from '../hooks/useTheme';
import { SunIcon, MoonIcon } from '@heroicons/react/24/outline'; // Use outline icons

const ThemeSwitcher = () => {
  const { themeName, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      type="button" // Explicit type
      className="p-1.5 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500 dark:focus-visible:ring-offset-gray-800"
      aria-label="Toggle theme"
    >
      {themeName === 'light' ? (
          <MoonIcon className="h-5 w-5" />
      ) : (
          <SunIcon className="h-5 w-5" />
       )}
    </button>
  );
};

export default ThemeSwitcher;