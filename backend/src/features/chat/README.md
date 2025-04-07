# Chat Feature

This feature implements persistent, contextual chat history with asynchronous AI report generation.

## Overview

The chat feature allows users to:
- Create and manage chat sessions
- Send messages to a chat session
- Receive AI-generated responses in real-time via WebSockets
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
  createdAt: Date,
  updatedAt: Date
}
```

### PromptHistory (Modified)
Stores individual messages in a chat session, with enhanced fields:

```javascript
{
  // Existing fields...
  chatSessionId: ObjectId?, // References ChatSession
  messageType: enum('user', 'ai_report', 'ai_error', 'system'),
  // Other existing fields...
}
```

## Key Components

### API Endpoints (`chat.routes.js`)

- `POST /chats` - Create a new chat session
- `GET /chats` - List user's chat sessions
- `GET /chats/:sessionId` - Get chat session details
- `PATCH /chats/:sessionId` - Update chat session (e.g., title)
- `DELETE /chats/:sessionId` - Delete chat session and messages
- `POST /chats/:sessionId/messages` - Send a message to a chat session
- `GET /chats/:sessionId/messages` - List messages in a chat session
- `GET /chats/:sessionId/messages/:messageId` - Get a specific message
- `POST /internal/chat-ai-worker` - Internal endpoint for Cloud Tasks worker

### Controller (`chat.controller.js`)

Handles HTTP requests and responses for all chat endpoints.

### Service (`chat.service.js`)

Contains business logic for chat sessions and messages:
- Creating, reading, updating, and deleting chat sessions
- Adding messages and triggering asynchronous AI processing
- Retrieving message history

### Task Handler (`chat.taskHandler.js`)

Processes AI response generation asynchronously:
- Handles Cloud Tasks worker requests
- Builds chat history context from previous messages
- Calls the prompt service with context
- Updates message status and content
- Triggers WebSocket events on completion

## Workflow

1. User creates a chat session
2. User sends a message:
   - Message saved to database
   - AI response placeholder created
   - Cloud Task queued for processing
3. Cloud Task worker processes the message:
   - Builds context from chat history
   - Generates AI response using Claude
   - Saves completed response to database
   - Emits WebSocket event
4. Frontend receives real-time update via WebSocket
5. User can send follow-up messages that include context from previous exchanges

## Dependencies

- `cloudTasks.service.js` - For asynchronous processing
- `prompt.service.js` - For AI code generation
- Socket.IO - For real-time updates

## Security

- All chat endpoints require authentication
- Subscription validation
- User can only access their own chat sessions
- Cloud Tasks authentication uses OIDC tokens 