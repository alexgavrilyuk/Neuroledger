# frontend/src/shared/theme/README.md
# ** UPDATED FILE **

## Shared: Theme

This directory manages application theming (light/dark mode) configuration and the UI component for switching themes.

### Files

*   **`themes.js`**:
    *   Defines simple JavaScript objects (`lightTheme`, `darkTheme`) containing descriptive theme properties (like `name: 'light'`).
    *   **Note:** These JS objects are *not* the primary source of theme styling. The actual colors and styles are defined using Tailwind CSS utility classes and configured in `tailwind.config.js`.
*   **`ThemeSwitcher.jsx`**:
    *   A UI button component that allows the user to toggle between light and dark themes.
    *   Uses the `useTheme` hook to get the current `themeName` and the `toggleTheme` function.
    *   Displays appropriate icons (`SunIcon`/`MoonIcon`) with transition animations based on the current theme.

### Related Files & Concepts

*   **`frontend/src/shared/contexts/ThemeContext.jsx`**:
    *   Defines the `ThemeContext` and the `ThemeProvider` component.
    *   `ThemeProvider` manages the current theme state (`themeName`).
    *   It reads/writes the theme preference to `localStorage` (`neuroledger-theme`).
    *   **Crucially, it applies the appropriate class (`light` or `dark`) to the root `<html>` element**, enabling Tailwind's `darkMode: 'class'` strategy.
*   **`frontend/src/shared/hooks/useTheme.js`**: The hook used by components (like `ThemeSwitcher`) to access the theme context (`themeName`, `toggleTheme`, etc.).
*   **`frontend/tailwind.config.js`**:
    *   Must have `darkMode: 'class'` enabled in its configuration.
    *   **Defines the actual color palette** used by Tailwind utility classes for both light and dark modes (e.g., `colors.gray`, `colors.blue`).
    *   Defines the default font family (`fontFamily.sans`).
*   **`frontend/index.html`**: Should include the necessary `<link>` tag(s) to import web fonts (e.g., 'Inter' from Google Fonts).
*   **`frontend/src/index.css`**: May define base text colors, background colors, and font smoothing for the `body`.

### Usage

1.  Ensure fonts are linked in `index.html` and configured in `tailwind.config.js`.
2.  Define colors for light/dark mode in `tailwind.config.js` and ensure `darkMode: 'class'` is set.
3.  Wrap the application root (e.g., in `App.jsx`) with the `ThemeProvider` from `shared/contexts/ThemeContext.jsx`.
4.  Use Tailwind's utility classes (e.g., `bg-white dark:bg-gray-800`, `text-gray-900 dark:text-white`) throughout components. The `dark:` variants will apply automatically based on the class set on the `<html>` tag by the `ThemeProvider`.
5.  Place the `ThemeSwitcher` component in a suitable location (e.g., in the header within `AppLayout`).
