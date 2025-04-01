# frontend/src/features/dashboard/README.md
# ** UPDATED FILE - Reflect new rendering flow **

## Feature: Frontend Dashboard & Chat Interface

This feature slice represents the main authenticated area of the NeuroLedger application where users interact with their data and the AI via a chat interface.

### Core Flow (Phase 5 - Revised)

1.  **Routing:** The `/dashboard` route (protected) renders the `DashboardPage`.
2.  **Layout:** The `DashboardPage` is rendered within the `AppLayout` (with Sidebar).
3.  **Page (`pages/DashboardPage.jsx`):**
    *   Manages chat history state (`useChatHistory`).
    *   Fetches available datasets (`useDatasets`).
    *   Handles prompt submission (`usePromptSubmit`).
    *   Renders `ChatInterface` and `PromptInput`.
    *   Manages state for a **Report Viewer Modal** (`isReportViewerOpen`, `currentReportHtml`).
    *   Provides a `handleViewReport` function passed down to `ChatInterface`.
4.  **Prompt Submission:**
    *   User types prompt and selects datasets in `PromptInput`.
    *   `handlePromptSubmit` adds the user message and calls `submitPrompt`.
    *   `usePromptSubmit` adds a loading placeholder message and calls the backend `POST /api/v1/prompts`.
5.  **Receiving Report:**
    *   `usePromptSubmit` receives the backend response containing `executionOutput` (HTML string) and `executionStatus`.
    *   It updates the placeholder message (using `updateMessageById`) to show a summary (e.g., "Report generated") and a "View Report" button. The actual HTML is stored in a `reportHtml` field on the message object.
6.  **Viewing Report:**
    *   `ChatInterface` renders `MessageBubble`.
    *   `MessageBubble` detects messages with `contentType: 'report_available'` and renders the summary text and "View Report" button.
    *   Clicking the button calls the `onViewReport` prop (which traces back to `handleViewReport` in `DashboardPage`).
    *   `handleViewReport` sets the `currentReportHtml` state with the HTML from the message and sets `isReportViewerOpen` to `true`.
7.  **Modal Display:**
    *   `DashboardPage` conditionally renders a `Modal` based on `isReportViewerOpen`.
    *   Inside the `Modal`, the `ReportViewer` component (`features/report_display`) is rendered, receiving `currentReportHtml`.
    *   `ReportViewer` sanitizes the HTML using `DOMPurify` and renders it using `dangerouslySetInnerHTML` within a styled (`prose`) container.

### Files

*   **`components/`**: `ChatInterface.jsx`, `MessageBubble.jsx`, `PromptInput.jsx`
*   **`hooks/`**: `useChatHistory.js`, `usePromptSubmit.js`
*   **`pages/`**: `DashboardPage.jsx`
*   **`README.md`**: This file.

### Dependencies

*   `features/dataset_management/hooks/useDatasets`
*   `features/report_display/components/ReportViewer`
*   `shared/ui/*` (Button, Spinner, Modal)
*   `@heroicons/react`
*   `shared/hooks/useAuth`
*   `shared/services/apiClient`
*   `shared/layouts/AppLayout`

### State Management

*   Chat history (`messages`) managed by `useChatHistory`.
*   Report Viewer modal state (`isReportViewerOpen`, `currentReportHtml`) managed in `DashboardPage`.
*   API/Execution loading/error state managed by `usePromptSubmit`.
*   Dataset selection state managed in `PromptInput` (passed up to `DashboardPage` on submit).