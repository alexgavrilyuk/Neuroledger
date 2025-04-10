# frontend/src/features/dashboard/README.md

## Feature: Frontend Dashboard & Chat Interface

This feature slice represents the main authenticated area where users interact via a chat interface. It handles rendering AI-generated React reports within a **sandboxed `<iframe>`** and manages persistent chat sessions.

### Core Flow

1.  **Routing & Layout:** `/dashboard` route renders `DashboardPage` within `AppLayout`, with chat sessions displayed in the `Sidebar`.
2.  **Page (`pages/DashboardPage.jsx`):**
    *   Manages chat functionality via `useChat` hook.
    *   Fetches available datasets (`useDatasets`) to populate the selector.
    *   Handles prompt submission UI (`PromptInput`).
    *   Manages state for the Report Viewer Modal.
3.  **Chat Session Management:**
    *   User creates/selects a chat session from the sidebar.
    *   Session list persists across page refreshes.
    *   Each session maintains its own history and dataset context.
    *   Dataset selection is locked after the first message in a session.
4.  **Prompt Submission:**
    *   User types prompt and selects datasets in `PromptInput`.
    *   `handlePromptSubmit` calls `sendMessage` from the `useChat` hook.
    *   For first message: dataset selection establishes context for the session.
    *   For subsequent messages: dataset context is maintained (selection locked).
5.  **Real-time Updates:**
    *   Socket.IO connections provide status updates for message processing.
    *   Message bubbles update in real-time based on backend events.
6.  **Report Viewing:**
    *   `MessageBubble` shows a "View Report" button for completed AI responses.
    *   Clicking the button opens the `ReportViewer` modal.
    *   The `reportInfo` object (containing code + data) is passed as a prop to `ReportViewer`.

### Files

*   **`components/`**: 
    *   `ChatInterface.jsx`: Displays messages for the current session.
    *   `MessageBubble.jsx`: Renders individual user and AI messages with appropriate styling.
    *   `PromptInput.jsx`: Handles message input and dataset selection.
    *   `ProgressIndicator.jsx`: Shows processing status for AI responses.
    *   `ChatSessionItem.jsx`: Displays a single chat session in the sidebar list.
    *   `ChatSessionList.jsx`: Renders a list of chat sessions with create/select functionality.
    *   `ChatMessage.jsx`: Displays a message with appropriate styling and actions.
    *   `ChatDetail.jsx`: Renders the main chat area with messages and input.
    *   `ChatInput.jsx`: Provides text input area with dataset selection for chat.
*   **`context/`**:
    *   `ChatContext.jsx`: Provides state management for chat sessions and messages.
*   **`hooks/`**: 
    *   `useSocket.js`: Manages Socket.IO connections for real-time updates.
    *   `usePromptSubmit.js`: Handles submitting prompts and processing AI responses (legacy but still used).
    *   `useChatHistory.js`: Manages chat message history (legacy but still used).
*   **`services/`**:
    *   `chat.api.js`: API client functions for chat operations.
*   **`pages/`**: 
    *   `DashboardPage.jsx`: Main container component integrating all chat and report functionalities.
    *   `ChatPage.jsx`: Standalone chat page for dedicated chat interface.
*   **`README.md`**: This file.

### Dependencies

*   `features/report_display/components/ReportViewer`: Renders reports in a sandboxed iframe.
*   `features/dataset_management/hooks/useDatasets`: Fetches available datasets.
*   `shared/components/Sidebar`: Contains chat session list and navigation.
*   Other shared components/hooks as needed.

### State Management

*   **Primary State Management:** 
    *   `ChatContext` provides the main state management via the `useChat` hook.
    *   Manages sessions, messages, and API interactions.
    *   Handles WebSocket event subscriptions for real-time updates.

*   **Component-Level State:**
    *   `DashboardPage` manages report modal visibility and reportInfo.
    *   `ChatSessionItem` manages session editing/deletion UI state.
    *   `PromptInput` handles input field state and dataset selection.
    *   `ReportViewer` manages iframe loading and status states.
    
*   **Legacy Hooks (Still Used):**
    *   `usePromptSubmit` manages the prompt submission process and data processing for reports.
    *   `useChatHistory` provides utility functions for chat history operations.

### User Interface

*   **Sidebar:** Displays navigation and chat sessions with "New Chat" button.
*   **Chat Display:** Shows message history for the selected session with real-time updates.
*   **Input Area:** Provides message input and dataset selection (locked after first message).
*   **Report Modal:** Displays AI-generated reports in a sandboxed environment.