# Chat Feature

This feature implements persistent, contextual chat history with asynchronous AI response generation, now fully integrated with the Dashboard interface.

## Overview

The chat feature allows users to:

- Create and manage chat sessions (now displayed in the Sidebar)
- Send messages to a chat session
- Receive AI-generated responses in real-time via WebSockets
- View past conversations and their generated reports
- Benefit from contextual AI responses that include history

## Directory Structure

```
frontend/src/features/chat/
├── components/          # UI components for displaying chat elements
│   ├── ChatDetail.jsx   # Displays messages for a selected session (rendered within Dashboard)
│   ├── ChatInput.jsx    # Input component (rendered within Dashboard/potentially modified as PromptInput)
│   ├── ChatMessage.jsx  # Renders a single message bubble
│   ├── ChatSessionItem.jsx # Renders a session in the list, including rename/delete controls (rendered within Sidebar)
│   └── ChatSessionList.jsx # Container for session items (not currently used directly in main layout)
├── context/
│   └── ChatContext.jsx   # Context provider for all chat state and actions
├── hooks/
│   └── useSocket.js      # Hook for managing Socket.IO connection and events
├── services/
│   └── chat.api.js       # API service wrapper for chat endpoints
├── ChatPage.jsx          # A potential standalone page structure (currently DashboardPage is primary)
├── index.js              # Exports chat feature components/context
├── README.md             # This file
```

## Integration with Dashboard

The chat feature has been merged into the Dashboard to provide a unified experience:

1. **Chat Sessions in Sidebar**:
   - Chat sessions are now displayed in the Sidebar component
   - Users can create new sessions and switch between them
   - Sessions persist across page refreshes

2. **ChatContext as Central State Manager**:
   - `ChatContext` provides sessions, messages, and actions to the Dashboard
   - Real-time updates with Socket.IO maintain message state
   - Dataset context is established with the first message and maintained

3. **Dataset Context Locking**:
   - First message establishes dataset context for the entire session
   - Dataset selection is locked for subsequent messages
   - Users must create a new session to analyze different datasets

## API Integration

The feature makes the following API calls:

- `GET /chats` - Get user's chat sessions
- `POST /chats` - Create a new chat session
- `PATCH /chats/:id` - Update a chat session
- `DELETE /chats/:id` - Delete a chat session
- `GET /chats/:id/messages` - Get messages for a chat session
- `POST /chats/:id/messages` - Send a message to a chat session

## Socket.IO Events

Real-time updates are provided by these Socket.IO events:

- `chat:message:processing` - When an AI message is being processed
- `chat:message:completed` - When an AI message is complete
- `chat:message:error` - When an error occurs during AI processing
- `chat:message:fetching_data` - When the AI message is retrieving data

## Dependencies

- React
- Socket.IO Client
- date-fns (for timestamp formatting)
- Tailwind CSS (for styling)

## Usage

Rather than using standalone components, the Dashboard now directly consumes the ChatContext:

```jsx
import { useChat } from '../../features/chat/context/ChatContext';

function DashboardPage() {
  const { 
    sessions, 
    currentSession, 
    messages, 
    sendMessage,
    loadMessages
  } = useChat();
  
  // Use chat state and functions for UI
}