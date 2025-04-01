# frontend/README.md
# ** UPDATED FILE - Mention Phase 4 **

# NeuroLedger Frontend

This directory contains the React frontend application for NeuroLedger, built using Vite and styled with Tailwind CSS. It follows a Vertical Slice Architecture (VSA) approach where applicable for feature organization.

## Project Structure

*   **`public/`**: Static assets served directly by the web server.
*   **`src/`**: Contains all the React source code.
    *   **`features/`**: Houses feature-specific UI components, pages, and hooks (e.g., `auth`, `dashboard`, `onboarding`, `subscription`, `dataset_management`, `account_management`).
    *   **`shared/`**: Contains reusable components, hooks, contexts, layouts, services, and utilities shared across features.
        *   `assets/`: Shared static assets like logos, illustrations.
        *   `components/`: Shared complex UI components (e.g., `Sidebar.jsx`).
        *   `contexts/`: React Context providers (Theme, Auth).
        *   `hooks/`: Reusable React hooks (useAuth, useTheme, useOnboarding).
        *   `layouts/`: Main application layout components (`AppLayout`, `CenteredLayout`).
        *   `pages/`: (Empty, holds generic pages like NotFound)
        *   `services/`: API client setup (Axios) and Firebase SDK initialization.
        *   `styles/`: Global CSS files (Tailwind directives, base styles).
        *   `theme/`: Theme configuration (light/dark) and ThemeSwitcher component.
        *   `types/`: (Empty, for TypeScript interfaces/types later)
        *   `ui/`: Foundational, themeable UI building blocks (Button, Input, Card, Spinner, Modal, Checkbox).
        *   `utils/`: General JavaScript utility functions.
    *   `App.jsx`: Root application component, sets up context providers and router.
    *   `index.css`: Imports Tailwind directives and global base styles.
    *   `main.jsx`: Entry point that renders the React application into the DOM.
    *   `routes.jsx`: Defines application routes using `react-router-dom`, including protected/public route logic.
*   **`UI_README.md`**: Outlines UI styling principles, conventions, and component usage guidelines.
*   **`.env`**: (Untracked) Holds environment-specific variables (Firebase SDK config, API URL).
*   **`.env.example`**: Template for required environment variables.
*   **`index.html`**: The main HTML entry point for the Vite build (includes Google Font import for 'Inter').
*   **`package.json`**: Project dependencies and scripts (includes `@heroicons/react`, `@tailwindcss/forms`, `react-dropzone`).
*   **`tailwind.config.js`**: Tailwind CSS configuration file.
*   **`postcss.config.js`**: PostCSS configuration (used by Tailwind).
*   **`vite.config.js`**: Vite build tool configuration.

## Phases Implemented

*   **Phase 1:** Foundation, Auth (Login/Signup), Theming Setup.
*   **UI Uplift:** Significant styling overhaul post-Phase 1 (Sidebar layout, split-screen public layout, component refinement).
*   **Phase 2:** Dummy Subscription Selection, Onboarding Tutorial Flow.
*   **Phase 3:** Dataset Management MVP (GCS Upload via Signed URL, List Datasets), Account Management Structure.
*   **Phase 4:** Core Prompting & Basic AI Interaction (Textual Analysis): Dashboard Chat UI (Input w/ Dataset Selection, History Display), Backend Prompt Endpoint Integration.

## Getting Started

1.  Ensure you have Node.js and npm/yarn installed.
2.  Create a Firebase project, enable Authentication (Email/Password), register a Web App (`</>`), and copy the `firebaseConfig` object.
3.  Create a `.env` file in this directory using `.env.example` as a template. Populate the `VITE_FIREBASE_*` variables. Ensure `VITE_API_BASE_URL` points to your running backend (default: `http://localhost:5001/api/v1`).
4.  Install dependencies: `npm install`
5.  Run the development server: `npm run dev`
6.  The frontend should start (default: `http://localhost:5173`) and automatically connect to the development server with Hot Module Replacement (HMR).

## API Interaction

The frontend interacts with the backend API defined in `FE_BE_INTERACTION_README.md`. The `shared/services/apiClient.js` handles adding the necessary `Authorization: Bearer <token>` header automatically after login.