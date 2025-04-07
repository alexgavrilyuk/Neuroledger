# Chat Feature

This feature implements persistent, contextual chat history with asynchronous AI response generation.

## Overview

The chat feature allows users to:

- Create and manage chat sessions
- Send messages to a chat session
- Receive AI-generated responses in real-time via WebSockets
- View past conversations and their generated reports
- Benefit from contextual AI responses that include history

## Directory Structure

```
frontend/src/features/chat/
├── components/           # UI components
│   ├── ChatDetail.jsx    # Displays messages for a selected chat session
│   ├── ChatInput.jsx     # Input form for sending messages
│   ├── ChatMessage.jsx   # Individual message display component
│   ├── ChatSessionItem.jsx # Individual session list item
│   └── ChatSessionList.jsx # List of chat sessions
├── context/
│   └── ChatContext.jsx   # Context provider for chat state management
├── hooks/
│   └── useSocket.js      # Hook for WebSocket integration
├── services/
│   └── chat.api.js       # API service for chat data fetching
├── ChatPage.jsx          # Main chat page component
├── index.js              # Feature exports
└── README.md             # This file
```

## Installation

Before using this feature, ensure you have the required dependencies:

```bash
npm install socket.io-client date-fns react-syntax-highlighter --save
```

## Usage

### Adding Chat to a Route

```jsx
// In your app's routes file
import ChatPage from './features/chat';

// Add the route
{
  path: '/chat',
  element: <ChatPage />
}
```

### Using Chat Components Individually

```jsx
import { ChatProvider, useChat } from './features/chat';
import { ChatDetail, ChatInput } from './features/chat/components';

// Wrap your component with the provider
const MyChatComponent = () => {
  return (
    <ChatProvider>
      <MyCustomLayout>
        <ChatDetail />
        <ChatInput />
      </MyCustomLayout>
    </ChatProvider>
  );
};
```

### Using the Chat Context Hook

```jsx
import { useChat } from './features/chat';

const ChatInfo = () => {
  const { sessions, currentSession, messages, sendMessage } = useChat();
  
  return (
    <div>
      <p>Active session: {currentSession?.title}</p>
      <p>Total messages: {messages.length}</p>
      <button onClick={() => sendMessage("Hello AI!")}>
        Send Test Message
      </button>
    </div>
  );
};
```

## WebSocket Integration

The chat feature uses Socket.IO for real-time communication with the backend. The WebSocket connection is automatically established when the chat context is initialized and subscribes to the following events:

- `chat:message:processing` - When an AI message is being processed
- `chat:message:completed` - When an AI message is complete
- `chat:message:error` - When an error occurs during AI processing

## API Integration

The feature makes the following API calls:

- `GET /chats` - Get user's chat sessions
- `POST /chats` - Create a new chat session
- `PATCH /chats/:id` - Update a chat session
- `DELETE /chats/:id` - Delete a chat session
- `GET /chats/:id/messages` - Get messages for a chat session
- `POST /chats/:id/messages` - Send a message to a chat session

## Customization

### Theming

The components use Tailwind CSS classes with dark mode support. They inherit from the main application theme.

### DatasetSelector Integration

The `ChatInput` component accepts a `datasetSelectEnabled` prop to show/hide the dataset selector:

```jsx
<ChatInput datasetSelectEnabled={false} />
```

## Dependencies

- React
- Socket.IO Client
- date-fns (for timestamp formatting)
- react-syntax-highlighter (for code display)
- Tailwind CSS (for styling) 