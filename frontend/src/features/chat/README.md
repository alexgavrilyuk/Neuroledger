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
├── components/          # Base UI components (mostly used within context now)
│   ├── ChatDetail.jsx   # Used in legacy standalone chat (now integrated into Dashboard) 
│   ├── ChatInput.jsx    # Base input component (Dashboard now uses PromptInput)
│   ├── ChatMessage.jsx  # Message display component
│   ├── ChatSessionItem.jsx # Individual session list item
│   └── ChatSessionList.jsx # List of chat sessions (now in Sidebar)
├── context/
│   └── ChatContext.jsx   # Context provider for chat state management
├── hooks/
│   └── useSocket.js      # Hook for WebSocket integration
├── services/
│   └── chat.api.js       # API service for chat data fetching
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