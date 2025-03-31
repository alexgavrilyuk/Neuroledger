# frontend/src/shared/theme/README.md
# ** UPDATED FILE **

## Shared: Theme

This directory manages application theming (e.g., light/dark mode) and related configuration.

### Files

*   **`themes.js`**:
    *   Defines JavaScript objects (`lightTheme`, `darkTheme`) containing theme properties. These mainly store descriptive names or potentially Tailwind class names for reference, but the primary theme colors are now defined directly in `tailwind.config.js`.
*   **`ThemeProvider.jsx`**:
    *   The React Context provider component (`ThemeContext.Provider`).
    *   Manages the current theme state (`themeName`).
    *   Reads/writes the theme preference to `localStorage`.
    *   Applies the appropriate class (`light` or `dark`) to the root `<html>` element to enable Tailwind's `darkMode: 'class'` strategy.
*   **`ThemeSwitcher.jsx`**:
    *   A UI component (button using Heroicons) allowing the user to toggle between light and dark themes.
    *   Uses the `useTheme` hook.

### Related Files

*   **`frontend/tailwind.config.js`**:
    *   Must have `darkMode: 'class'` enabled.
    *   **Crucially defines the color palette** (using Tailwind's default `blue` and `gray` families or custom definitions) under `theme.extend.colors` if customized.
    *   **Sets the default font family** ('Inter') under `theme.extend.fontFamily`.
*   **`frontend/index.html`**: Includes the link to import the 'Inter' font family from Google Fonts.
*   **`frontend/src/index.css`**: Sets base text colors and font-smoothing.
*   **`frontend/src/shared/contexts/ThemeContext.jsx`**: Defines the actual Context object used by the provider.
*   **`frontend/src/shared/hooks/useTheme.js`**: Hook to consume the ThemeContext.

### Usage

1.  Ensure the 'Inter' font is linked in `index.html`.
2.  Configure fonts and colors in `tailwind.config.js`.
3.  Wrap the application in `ThemeProvider` in `App.jsx`.
4.  Use Tailwind's utility classes (e.g., `bg-white dark:bg-gray-800`, `text-gray-900 dark:text-white`, `font-sans`) in components for styling. The `dark:` variants will work automatically based on the class applied by `ThemeProvider`.
5.  Place the `ThemeSwitcher` component somewhere accessible (e.g., in `AppLayout` or `CenteredLayout`).
