# Plan: Merge Frontend Dashboard and Chat Features

**Last Updated:** April 8, 2024

## 1. Overview & Goal

The current application has separate features for the main "Dashboard" (used for inputting prompts to generate reports) and "Chat" (used for persistent, multi-turn conversations with AI).

**Goal:** Merge the frontend `chat` feature into the `dashboard` feature to create a single, unified user interface for all AI interactions. The primary UI will resemble the current `Dashboard` page but will incorporate chat history, session management (listing, creating, switching chats, this will all be in sidebar now), and real-time message updates, while retaining the ability to select datasets and trigger report generation prompts. The separate `/chat` route and associated UI elements will be removed.

## 2. Context Files & Areas of Impact

This section lists files and directories across the codebase that are relevant to this merge and may require review or modification. **It is crucial to consult these during implementation to avoid breaking existing functionality.**

### Frontend (`frontend/`)

*   **Core Feature Files:**
    *   `src/features/dashboard/DashboardPage.jsx`: Main component to be enhanced.
    *   `src/features/dashboard/README.md`: Documentation for the dashboard.
    *   `src/features/chat/ChatPage.jsx` (or similar): Components and logic to be potentially reused or deprecated.
    *   `src/features/chat/components/` (e.g., `ChatHistory.jsx`, `MessageInput.jsx`, `SessionList.jsx`): Potentially reusable components.
    *   `src/features/chat/hooks/useChat.js` (or similar): Core hook managing chat state, sessions, messages, API calls, Socket.IO integration. This will likely be central to the merged feature.
    *   `src/features/chat/README.md`: Documentation for the chat feature.
*   **Routing:**
    *   `src/routes.jsx`: Contains route definitions. Needs update to remove `/chat` route and potentially adjust `/dashboard` route (e.g., make it dynamic like `/chat/:sessionId` while rendering the Dashboard UI).
    *   `src/App.jsx`: Root component, potentially imports routes.
*   **Shared Layout & Navigation:**
    *   `src/shared/layouts/AppLayout.jsx`: Main authenticated layout.
    *   `src/shared/layouts/Sidebar.jsx`: Navigation component, needs "Chat" link removed **and will incorporate the chat session list and 'New Chat' button**.
*   **Shared Services & Hooks:**
    *   `src/shared/services/apiClient.js`: Axios instance for backend communication. Used by both features.
    *   `src/shared/hooks/useAuth.js`: Authentication context hook.
    *   `src/shared/hooks/useSocket.js` (if exists, or logic within `useChat`): Handles Socket.IO connection and events.
*   **Dataset Interaction:**
    *   `src/features/dataset_management/components/DatasetSelector.jsx` (or similar): Component used on the dashboard to select datasets. Needs to integrate correctly with the chat context.
    *   `src/features/dataset_management/hooks/useDatasets.js` (or similar): Hook for fetching dataset information.
*   **Report Generation:**
    *   `src/features/report_display/ReportViewer.jsx`: Component for rendering reports. Triggered from the dashboard.
    *   `src/features/report_display/README.md`: Documentation.
*   **UI Components:**
    *   `src/shared/ui/`: Base UI components (Button, Input, Card, Modal, etc.).
*   **Documentation:**
    *   `FE_BE_INTERACTION_README.md`: Documents API calls made by the frontend. Needs review/update for any changes in how chat/prompt APIs are called.
    *   `README.md` (frontend root): General frontend overview.

### Backend (`backend/`)

*   **API Routes:**
    *   `src/routes.js`: Mounts feature routers.
    *   `src/features/chat/chat.routes.js`: Defines `/chats` endpoints (`GET /`, `POST /`, `GET /:sessionId/messages`, `POST /:sessionId/messages`).
    *   `src/features/prompts/prompt.routes.js`: Defines `/prompts` endpoint (`POST /`). Ensure its purpose (report generation) remains distinct and callable.
    *   `src/features/internal/internal.routes.js`: Defines worker endpoints (`/internal/chat-ai-worker`).
*   **Controllers & Services:**
    *   `src/features/chat/chat.controller.js`: Handles requests for chat operations.
    *   `src/features/chat/chat.service.js`: Business logic for chat, interaction with models, Cloud Tasks, Socket.IO.
    *   `src/features/chat/chat.worker.js` (or similar): Logic executed by the Cloud Task worker for AI responses.
    *   `src/features/prompts/prompt.controller.js`: Handles requests for report generation prompts.
    *   `src/features/prompts/prompt.service.js`: Business logic for report generation prompts.
    *   `src/features/datasets/dataset.service.js`: Used to fetch dataset context for prompts/chat.
*   **Models:**
    *   `src/features/chat/promptHistory.model.js`: Stores chat messages and AI responses. Central to persistent chat. (Note: Naming might be confusing if distinct from report "prompts").
    *   `src/features/chat/chatSession.model.js` (if exists, or handled via PromptHistory grouping): Manages chat sessions.
    *   `src/features/datasets/dataset.model.js`: Dataset metadata.
*   **Middleware:**
    *   `src/shared/middleware/auth.middleware.js`: Protects routes.
    *   `src/shared/middleware/subscription.guard.js`: Checks subscription status.
    *   `src/shared/middleware/cloudTask.middleware.js`: Validates worker requests.
*   **Shared Infrastructure:**
    *   `src/app.js`: Express app setup, including Socket.IO initialization.
    *   `src/server.js`: Server entry point.
    *   `src/shared/external_apis/`: Clients for Claude, GCS, etc.
    *   `src/shared/utils/logger.js`: Logging.

### Root/Documentation

*   `ARCHITECTURE.md`: High-level architecture document. Needs significant updates to reflect the merged frontend feature and interaction flows.

## 2.1 Specific Files to Review

This comprehensive list contains **all files** with critical imports, exports, API integration points, and state management that developers MUST review to avoid breaking functionality during the implementation:

### Frontend Critical Files

1. **Chat Feature Core**
   * `src/features/chat/ChatPage.jsx`
     - Import patterns (components, hooks, UI elements)
     - Routing parameters handling (if using `:sessionId`)
     - Component composition structure 
     - State management approach
   * `src/features/chat/components/ChatHistory.jsx`
     - Message display algorithm
     - Scrolling behavior
     - Typing indicators
     - Message status indicators
     - Empty state handling
   * `src/features/chat/components/MessageInput.jsx`
     - Form submission handling
     - Dataset integration
     - Validation logic
     - Keyboard shortcuts
   * `src/features/chat/components/SessionList.jsx`
     - Session rendering format
     - Active session highlighting
     - Event handlers for selection
   * `src/features/chat/hooks/useChat.js` (most critical)
     - Socket.IO integration
     - API call patterns for all chat endpoints
     - State structure and management
     - Error handling
     - Loading state management
     - Pagination (if implemented)

2. **Dashboard Feature Core**
   * `src/features/dashboard/DashboardPage.jsx`
     - Layout structure
     - Prompt submission logic
     - Report generation trigger
     - Dataset selection integration
   * `src/features/dashboard/hooks/usePrompts.js` (if exists)
     - API interaction with `/prompts` endpoint
     - Dataset integration
     - State management

3. **Socket Communication**
   * `src/shared/services/socketService.js` (if exists)
     - Connection setup
     - Event listeners, especially for chat messages
     - Reconnection logic
   * Socket logic within `useChat.js`
     - Event handling for real-time updates

4. **API Integration**
   * `src/shared/services/apiClient.js`
     - Base URL configuration
     - Auth token handling
     - Request/response interceptors
   * Any API utility functions
     - Error handling patterns
     - Response transformation

5. **Sidebar & Navigation**
   * `src/shared/layouts/Sidebar.jsx`
     - Navigation structure
     - Menu item structure
     - Active item logic
     - Auth integration

6. **Routing**
   * `src/routes.jsx`
     - Route definitions for Dashboard, Chat
     - Protected route wrappers
     - Lazy loading patterns
     - Route parameters

7. **Dataset Integration**
   * `src/features/dataset_management/components/DatasetSelector.jsx`
     - Selection mechanism
     - Multi-select implementation
     - State management (controlled vs uncontrolled)
     - Prop patterns

8. **Report Generation**
   * `src/features/report_display/ReportViewer.jsx`
     - Rendering approach
     - Error handling
     - Loading states
     - iframe security considerations

### Backend Critical Files

1. **Chat API Implementation**
   * `backend/src/features/chat/chat.routes.js`
     - All route definitions and HTTP methods
     - Parameter validation
     - Authentication/subscription middleware
   * `backend/src/features/chat/chat.controller.js`
     - Request validation logic
     - Response formatting
     - Error handling
   * `backend/src/features/chat/chat.service.js`
     - Business logic implementation
     - Database interaction
     - Socket event emission
     - AI integration via Claude

2. **Prompt API Implementation**
   * `backend/src/features/prompts/prompt.routes.js`
     - Route definition
     - Required parameters
     - Middleware chain
   * `backend/src/features/prompts/prompt.service.js`
     - AI integration logic
     - Dataset context creation
     - Response transformation

3. **Database Models**
   * `backend/src/features/chat/promptHistory.model.js`
     - Schema definition
     - Indexes
     - Virtual properties
     - Association with sessions/users
   * `backend/src/features/chat/chatSession.model.js` (if exists)
     - Schema definition
     - Relationship to messages

4. **Socket.IO Setup**
   * `backend/src/app.js` (Socket server initialization)
     - Configuration
     - Middleware
     - Namespaces
   * `backend/src/features/chat/chat.service.js` (Socket event emission)
     - Event names
     - Payload structure

### API Contracts & Documentation

1. **API Documentation**
   * `frontend/FE_BE_INTERACTION_README.md`
     - Chat API endpoint details
     - Prompt API endpoint details
     - Required parameters
     - Response formats
     - Error codes

2. **Architecture Documentation**
   * `ARCHITECTURE.md`
     - Chat flow diagram
     - Prompt flow diagram
     - Frontend component relationships

## 3. Detailed Implementation Plan

### Phase 1: UI Integration & State Management Core

1.  **Enhance UI Components:**
    *   **Modify `Sidebar.jsx`:** Integrate a chat session list component (potentially reusing `SessionList.jsx` from `features/chat/`) and a "New Chat" button (which triggers the `createSession` action from the `useChat` hook) directly within the sidebar's structure.
    *   **Modify `DashboardPage.jsx`:**
        *   Integrate a chat history display component (potentially reusing `ChatHistory.jsx`) into the main content area, replacing the current placeholder.
        *   Modify the existing prompt input area to function as a general message input (reusing `MessageInput.jsx` logic if suitable), handling message sending for the active chat session selected via the sidebar.
        *   Keep the Dataset selection mechanism prominent and ensure selected datasets are associated with the *current* message being composed.
2.  **Adapt `useChat` Hook (or equivalent):**
    *   Ensure this hook becomes the central state manager for the unified view.
    *   It should handle:
        *   Fetching/managing the list of chat sessions (`GET /chats`) to be displayed in the sidebar.
        *   Creating new chat sessions (`POST /chats`), triggered from the sidebar button.
        *   Switching between active sessions (selected from the sidebar list) and loading their messages (`GET /chats/:sessionId/messages`) into the main chat display area.
        *   Sending new user messages (from the main input) and handling placeholder AI messages (`POST /chats/:sessionId/messages`).
        *   Integrating with Socket.IO for real-time updates (`chat:message:processing`, `chat:message:completed`) and updating the state accordingly.
        *   Managing loading and error states for all chat operations.
        *   Exposing necessary state (sessions, current messages, active session ID, loading/error flags) and actions (sendMessage, createSession, switchSession) to both `Sidebar.jsx` (for session list, creation, selection) and `DashboardPage.jsx` (for message display, sending).
3.  **Integrate Dataset Selection:**
    *   Modify the `DashboardPage.jsx` and potentially the `useChat` hook to correctly associate selected `datasetIds` when sending a message via `POST /chats/:sessionId/messages`. The backend already supports this.

### Phase 2: Routing, Navigation & API Calls

4.  **Update Routing (`src/routes.jsx`):**
    *   Remove the route definition for `/chat`.
    *   Decide on the primary route:
        *   Option A: Keep `/dashboard`. The `useChat` hook can manage loading the latest or a default session.
        *   Option B: Change to `/chat` or `/chat/:sessionId`. This might be semantically clearer but requires redirecting `/dashboard` or updating default navigation. **Recommendation:** Keep `/dashboard` for simplicity, handle session loading within the component/hook.
    *   Ensure `ProtectedRoute` logic remains correctly applied.
5.  **Update Navigation (`Sidebar.jsx`):**
    *   Remove the "Chat" navigation item.
    *   Ensure the "Dashboard" item correctly links to `/dashboard`.
6.  **Verify API Calls:**
    *   Confirm `DashboardPage.jsx` (via `useChat`) now correctly calls all necessary `/chats/...` endpoints.
    *   **Retain Report Prompt Logic:** Determine how to trigger the specific report generation (`POST /prompts`).
        *   Option A: Add a dedicated "Generate Report" button near the message input, which calls `POST /prompts` using the current input text and selected datasets.
        *   Option B: Use a specific command or indicator within the chat message (e.g., `/report ...`) that the frontend intercepts to call `POST /prompts` instead of `POST /chats/.../messages`.
        *   **Recommendation:** Option A (dedicated button) is likely clearer for the user. Ensure `ReportViewer` is still triggered correctly upon success.

### Phase 3: Cleanup & Documentation

7.  **Remove Redundant Code:**
    *   Delete `src/features/chat/ChatPage.jsx` and any other page-level components from the `chat` feature.
    *   Remove components from `src/features/chat/components/` that were *not* reused in the merged `DashboardPage`.
    *   Clean up any unused state or logic within `DashboardPage.jsx` that was purely for the old prompt-only functionality.
    *   Remove the `/chat` route and related imports/lazy loading from `src/routes.jsx`.
8.  **Update Documentation:**
    *   Modify `ARCHITECTURE.md`: Update diagrams and descriptions for Frontend Architecture, Chat Flow, and Prompt & Report Flow to reflect the single UI.
    *   Modify `FE_BE_INTERACTION_README.md`: Ensure API endpoint descriptions match the unified frontend usage.
    *   Update `frontend/src/features/dashboard/README.md`: Detail the new combined functionality.
    *   Update or remove `frontend/src/features/chat/README.md`.
    *   Update `frontend/README.md` if necessary.

## 4. Verification & Testing Strategy

*   **Manual End-to-End Testing:**
    *   **Chat Functionality:**
        *   Load dashboard: Does it show existing chats? Does it load the latest/default chat history?
        *   Create new chat: Button works, new session appears in list, history is empty.
        *   Switch chats: Select different sessions, verify history updates correctly.
        *   Send message: Message appears instantly, AI response placeholder appears, AI response replaces placeholder (test short and long waits).
        *   Real-time: Open two tabs, send message in one, verify it appears in the other.
        *   Context: Verify dataset selection persists/resets appropriately when composing messages or switching chats. Verify selected datasets are sent with messages.
        *   History Scrolling: Ensure chat history scrolls correctly.
    *   **Report Generation:**
        *   Select datasets.
        *   Use the dedicated "Generate Report" mechanism (e.g., button).
        *   Verify the `POST /prompts` endpoint is called.
        *   Verify the `ReportViewer` modal opens and displays the generated code/report correctly upon success.
    *   **Edge Cases:** Error handling (API errors, WebSocket disconnects), empty states (no chats, no messages), long messages, multiple simultaneous requests.
    *   **UI/UX:** Responsiveness, layout consistency, clear loading indicators, intuitive controls.
*   **Code Review:** Ensure changes follow VSA principles, state management is clean, and no regressions were introduced.
*   **Check Browser Console:** Monitor for errors during testing.

This plan provides a detailed roadmap. Specific component names and hook implementations may differ slightly in the actual codebase. 