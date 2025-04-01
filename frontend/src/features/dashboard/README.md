# frontend/src/features/dashboard/README.md
# ** UPDATED FILE **

## Feature: Frontend Dashboard & Chat Interface

This feature slice represents the main authenticated area of the NeuroLedger application where users interact with their data and the AI via a chat interface.

### Core Flow (Phase 4)

1.  **Routing:** The `/dashboard` route (protected) renders the `DashboardPage`.
2.  **Layout:** The `DashboardPage` is rendered within the `AppLayout` (with Sidebar).
3.  **Page (`pages/DashboardPage.jsx`):**
    *   Manages the overall state for the chat interaction.
    *   Instantiates `useChatHistory` to store messages.
    *   Instantiates `useDatasets` to fetch the list of user datasets.
    *   Instantiates `usePromptSubmit` to handle sending prompts to the backend.
    *   Renders `ChatInterface` to display messages.
    *   Renders `PromptInput` for user input and dataset selection.
    *   Handles the submission flow: gets prompt/datasets from `PromptInput`, adds user message to history, calls `submitPrompt` from the hook, which handles the API call and adds the AI response/error to history.
    *   Manages scrolling the chat view to the bottom.
4.  **Components (`components/`):**
    *   `ChatInterface.jsx`: Receives the `messages` array and `isLoading` state, maps over messages, and renders `MessageBubble` for each.
    *   `MessageBubble.jsx`: Renders a single chat message with appropriate styling based on whether it's from the 'user' or 'ai'. Includes user/AI icons. Handles loading and error states for AI messages.
    *   `PromptInput.jsx`:
        *   Provides a `textarea` for the user's prompt text.
        *   Includes a dataset selection area (checkboxes in this phase) populated by the `datasets` prop (from `useDatasets`).
        *   Manages local state for the prompt text and the `selectedDatasetIds`.
        *   Calls the `onSubmit` prop when the user sends the prompt (Enter key or button click).
        *   Disables input/button while `isLoading`.
5.  **Hooks (`hooks/`):**
    *   `useChatHistory.js`: Manages the `messages` array state. Provides `addMessage` and `updateLatestMessage` functions.
    *   `usePromptSubmit.js`: Handles the API call (`POST /api/v1/prompts`). Manages loading/error state for the API request. Takes `addMessageCallback` to add placeholder/final AI messages to the history managed by `useChatHistory`.

### Files

*   **`components/`**
    *   `ChatInterface.jsx`
    *   `MessageBubble.jsx`
    *   `PromptInput.jsx`
*   **`hooks/`**
    *   `useChatHistory.js`
    *   `usePromptSubmit.js`
*   **`pages/`**
    *   `DashboardPage.jsx`: Orchestrates the dashboard UI and state.
*   **`README.md`**: This file.

### Dependencies

*   `features/dataset_management/hooks/useDatasets`
*   `shared/ui/*` (Button, Spinner, potentially Checkbox)
*   `@heroicons/react`
*   `shared/hooks/useAuth`
*   `shared/services/apiClient`
*   `shared/layouts/AppLayout`

### State Management

*   Chat history (`messages`) managed by `useChatHistory`.
*   Prompt input text and selected dataset IDs managed locally in `PromptInput`.
*   API loading/error state managed by `usePromptSubmit`.
*   Dataset list loading/error state managed by `useDatasets`.