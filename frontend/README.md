# frontend/README.md
# ** UPDATED FILE **

# NeuroLedger Frontend

This directory contains the React frontend application for NeuroLedger, built using Vite and styled with Tailwind CSS. It follows a Vertical Slice Architecture (VSA) approach where applicable for feature organization.

## Project Structure

*   **`public/`**: Static assets served directly by the web server.
*   **`src/`**: Contains all the React source code.
    *   **`features/`**: Houses feature-specific UI components, pages, and hooks (e.g., `auth`, `dashboard`).
    *   **`shared/`**: Contains reusable components, hooks, contexts, layouts, services, and utilities shared across features.
        *   `assets/`: Shared static assets like logos, illustrations.
        *   `components/`: Shared complex UI components (e.g., `Sidebar.jsx`).
        *   `contexts/`: React Context providers (Theme, Auth).
        *   `hooks/`: Reusable React hooks (useApi, useAuth, useTheme).
        *   `layouts/`: Main application layout components (`AppLayout`, `CenteredLayout`).
        *   `pages/`: (Empty, holds generic pages like NotFound)
        *   `services/`: API client setup (Axios) and Firebase SDK initialization.
        *   `styles/`: Global CSS files (Tailwind directives, base styles).
        *   `theme/`: Theme configuration (light/dark) and ThemeSwitcher component.
        *   `types/`: (Empty, for TypeScript interfaces/types later)
        *   `ui/`: Foundational, themeable UI building blocks (Button, Input, Card, Spinner).
        *   `utils/`: General JavaScript utility functions.
    *   `App.jsx`: Root application component, sets up context providers and router.
    *   `index.css`: Imports Tailwind directives and global base styles.
    *   `main.jsx`: Entry point that renders the React application into the DOM.
    *   `routes.jsx`: Defines application routes using `react-router-dom`, including protected/public route logic.
*   **`UI_README.md`**: Outlines UI styling principles, conventions, and component usage guidelines.
*   **`.env`**: (Untracked) Holds environment-specific variables (Firebase SDK config, API URL).
*   **`.env.example`**: Template for required environment variables.
*   **`index.html`**: The main HTML entry point for the Vite build (includes Google Font import for 'Inter').
*   **`package.json`**: Project dependencies and scripts (includes `@heroicons/react`, `@tailwindcss/forms`).
*   **`tailwind.config.js`**: Tailwind CSS configuration file (sets 'Inter' font, includes forms plugin, defines custom styles).
*   **`postcss.config.js`**: PostCSS configuration (used by Tailwind).
*   **`vite.config.js`**: Vite build tool configuration.

## UI Uplift (Post-Phase 1) Features Implemented

*   **Modern Styling:** Updated visual aesthetic inspired by provided examples, focusing on spacing, refined colors, soft shadows/borders, and consistency.
*   **Font:** Uses the 'Inter' font family.
*   **Icons:** Integrates `@heroicons/react` for UI icons.
*   **Layouts Revamped:**
    *   `AppLayout` now features a fixed left **Sidebar** for navigation.
    *   `CenteredLayout` now uses a **split-screen** design on larger viewports for login/signup.
*   **Component Polish:** `Button`, `Input`, `Card` components updated with refined styles, support for icons (Button, Input), and better padding/rounding. Uses `@tailwindcss/forms` for improved input styling defaults.
*   **Theming:** Dark mode support refined with the new neutral color palette.
*   **UI Guide:** Added `UI_README.md` to document styling conventions.

## Getting Started

1.  Ensure you have Node.js and npm/yarn installed.
2.  Create a Firebase project, enable Authentication (Email/Password), register a Web App (`</>`), and copy the `firebaseConfig` object.
3.  Create a `.env` file in this directory using `.env.example` as a template. Populate the `VITE_FIREBASE_*` variables with your Firebase Web SDK config. Ensure `VITE_API_BASE_URL` points to your running backend (default: `http://localhost:5001/api/v1`).
4.  Install dependencies: `npm install`
5.  Run the development server: `npm run dev`
6.  The frontend should start (default: `http://localhost:5173`) and automatically connect to the development server with Hot Module Replacement (HMR).

## API Interaction

The frontend interacts with the backend API defined in `FE_BE_INTERACTION_README.md`. The `shared/services/apiClient.js` handles adding the necessary `Authorization: Bearer <token>` header automatically after login.