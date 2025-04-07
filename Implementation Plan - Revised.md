# Implementation Plan: Persistent & Contextual Chat History

**Version:** 1.1
**Date:** 2023-04-07

## 1. Introduction & Goal

This document outlines the implementation plan for enhancing the application's chat feature. The current implementation involves a synchronous request-response cycle for generating AI reports based on user prompts. If the user navigates away or refreshes the page, the chat context and generated report are lost.

The goal is to implement a persistent chat history system where:

1.  Chat conversations are saved to the database.
2.  AI report generation runs asynchronously in the background, allowing the UI to remain responsive.
3.  Users can view past chat sessions and their associated messages/reports.
4.  When generating new AI responses within a chat, the AI receives the context of the *entire preceding conversation* in that session, including previously generated code snippets, enabling iterative refinement and follow-up questions.

## 2. Overview of Changes

The implementation involves significant changes across the stack:

*   **Database:** Introduce a new `ChatSession` model and modify the existing `PromptHistory` model to link messages to sessions and store different message types.
*   **Backend:**
    *   Create new API endpoints for managing chat sessions and messages.
    *   Leverage the existing Google Cloud Tasks infrastructure for asynchronous AI code generation.
    *   Integrate WebSockets (Socket.IO) for real-time updates to the frontend when background jobs complete.
    *   Modify the AI context assembly logic to include chat history (user prompts and previous AI-generated code).
    *   Update the system prompt for the AI to understand and utilize the chat history context.
*   **Frontend:**
    *   Develop UI components for listing chat sessions and displaying conversation history.
    *   Update the chat interface to send messages to the new endpoints and handle the asynchronous flow (displaying loading states).
    *   Integrate WebSocket client to receive real-time updates.
    *   Modify report rendering logic to work with historical `aiGeneratedCode` retrieved from the database.
    *   Implement state management for chat sessions and messages.

## 3. Prerequisites & New Dependencies

*   **Backend:**
    *   Already using Google Cloud Tasks - no new dependencies needed for background processing.
    *   `socket.io`: For WebSocket communication.
*   **Frontend:**
    *   `socket.io-client`: For connecting to the WebSocket server.

## 4. Detailed Implementation Steps

### 4.1. Database Schema Changes (MongoDB/Mongoose)

1.  **Create `ChatSession` Model:**
    *   File: `backend/src/features/chat/chatSession.model.js` (New file)
    *   Schema:
        *   `_id`: ObjectId
        *   `userId`: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true }
        *   `teamId`: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', index: true } // Optional, if chats can be team-based
        *   `title`: { type: String, default: 'New Chat' } // Can be updated later
        *   `createdAt`: { type: Date, default: Date.now }
        *   `updatedAt`: { type: Date, default: Date.now }
        *   // Add index on `userId` and `updatedAt` for efficient listing

2.  **Modify `PromptHistory` Model:**
    *   File: `backend/src/features/prompts/prompt.model.js` (Existing file)
    *   **Add Fields:**
        *   `chatSessionId`: { type: mongoose.Schema.Types.ObjectId, ref: 'ChatSession', index: true } // Only required for messages in a chat
        *   `messageType`: { type: String, enum: ['user', 'ai_report', 'ai_error', 'system'], default: 'user' } // Default for backward compatibility
        *   `createdAt`: { type: Date, default: Date.now, index: true } // Ensure this exists and is indexed with chatSessionId
    *   **Ensure Existing Fields:**
        *   Keep `promptText` (for user messages) and add documentation that it contains user input when `messageType` is 'user'
        *   Keep `aiGeneratedCode` (for AI responses) and add documentation that it contains code when `messageType` is 'ai_report'
        *   Keep `errorMessage` (for errors) and add documentation that it contains error details when `messageType` is 'ai_error'
        *   Keep existing `status` field but update possible values to include 'processing', 'completed', 'error'
    *   **Add Compound Index:** Create a compound index on `{ chatSessionId: 1, createdAt: 1 }` for efficient message retrieval in chronological order.

### 4.2. Configuration Updates

1.  **Add Cloud Tasks Queue Configuration:**
    *   Update `.env` and `.env.example` to include:
        ```
        # Cloud Tasks Queue for Chat AI Generation
        CHAT_AI_QUEUE_NAME=neuroledger-chat-ai-queue
        ```
    *   Update `backend/src/shared/config.js` to include:
        ```javascript
        chatAiQueueName: process.env.CHAT_AI_QUEUE_NAME || 'neuroledger-chat-ai-queue',
        ```

### 4.3. Backend Implementation

1.  **Create Chat Feature Directory:**
    *   Create `backend/src/features/chat/`
    *   Inside, create:
        *   `chat.routes.js` - Public API endpoints
        *   `chat.controller.js` - Request handlers
        *   `chat.service.js` - Business logic
        *   `chat.taskHandler.js` - Cloud Tasks worker
        *   `chatSession.model.js` - Chat session schema

2.  **Extract Shared Cloud Tasks Client:**
    *   Create `backend/src/shared/services/cloudTasks.service.js` to extract the common Cloud Tasks client initialization code from `dataQuality/cloudTaskHandler.js`

3.  **Implement Chat API Endpoints (`chat.routes.js`):**
    *   Create public routes under `/chats` with auth protection
    *   Create internal routes for Cloud Tasks workers with token validation
    *   Export both routers separately following the existing pattern in `dataQuality.routes.js`

4.  **Update Main Routes File:**
    *   Modify `backend/src/routes.js` to include the new chat routes and internal worker routes

5.  **Implement Chat Controller (`chat.controller.js`):**
    *   Create controller methods for all endpoints defined in `chat.routes.js`
    *   Include detailed validation, error handling, and appropriate HTTP status codes
    *   Follow the pattern of your existing controllers, particularly `dataQuality.controller.js`

6.  **Implement Chat Service Logic (`chat.service.js`):**
    *   Functions to interact with `ChatSession` and `PromptHistory` models
    *   Implement the `addMessage` function to create Cloud Tasks using your existing pattern
    *   Return 202 Accepted responses for async operations

7.  **Implement Cloud Task Handler (`chat.taskHandler.js`):**
    *   Extract payload processing logic for `handleWorkerRequest` controller method
    *   Follow your existing error handling pattern with proper database status updates
    *   Build chat history context from previous messages

8.  **Update Prompt Service (`prompt.service.js`):**
    *   Add a new method to handle generation with history context
    *   Reuse most of the existing code but add chat history to the context

9.  **Update System Prompt Template (`system-prompt-template.js`):**
    *   Modify to include chat history context
    *   Add instructions for the AI about how to use previous code in follow-up requests

10. **Setup WebSockets (`backend/src/socket.js`, `server.js`):**
    *   Create and initialize Socket.IO server
    *   Implement authentication using JWT tokens
    *   Manage user connections and provide a way to emit events to specific users

11. **Update Cloud Task Handler to Emit WebSocket Events:**
    *   Modify `handleWorkerRequest` to emit events when tasks complete
    *   Include updated message data in the event payload

12. **Deprecate Old Endpoint:**
    *   Once the new system is stable, update `prompt.routes.js` to redirect requests or provide a deprecation notice

### 4.4. Frontend Implementation

1.  **Create Chat Feature Directory:**
    *   Create `frontend/src/features/chat/` with appropriate subdirectories

2.  **Implement Chat API Service:**
    *   Create `frontend/src/services/chat.api.js` with functions to call the new backend endpoints

3.  **Implement State Management:**
    *   Use whichever state management approach is consistent with your codebase

4.  **Implement UI Components:**
    *   Create components for chat sidebar, message display, message input, etc.

5.  **Integrate WebSockets in Frontend:**
    *   Create client-side Socket.IO initialization and event handling

6.  **Initialize Socket in App Component:**
    *   Set up the WebSocket connection after user login

7.  **Listen for WebSocket Events in Chat Component:**
    *   Update UI in real-time when messages are processed in the background

## 5. Required Context Files for Developers

**Backend (`/backend`):**

*   `package.json`
*   `.env.example`
*   `src/server.js` (Entry point, middleware setup)
*   `src/app.js` (Express app setup)
*   `src/routes.js` (Main router)
*   `src/shared/config.js` (Configuration setup)
*   `src/shared/middleware/auth.middleware.js` (Authentication)
*   `src/shared/middleware/subscription.guard.js` (Subscription checks)
*   `src/shared/middleware/cloudTask.middleware.js` (Cloud Task authentication - **CRITICAL**)
*   `src/shared/external_apis/claude.client.js` (Claude API interaction)
*   `src/shared/utils/logger.js` (Logging)
*   `src/features/prompts/prompt.routes.js` (Old endpoint)
*   `src/features/prompts/prompt.controller.js` (Old controller logic)
*   `src/features/prompts/prompt.service.js` (Current AI call & context logic - **CRITICAL**)
*   `src/features/prompts/prompt.model.js` (Current PromptHistory model - **CRITICAL**)
*   `src/features/prompts/system-prompt-template.js` (Current system prompt - **CRITICAL**)
*   `src/features/users/user.model.js` (For `userId` relations, settings)
*   `src/features/datasets/dataset.model.js` (For dataset context)
*   `src/features/teams/team.model.js` (If team context is used)
*   `src/features/teams/team-member.model.js` (If team context is used)
*   `src/features/dataQuality/dataQuality.routes.js` (Example of router + internalRouter pattern - **CRITICAL**)
*   `src/features/dataQuality/dataQuality.controller.js` (Example of controller with worker handler - **CRITICAL**)
*   `src/features/dataQuality/cloudTaskHandler.js` (Cloud Tasks implementation - **CRITICAL**)

**Frontend (`/frontend`):**

*   `package.json`
*   `.env.example`
*   `vite.config.js` (Build setup)
*   `src/main.jsx` (App entry point)
*   `src/App.jsx` (Root component, global layout/providers)
*   `src/routes.jsx` (Routing setup)
*   `src/config.js` (Frontend configuration)
*   `src/services/api.js` or similar API utility files
*   Any existing state management setup (Redux store, Zustand store, Context providers)
*   `src/features/report_display/**` (All files within - **CRITICAL** for understanding how reports are currently rendered from code)
*   The current component(s) responsible for the existing chat/prompt input UI.
*   `FE_BE_INTERACTION_README.md` (Existing documentation)

## 6. Testing Considerations

*   **Unit Tests:** Test individual service functions, context assembly, model logic, Cloud Tasks handler logic.
*   **Integration Tests:**
    *   Test the full flow: API call -> Message creation -> Cloud Task creation -> Task handler processing -> DB update -> WebSocket emit -> Frontend update.
    *   Test API endpoints with authentication and validation.
*   **End-to-End Tests:** Simulate user interaction: creating a chat, sending messages, verifying async updates, navigating history, checking report rendering, testing follow-up prompts using history context.
*   **Cloud Tasks Testing:** Set up a local emulator for Cloud Tasks using the Google Cloud SDK.
*   **WebSocket Testing:** Verify real-time updates work as expected, including reconnection and error handling.
*   **Error Handling:** Test AI errors, database errors, task failures, network issues.

## 7. Potential Challenges & Considerations

*   **AI Context Token Limits:** Including full chat history (especially with large code blocks) can exceed AI model token limits. Monitor usage and implement mitigation strategies if needed (truncation, summarization, selective history).
*   **Real-time Complexity:** Ensuring reliable WebSocket connections, disconnections, and state synchronization can be complex.
*   **Task Monitoring:** Set up appropriate monitoring for the Cloud Tasks queue via the Google Cloud Console, considering:
    *   Setting appropriate retry policies (match existing `neuroledger-quality-audit-queue` settings)
    *   Enabling stack trace logging for failed tasks
    *   Setting up alerts for excessive failures
*   **Database Performance:** Ensure database indexes are correctly implemented for efficient querying of chat sessions and messages, especially as history grows.
*   **Migration:** If there's existing `PromptHistory` data, decide if/how to migrate it to the new `ChatSession` structure (potentially creating default sessions).
*   **Cloud Tasks Security:** Verify that the Cloud Tasks authentication is correctly configured and tested, particularly the OIDC token validation.
*   **Backward Compatibility:** Ensure existing prompt endpoints continue to work during the transition period, potentially by adding the new fields with sensible defaults.
