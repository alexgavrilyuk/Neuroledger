// frontend/src/shared/theme/ThemeSwitcher.jsx
// ** UPDATED FILE - Enhanced with animation and better styling **
import React from 'react';
import { useTheme } from '../hooks/useTheme';
import { SunIcon, MoonIcon } from '@heroicons/react/24/outline';
import { SunIcon as SunSolid, MoonIcon as MoonSolid } from '@heroicons/react/24/solid';

const ThemeSwitcher = () => {
  const { themeName, toggleTheme } = useTheme();
  const isDark = themeName === 'dark';

  return (
    <button
      onClick={toggleTheme}
      type="button"
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="
        relative overflow-hidden w-10 h-10 p-1.5 rounded-full
        text-gray-500 dark:text-gray-400
        hover:bg-gray-100 dark:hover:bg-gray-800
        focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50
        focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900
        transition-colors duration-200
      "
    >
      {/* Use the dynamic icons with transition effects */}
      <div className="relative w-full h-full">
        {/* Sun icon - visible in dark mode, transitions out in light mode */}
        <div
          className={`
            absolute inset-0 flex items-center justify-center
            transition-all duration-300 ease-spring
            ${isDark ? 'opacity-100 transform-none' : 'opacity-0 rotate-90 scale-50'}
          `}
        >
          <SunSolid className="h-5 w-5 text-amber-400" />
        </div>

        {/* Moon icon - visible in light mode, transitions out in dark mode */}
        <div
          className={`
            absolute inset-0 flex items-center justify-center
            transition-all duration-300 ease-spring
            ${!isDark ? 'opacity-100 transform-none' : 'opacity-0 -rotate-90 scale-50'}
          `}
        >
          <MoonSolid className="h-5 w-5 text-blue-700" />
        </div>
      </div>

      {/* Visual indicator of current mode - animates across the button */}
      <span
        className={`
          absolute inset-0 rounded-full bg-gradient-to-tr
          ${isDark
            ? 'from-gray-900/80 to-blue-900/30 opacity-40'
            : 'from-amber-100 to-amber-200/70 opacity-30'
          }
          transition-opacity duration-300
        `}
        aria-hidden="true"
      />
    </button>
  );
};

export default ThemeSwitcher;