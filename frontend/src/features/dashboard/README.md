// ================================================================================
// FILE: NeuroLedger/frontend/src/features/dashboard/README.md
// ================================================================================
# frontend/src/features/dashboard/README.md
# ** UPDATED FILE - Reflect Iframe execution **

## Feature: Frontend Dashboard & Chat Interface

This feature slice represents the main authenticated area where users interact via a chat interface. It now handles rendering AI-generated React reports within a **sandboxed `<iframe>`**.

### Core Flow (Iframe Execution Approach)

1.  **Routing & Layout:** `/dashboard` route renders `DashboardPage` within `AppLayout`.
2.  **Page (`pages/DashboardPage.jsx`):**
    *   Manages chat history (`useChatHistory`).
    *   Fetches available datasets (`useDatasets`) to populate the selector.
    *   Handles prompt submission UI (`PromptInput`).
    *   Uses `usePromptSubmit` hook for the overall process.
    *   Manages state for the Report Viewer Modal.
3.  **Prompt Submission:**
    *   User types prompt and selects datasets in `PromptInput`.
    *   `handlePromptSubmit` calls `submitPrompt` from the hook.
    *   `usePromptSubmit`:
        *   Adds a loading placeholder message.
        *   Calls backend `POST /api/v1/prompts` to get the AI-generated **React code string**.
        *   **Fetches Dataset Content:** For each selected dataset, calls backend (`GET /api/v1/datasets/{id}/read-url`) to get a signed URL, then fetches content directly from GCS.
        *   **Updates Message State:** Updates the loading message with `contentType: 'report_iframe_ready'`, storing the received `aiGeneratedCode` string and the fetched `datasetsWithContent` array within the message object's `reportInfo` field. Marks loading as complete for the hook.
4.  **Viewing Report:**
    *   `MessageBubble` shows a "View Report" button for messages with `contentType: 'report_iframe_ready'`.
    *   Clicking the button opens the `ReportViewer` modal (`DashboardPage` manages modal state).
    *   The `reportInfo` object (containing code + data) is passed as a prop to `ReportViewer`.
5.  **Iframe Rendering (`features/report_display/components/ReportViewer.jsx`):**
    *   `ReportViewer` renders an `<iframe>`.
    *   Sets the `src` to `/iframe-bootstrapper.html`.
    *   Sets the `sandbox="allow-scripts"` attribute (crucially **omitting** `allow-same-origin`).
    *   On iframe `onLoad`, it uses `postMessage` to securely send the `reportInfo` (code + data) and current theme information *into* the iframe.
    *   It listens for status messages back from the iframe via `postMessage`.
6.  **Iframe Execution (`public/iframe-bootstrapper.html`):**
    *   The bootstrapper loads React, ReactDOM, Recharts, Lodash, PapaParse via CDN `<script>` tags.
    *   It listens for the `postMessage` containing the code and data.
    *   Once libraries are loaded and data/code is received, it executes the AI's code string (using `new Function()`).
    *   It renders the resulting React component into a `div` within the iframe using `ReactDOM.createRoot().render()`.
    *   It sends status messages ('success' or 'error') back to the parent `ReportViewer` via `postMessage`.

### Files

*   **`components/`**: `ChatInterface.jsx`, `MessageBubble.jsx`, `PromptInput.jsx`, `ProgressIndicator.jsx`
*   **`hooks/`**: `useChatHistory.js`, `usePromptSubmit.js`
*   **`pages/`**: `DashboardPage.jsx`
*   **`README.md`**: This file.

### Dependencies

*   `features/report_display/components/ReportViewer`
*   `axios` (for GCS fetching)
*   Other shared components/hooks as before.

### State Management

*   `useChatHistory` manages messages.
*   `usePromptSubmit` manages API/fetching loading/error states.
*   `DashboardPage` manages report modal visibility and the `reportInfo` to pass to the modal.
*   `ReportViewer` manages the iframe loading and internal status states.