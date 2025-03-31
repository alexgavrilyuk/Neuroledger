# frontend/src/features/dashboard/README.md
# ** UPDATED FILE **

## Feature: Frontend Dashboard

This feature slice represents the main authenticated area of the NeuroLedger application where users will eventually interact with their data and the AI.

### Core Flow

1.  **Routing:** The main application router (`src/routes.jsx`) maps the `/dashboard` path (and the root `/` path via redirect) to the `DashboardPage`. This route is protected.
2.  **Layout:** The route is rendered within the **`AppLayout`**, which provides the main application structure including the **left Sidebar** for navigation and a header within the main content area.
3.  **Page (`pages/`):**
    *   `DashboardPage.jsx`: The main component rendered for the dashboard route. In its current state, it displays a simple page header ("Dashboard") and a welcome message within a `Card` component, using the updated UI styles. It accesses the logged-in user's data via the `useAuth` hook. It serves as the container where future dashboard components (chat, prompts, reports) will be integrated.

### Files

*   **`pages/`**
    *   `DashboardPage.jsx`: The main landing page for authenticated users, styled according to the new UI guidelines.
*   **`README.md`**: This file.

### Future Files (Placeholders for planning)

*   **`components/`**
    *   `ChatInterface.jsx`
    *   `PromptInput.jsx`
    *   `MessageBubble.jsx`
    *   `ReportArtefact.jsx`
*   **`hooks/`**
    *   `useChatHistory.js`
    *   `usePromptSubmit.js`

### Dependencies

*   `shared/hooks/useAuth`
*   `shared/ui/Card`
*   `shared/layouts/AppLayout` (used by the router for this page)
*   `shared/components/Sidebar.jsx` (rendered by `AppLayout`)