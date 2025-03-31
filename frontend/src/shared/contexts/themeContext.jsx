// frontend/src/shared/contexts/ThemeContext.jsx
import React, { createContext, useState, useEffect, useMemo } from 'react';
import { lightTheme, darkTheme } from '../theme/themes';

export const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
  // Initialize state from localStorage or system preference
  const [themeName, setThemeName] = useState(() => {
    const storedTheme = localStorage.getItem('neuroledger-theme');
    if (storedTheme) return storedTheme;
    // Optional: Check system preference
    // if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    //   return 'dark';
    // }
    return 'light'; // Default to light
  });

  // Apply class to HTML element when theme changes
  useEffect(() => {
    const root = window.document.documentElement;
    const isDark = themeName === 'dark';
    root.classList.remove(isDark ? 'light' : 'dark');
    root.classList.add(themeName);
    localStorage.setItem('neuroledger-theme', themeName); // Persist choice
  }, [themeName]);

  // Function to toggle or set theme
  const toggleTheme = () => {
    setThemeName((prevTheme) => (prevTheme === 'light' ? 'dark' : 'light'));
  };

  const setCurrentTheme = (name) => {
      if (name === 'light' || name === 'dark') { // Add other valid themes here later
         setThemeName(name);
      }
  }

  // Provide current theme object and setter function
  const currentTheme = useMemo(() => (themeName === 'dark' ? darkTheme : lightTheme), [themeName]);

  const value = {
    theme: currentTheme, // The theme object (e.g., for non-Tailwind styling)
    themeName,         // 'light' or 'dark'
    toggleTheme,
    setTheme: setCurrentTheme,
  };

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
};