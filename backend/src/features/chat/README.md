# Chat Feature

This feature implements persistent, contextual chat history with asynchronous AI report generation and code generation abilities.

## Overview

The chat feature allows users to:
- Create and manage chat sessions
- Send messages to a chat session
- Receive AI-generated responses in real-time via WebSockets
- Generate AI-powered React code components for data visualization
- View past conversations and their generated reports
- Benefit from contextual AI responses that include history

## Models

### ChatSession
Represents a persistent conversation thread owned by a user.

```javascript
{
  userId: ObjectId, // References User
  teamId: ObjectId?, // Optional, references Team
  title: String,
  associatedDatasetIds: [ObjectId], // IDs of datasets associated with this session (set on first message)
  createdAt: Date,
  updatedAt: Date
}
```

### PromptHistory
Stores individual messages in a chat session and standalone prompt results. Key fields:

```javascript
{
  _id: ObjectId,
  userId: ObjectId, // User who created message
  chatSessionId: ObjectId, // References ChatSession (null for standalone prompts)
  promptText: String?, // User's input (null/empty for AI)
  messageType: enum('user', 'ai_report'), // Type of message
  selectedDatasetIds: [ObjectId], // Datasets used as context for this specific message generation
  aiGeneratedCode: String?, // Generated code (for reports)
  aiResponseText: String?, // Generated text response (fallback)
  reportDatasets: Array<{ name: string, content: string | null, error: string | null }>?, // Fetched dataset content for rendering
  status: enum('processing', 'generating_code', 'fetching_data', 'completed', 'error', 'error_generating', 'error_fetching_data'),
  errorMessage: String?,
  createdAt: Date,
  contextSent: String?, // Debug: actual context sent to AI
  claudeModelUsed: String?, // Model version used
  durationMs: Number? // Processing time
}
```

## Key Components

### API Endpoints (`chat.routes.js`)

#### Chat Session Management
- `POST /chats` - Create a new chat session
- `GET /chats` - List user's chat sessions
- `GET /chats/:sessionId` - Get chat session details
- `PATCH /chats/:sessionId` - Update chat session (e.g., title)
- `DELETE /chats/:sessionId` - Delete chat session and messages

#### Chat Messages
- `POST /chats/:sessionId/messages` - Send a message to a chat session
- `GET /chats/:sessionId/messages` - List messages in a chat session
- `GET /chats/:sessionId/messages/:messageId` - Get a specific message

#### Code Generation
- `POST /prompts` - Generate JavaScript React code based on prompt and datasets

#### Asynchronous Processing
- `POST /internal/chat-ai-worker` - Internal endpoint for Cloud Tasks worker

### Controllers
- `chat.controller.js`: Handles HTTP requests and responses for chat endpoints
- `prompt.controller.js`: Handles HTTP requests and responses for code generation

### Services
- `chat.service.js`: Contains business logic for chat sessions and messages
  - Creating, reading, updating, and deleting chat sessions
  - Adding messages: Creates user message & AI placeholder, queues task
  - Associates dataset IDs with the session on the first message
  - Retrieving message history
- `prompt.service.js`: Contains business logic for AI code generation
  - Assembles context from user profiles, team settings, and datasets
  - Interacts with Claude API to generate React code
  - Processes and validates AI responses

### System Prompt Template (`system-prompt-template.js`)
Exports a function that generates detailed instructions for Claude on how to format React component code:
- Creates structured instructions using user context, dataset context, and user prompt
- Instructs Claude to generate only the body of a JavaScript React functional component
- Ensures generated code uses React.createElement syntax (not JSX)
- Specifies that the component must accept datasets props and reference global libraries

### Task Handler (`chat.taskHandler.js`)
Processes AI response generation asynchronously:
- Handles Cloud Tasks worker requests
- Builds chat history context from previous messages
- Calls the prompt service with context (using session's associated datasets)
- Fetches actual dataset content from GCS based on session's associated dataset IDs
- Updates AI message status and content (including `aiGeneratedCode`/`aiResponseText` and `reportDatasets`)
- Triggers WebSocket events on status changes and completion

## Workflow

### Chat Flow
1. User creates a chat session.
2. User sends a message:
   - User message saved to database
   - If first message, provided `selectedDatasetIds` are saved to `ChatSession.associatedDatasetIds`
   - AI response placeholder (`PromptHistory` record with `status='processing'`) created
   - Cloud Task queued for processing (payload includes `aiMessageId`, `chatSessionId`, and `sessionDatasetIds`)
3. Cloud Task worker (`chat.taskHandler.js`) processes the message:
   - Builds context from chat history
   - Updates AI message status to `generating_code`, emits `chat:message:processing` via WebSocket
   - Generates AI response (code/text) using Claude
   - Updates AI message status to `fetching_data`, emits `chat:message:fetching_data` via WebSocket
   - Fetches content for `sessionDatasetIds` from GCS
   - Saves completed response (`aiGeneratedCode`/`aiResponseText`) and fetched data (`reportDatasets`) to the AI `PromptHistory` record, updating status to `completed`
   - Emits `chat:message:completed` via WebSocket, sending the entire updated AI `PromptHistory` object as the payload
   - (If errors occur, updates status to `error...`, saves `errorMessage`, emits `chat:message:error`)
4. Frontend receives real-time update via WebSocket and updates the specific message in the UI.
5. User can send follow-up messages that include context from previous exchanges (using the session's locked `associatedDatasetIds`).

### Standalone Code Generation Flow
1. Frontend sends request to `POST /prompts` with `promptText` and `selectedDatasetIds`
2. Controller (`prompt.controller.js::generateAndExecuteReport`) validates request and calls prompt service
3. Service (`prompt.service.js::generateCode`) assembles context:
   - Retrieves user settings (aiContext, currency, date format)
   - Retrieves team AI context settings
   - Retrieves metadata for selected datasets
   - Formats information into structured context string
4. Service generates system prompt using `system-prompt-template.js`
5. Service calls Claude API to generate React component code
6. Service extracts and validates the code, updates PromptHistory record
7. Service returns code string to the controller, which sends it back to the frontend
8. Frontend executes the code in a sandboxed iframe environment

## Data Model Interaction

* **Primary Models:**
  * `PromptHistory` - Stores messages, code generation, and status
  * `ChatSession` - Manages persistent conversations
  
* **Supporting Models (Read-only for context):**
  * `User` - For user settings and context
  * `Dataset` - For metadata of selected datasets
  * `Team` - For team settings and context
  * `TeamMember` - To find user's teams

## Dependencies

- `cloudTasks.service.js` - For asynchronous processing
- Socket.IO - For real-time updates
- Anthropic Claude API - For AI code and response generation

## Security

- All endpoints require authentication
- Subscription validation
- User can only access their own chat sessions and data
- Cloud Tasks authentication uses OIDC tokens 