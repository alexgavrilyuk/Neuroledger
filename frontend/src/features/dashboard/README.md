# frontend/src/features/dashboard/README.md
# ** UPDATED FILE - Mention data passing **

## Feature: Frontend Dashboard & Chat Interface

This feature slice represents the main authenticated area where users interact via a chat interface. It now handles **client-side execution** of AI-generated code using a Web Worker.

### Core Flow (Phase 5 - Client-Side Execution)

1.  **Routing & Layout:** `/dashboard` route renders `DashboardPage` within `AppLayout`.
2.  **Page (`pages/DashboardPage.jsx`):**
    *   Manages chat history (`useChatHistory`).
    *   Fetches available datasets (`useDatasets`) to populate the selector.
    *   Handles prompt submission UI (`PromptInput`).
    *   Uses `usePromptSubmit` hook for the overall process.
    *   Manages state for the Report Viewer Modal.
3.  **Prompt Submission:**
    *   User types prompt and selects datasets in `PromptInput`.
    *   `handlePromptSubmit` calls `submitPrompt` from the hook, **passing the current prompt text, selected dataset IDs, and the list of all available datasets (fetched by `useDatasets`)**.
    *   `usePromptSubmit`:
        *   Adds a loading placeholder message.
        *   Calls backend `POST /api/v1/prompts`.
        *   Receives `aiGeneratedCode` string from the backend.
        *   **Filters the passed `allAvailableDatasets` list** based on `selectedDatasetIds`.
        *   **Fetches Dataset Content:** For each filtered dataset, it calls the backend (`GET /api/v1/datasets/{id}/read-url`) to get a signed read URL, then fetches the content directly from GCS using `axios.get`.
        *   **Initializes Web Worker:** Creates an instance of `report.worker.js`.
        *   **Sends to Worker:** Uses `worker.postMessage` to send the `aiGeneratedCode` and the fetched `datasets` (array of `{ name, gcsPath, content }`) to the worker.
        *   Updates loading message.
4.  **Worker Execution (`report.worker.js`):**
    *   Receives code and data via `onmessage`.
    *   Loads required libraries (React, ReactDOMServer, Recharts, Papa, Lodash) via static imports (handled by Vite bundler).
    *   **Executes Code (INSECURE):** Uses `new Function()` to run the `aiGeneratedCode` within a prepared scope, passing the `datasets` prop.
    *   Renders the `ReportComponent` to an HTML string using `ReactDOMServer.renderToString`.
    *   Sends the resulting HTML string or error message back to the main thread via `self.postMessage`.
5.  **Receiving Report (Main Thread):**
    *   `usePromptSubmit` listens for messages from the worker (`worker.onmessage`).
    *   Receives the HTML string or error.
    *   Updates the placeholder message (using `updateMessageById`) to "Report available" or displays the worker error. Stores the received HTML (`reportHtml`) on the message object.
    *   Terminates the worker.
6.  **Viewing Report:** (Same as before) `MessageBubble` shows "View Report" button, clicking it opens the `Modal` with `ReportViewer`, which sanitizes and displays the `reportHtml`.

### Files

*   **`components/`**: `ChatInterface.jsx`, `MessageBubble.jsx`, `PromptInput.jsx`
*   **`hooks/`**: `useChatHistory.js`, `usePromptSubmit.js`
*   **`pages/`**: `DashboardPage.jsx`
*   **`README.md`**: This file.
*   **`../../report.worker.js`**: (New) The Web Worker script file.

### Dependencies

*   (Same as before, plus dependencies needed within the worker like react-dom/server)
*   `features/report_display/components/ReportViewer`
*   `dompurify` (Used in ReportViewer)

### State Management

*   (Same as before, but `usePromptSubmit` now manages worker communication and data fetching state).